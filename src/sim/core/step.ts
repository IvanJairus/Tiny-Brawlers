import { EMPTY_INPUT, decodeAim, decodeMove } from '../input/actions';
import {
  ARENA_SURFACE_Y, BASE_COORDINATES, BLAST_KNOCK_IMPULSE, CRATE_BONK_DAMAGE, CRATE_DROP_RADIUS,
  CRATE_MAX_ALIVE, CRATE_SPAWN_INTERVAL_S, CRATE_WAVE_MAX, CRATE_WAVE_MIN, HEART_HEAL_AMOUNT,
  MELEE_COOLDOWN_S, MELEE_DAMAGE, MELEE_KNOCK_IMPULSE, MELEE_RANGE, PAD, POWERUP_DURATION_S,
  SHIELD_MAX_HP, VOID_DISTANCE
} from '../domain/constants';
import { CLASS_STATS } from '../domain/classes';
import { applyDamage, distance, knockout, revive, shove, stepBuddy, heal, type BuddyRec } from '../domain/buddy';
import { attachCrateToBuddy, CARRY_HEIGHT, detachCrate, makeCrate, placeCrateOnPad, stepCrate, throwCrate, THROW_LIFT, type CrateRec } from '../domain/crate';
import { findBestSlot, isSlotFilled, padOrigin, setSlot, slotPosition } from '../domain/pad';
import { evaluatePad } from '../domain/recipes';
import { blastOf, isFinished, makeProjectile, stepProjectile, type ProjectileRec } from '../domain/projectile';
import { canRecruit, damageBunker, refreshElimination, spawnBuddy, tickReinforcements, tickRespawns } from '../domain/match';
import { aimTurret, makeTank, stepTank, TANK_MAX_HP, type TankRec } from '../domain/tank';
import {
  GRENADE_DAMAGE, MEDKIT_HEAL, ROCKET_DAMAGE, TANK_SHELL_COOLDOWN, TANK_SHELL_DAMAGE, damageOf, weaponOf
} from '../domain/weapon';
import { advanceTeamWanted, botInput, encodeBotInput, makeBotMemory, nextWanted, type BotMemory } from '../ai/bot';
import { emit, findBuddy, findCrate, type World } from './world';
import type { EntityId } from './ids';
import { NO_ENTITY } from './ids';
import type { TeamId } from '../domain/teams';
import {
  damageObstacle, hitObstacleAlongSegment, POWERUP_IDS, resolveCircleObstacles,
  type ObstacleRec, type PowerUpKind
} from '../domain/obstacles';

const BULLET_SPEED = 32;
const ROCKET_SPEED = 20;
const GRENADE_LIFE = 3;

export function stepWorld(w: World, dt: number): void {
  if (w.over) return;
  w.tick++;
  w.clock += dt;

  tickCrateSpawns(w, dt);
  driveBots(w);

  for (const b of w.buddies) {
    const cmd = w.inputs.get(b.id) ?? EMPTY_INPUT;
    const prev = w.prevInputs.get(b.id) ?? EMPTY_INPUT;
    stepBuddy(b, decodeMove(cmd), dt);
    resolveCircleObstacles(b, 0.48, w.obstacles);
    const aim = decodeAim(cmd);
    if (Math.hypot(aim.x, aim.y) > 0.2) b.heading = Math.atan2(aim.x, aim.y);
    if (b.state === 'ko') { w.prevInputs.set(b.id, cmd); continue; }
    handleGrab(w, b, cmd, prev);
    if (cmd.build === 1 && prev.build === 0 && nearOwnPad(b, w)) buildPad(w, b.team, b);
    if (cmd.attack === 1) fireWeapon(w, b);
    w.prevInputs.set(b.id, cmd);
  }

  stepCrates(w, dt);
  stepProjectiles(w, dt);
  stepTanks(w, dt);
  for (const t of w.tanks) {
    if (!t.destroyed) resolveCircleObstacles(t, 1.15, w.obstacles);
  }
  separateBuddies(w);
  separateTanksFromBuddies(w);
  stepPowerUps(w, dt);
  tickHealAuras(w, dt);
  tickRespawns(w, dt);
  tickReinforcements(w, dt);
  recoverFromVoid(w);
  refreshElimination(w);
  reap(w);
}

const BUDDY_RADIUS = 0.48;
const TANK_RADIUS = 1.15;
const MAX_PUSH_PER_PASS = 0.28;

/**
 * Buddies are solid to each other and to tanks: pairs split the overlap evenly
 * and a tank pushes a buddy fully out (the tank is the heavier body). Two
 * iterations let a buddy squeezed between two bodies escape instead of jitter.
 */
function separateBuddies(w: World, iterations = 2): void {
  const minDist = BUDDY_RADIUS * 2;
  for (let pass = 0; pass < iterations; pass++) {
    for (let i = 0; i < w.buddies.length; i++) {
      const a = w.buddies[i];
      if (a.state === 'ko') continue;
      for (let j = i + 1; j < w.buddies.length; j++) {
        const b = w.buddies[j];
        if (b.state === 'ko') continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d >= minDist) continue;
        const nx = d > 1e-4 ? dx / d : 1;
        const nz = d > 1e-4 ? dz / d : 0;
        const push = Math.min(MAX_PUSH_PER_PASS, (minDist - d) / 2);
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
      }
    }
  }
  for (const b of w.buddies) {
    if (b.state !== 'ko') resolveCircleObstacles(b, BUDDY_RADIUS, w.obstacles);
  }
}

function separateTanksFromBuddies(w: World): void {
  for (const t of w.tanks) {
    if (t.destroyed) continue;
    for (const b of w.buddies) {
      if (b.state === 'ko' || b.id === t.driver) continue;
      const dx = b.x - t.x;
      const dz = b.z - t.z;
      const d = Math.hypot(dx, dz);
      const minDist = TANK_RADIUS + BUDDY_RADIUS;
      if (d >= minDist) continue;
      const nx = d > 1e-4 ? dx / d : 1;
      const nz = d > 1e-4 ? dz / d : 0;
      b.x = t.x + nx * minDist;
      b.z = t.z + nz * minDist;
    }
  }
  for (const b of w.buddies) {
    if (b.state !== 'ko') resolveCircleObstacles(b, BUDDY_RADIUS, w.obstacles);
  }
}

function stepPowerUps(w: World, dt: number): void {
  for (const pu of w.powerups) {
    if (pu.dead) continue;
    pu.spin += dt * 2.6;
    pu.life -= dt;
    if (pu.life <= 0) {
      pu.dead = true;
      continue;
    }
    const b = w.buddies.find((buddy) => buddy.state !== 'ko' && distance(buddy, pu) < 1.25);
    if (b) {
      switch (pu.kind) {
        case 'up_hati': {
          const gained = heal(b, HEART_HEAL_AMOUNT);
          emit(w, { kind: 'heal', entity: b.id, amount: gained, at: { x: b.x, z: b.z } });
          break;
        }
        case 'up_perisai': {
          b.shieldHp = SHIELD_MAX_HP;
          b.shieldTimer = POWERUP_DURATION_S;
          break;
        }
        case 'up_api': {
          b.fireTimer = POWERUP_DURATION_S;
          break;
        }
        case 'up_lari': {
          b.speedTimer = POWERUP_DURATION_S;
          break;
        }
        case 'up_bom': {
          b.grenades = Math.min(9, b.grenades + 3);
          b.bombBonus = 1.1;
          if (b.weapon === 'none') b.weapon = 'grenade';
          break;
        }
      }
      pu.dead = true;
      emit(w, { kind: 'powerup', buddy: b.id, powerup: pu.kind, at: { x: pu.x, z: pu.z } });
    }
  }
}

function tickCrateSpawns(w: World, dt: number): void {
  w.crateTimer -= dt;
  if (w.crateTimer > 0) return;
  const activeCount = w.crates.filter((c) => !c.dead).length;
  if (activeCount >= CRATE_MAX_ALIVE) return;
  w.crateTimer = CRATE_SPAWN_INTERVAL_S;
  const desired = CRATE_WAVE_MIN + w.rngWorld.int(CRATE_WAVE_MAX - CRATE_WAVE_MIN + 1);
  const count = Math.min(desired, CRATE_MAX_ALIVE - activeCount);
  for (let i = 0; i < count; i++) {
    const angle = w.rngWorld.float(0, Math.PI * 2);
    const radius = i < 2
      ? w.rngWorld.float(0.8, CRATE_DROP_RADIUS)
      : w.rngWorld.float(1.5, CRATE_DROP_RADIUS + 2.5);
    const pos = { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
    resolveCircleObstacles(pos, 0.65, w.obstacles);
    const crate = makeCrate(w.ids.alloc(), pos.x, 9 + i * 0.8, pos.z);
    w.crates.push(crate);
    emit(w, { kind: 'spawn', entity: crate.id, at: { x: crate.x, z: crate.z } });
  }
}

function driveBots(w: World): void {
  w.seq = (w.seq + 1) % 256;
  for (const b of w.buddies) {
    if (!b.isBot || b.state === 'ko') continue;
    let memory = w.botMemory.get(b.id);
    if (!memory) {
      memory = makeBotMemory();
      w.botMemory.set(b.id, memory);
    }
    w.inputs.set(b.id, encodeBotInput(w.seq, botInput(w, b, memory, w.seq)));
  }
}

function nearOwnPad(b: BuddyRec, w: World): boolean {
  return distance(b, padOrigin(b.team)) < PAD.halfWidth + 2.5;
}

function handleGrab(w: World, b: BuddyRec, cmd: typeof EMPTY_INPUT, prev: typeof EMPTY_INPUT): void {
  if (cmd.grab === 0 || prev.grab === 1) return;

  if (b.carryCrate !== (NO_ENTITY as EntityId)) {
    const crate = findCrate(w, b.carryCrate);
    if (!crate) {
      b.carryCrate = NO_ENTITY as EntityId;
      return;
    }
    const mask = w.pads[b.team];
    const isNearPad = nearOwnPad(b, w);
    const slot = isNearPad ? findBestSlot(mask, b.team, b.x, b.z) : -1;
    if (slot >= 0) {
      const next = setSlot(mask, slot, true);
      if (next !== mask) {
        const p = slotPosition(b.team, slot);
        w.pads[b.team] = next;
        placeCrateOnPad(crate, b.team, slot, p.x, p.y, p.z);
        w.padCrates[b.team].push(crate.id);
        b.carryCrate = NO_ENTITY as EntityId;
        emit(w, { kind: 'place', entity: crate.id, buddy: b.id, team: b.team, slot, at: { x: p.x, z: p.z } });
        return;
      }
    }
    const dirX = Math.sin(b.heading);
    const dirZ = Math.cos(b.heading);
    throwCrate(crate, dirX, dirZ, CLASS_STATS[b.cls].throwForce, THROW_LIFT);
    crate.claimTeam = b.team;
    b.carryCrate = NO_ENTITY as EntityId;
    emit(w, { kind: 'throw', entity: crate.id, buddy: b.id, at: { x: b.x, z: b.z } });
    return;
  }

  const mountable = w.tanks.find((t) => t.team === b.team && !t.destroyed && t.driver === (NO_ENTITY as EntityId) && distance(b, t) < 2.8);
  if (mountable) {
    mountable.driver = b.id;
    emit(w, { kind: 'pickup', entity: mountable.id, buddy: b.id, at: { x: b.x, z: b.z } });
    return;
  }

  const dirX = Math.sin(b.heading);
  const dirZ = Math.cos(b.heading);
  const target = w.crates
    .filter((c) => (c.state === 'loose' || c.state === 'dropping') && c.settled > 0.05 && distance(b, c) < 2.8)
    .sort((x, y) => {
      const dx1 = x.x - b.x; const dz1 = x.z - b.z;
      const dx2 = y.x - b.x; const dz2 = y.z - b.z;
      const d1 = Math.hypot(dx1, dz1); const d2 = Math.hypot(dx2, dz2);
      const dot1 = d1 > 0.01 ? (dx1 * dirX + dz1 * dirZ) / d1 : 1;
      const dot2 = d2 > 0.01 ? (dx2 * dirX + dz2 * dirZ) / d2 : 1;
      return (d1 - dot1 * 0.8) - (d2 - dot2 * 0.8);
    })[0];
  if (!target) return;
  attachCrateToBuddy(target, b.id);
  target.y = CARRY_HEIGHT;
  b.carryCrate = target.id;
  emit(w, { kind: 'pickup', entity: target.id, buddy: b.id, at: { x: b.x, z: b.z } });
}

function stepCrates(w: World, dt: number): void {
  for (const c of w.crates) {
    if (c.state === 'held') {
      const carrier = findBuddy(w, c.heldBy);
      if (!carrier) {
        detachCrate(c);
        continue;
      }
      c.x = carrier.x;
      c.y = CARRY_HEIGHT + Math.sin(w.clock * 8) * 0.04;
      c.z = carrier.z;
      continue;
    }
    if (c.state === 'onPad') continue;

    const wasAirborne = c.y > 0.5;
    stepCrate(c, dt);

    if (c.state === 'thrown' && Math.hypot(c.vx, c.vz) > 2.5) {
      const foe = w.buddies.find(
        (b) => b.state !== 'ko' && c.claimTeam && b.team !== c.claimTeam && !w.eliminated[b.team] && distance(b, c) < 0.9
      );
      if (foe && c.claimTeam) {
        const dealt = applyDamage(foe, CRATE_BONK_DAMAGE);
        emit(w, { kind: 'damage', entity: foe.id, amount: dealt, fromTeam: c.claimTeam, at: { x: foe.x, z: foe.z } });
        if (dealt > 0 && foe.hp <= 0) fell(w, foe);
        c.vx *= -0.25;
        c.vz *= -0.25;
        c.state = 'loose';
      }
    }

    if (wasAirborne && c.y <= 0.5 && c.state === 'loose') landOnPad(w, c);
  }
}

/**
 * A thrown crate only ever joins the pad of the team that threw it, so an
 * enemy can never be supplied by your bad aim.
 */
function landOnPad(w: World, c: CrateRec): void {
  const team = c.claimTeam;
  if (!team || w.eliminated[team]) {
    c.claimTeam = null;
    return;
  }
  const origin = padOrigin(team);
  if (Math.abs(c.x - origin.x) > PAD.halfWidth || Math.abs(c.z - origin.z) > PAD.halfWidth) {
    c.claimTeam = null;
    return;
  }
  const slot = findBestSlot(w.pads[team], team, c.x, c.z);
  if (slot < 0) {
    c.claimTeam = null;
    return;
  }
  const next = setSlot(w.pads[team], slot, true);
  if (next === w.pads[team]) {
    c.claimTeam = null;
    return;
  }
  const p = slotPosition(team, slot);
  w.pads[team] = next;
  placeCrateOnPad(c, team, slot, p.x, p.y, p.z);
  w.padCrates[team].push(c.id);
  c.claimTeam = null;
  emit(w, { kind: 'place', entity: c.id, buddy: NO_ENTITY as EntityId, team, slot, at: { x: p.x, z: p.z } });
}

export function buildPad(w: World, team: TeamId, builder?: BuddyRec): string {
  const mask = w.pads[team];
  const recipe = evaluatePad(mask);
  if (recipe.category === 'empty') return 'empty';

  for (const c of w.crates) {
    if (c.padTeam !== team) continue;
    c.padTeam = null;
    c.padSlot = -1;
    c.dead = true;
    emit(w, { kind: 'despawn', entity: c.id });
  }
  w.pads[team] = 0;
  w.padCrates[team] = [];

  const origin = padOrigin(team);
  const receiver = builder ?? w.buddies.find((b) => b.team === team && b.state !== 'ko');

  switch (recipe.itemType) {
    case 'pistol':
    case 'shotgun':
    case 'bazooka':
      if (receiver) receiver.weapon = recipe.itemType;
      if (recipe.itemType === 'bazooka' && receiver) receiver.rockets = 4;
      break;
    case 'grenade':
      if (receiver) {
        receiver.weapon = 'grenade';
        receiver.grenades = 5;
      }
      break;
    case 'medic':
      if (receiver) receiver.medkits = 3;
      for (const b of w.buddies) if (b.team === team && b.state !== 'ko') heal(b, MEDKIT_HEAL);
      break;
    case 'medic_unit':
    case 'commando':
      // A spawned unit occupies a roster slot. When the squad is already full the
      // recipe still pays out, as a field heal, instead of growing the roster.
      if (canRecruit(w, team)) {
        spawnBuddy(w, team, recipe.itemType === 'medic_unit' ? 'healer' : 'fighter', true);
      } else {
        for (const b of w.buddies) if (b.team === team && b.state !== 'ko') heal(b, 40);
      }
      break;
    case 'tank': {
      const existing = w.tanks.filter((t) => !t.destroyed).length;
      if (existing < 4) w.tanks.push(makeTank(w.ids.alloc(), team, origin.x + 2, origin.z + 2, 0));
      break;
    }
    default:
      for (const b of w.buddies) if (b.team === team && b.state !== 'ko') heal(b, 40);
      break;
  }

  advanceTeamWanted(w, team);
  emit(w, { kind: 'build', team, recipe: recipe.itemType, at: { x: origin.x, z: origin.z } });
  return recipe.id;
}

function fireWeapon(w: World, b: BuddyRec): void {
  if (b.fireCooldown > 0) return;
  if (b.weapon === 'none') {
    performMelee(w, b);
    return;
  }
  const def = weaponOf(b.weapon);
  if (!def) return;
  const dirX = Math.sin(b.heading);
  const dirZ = Math.cos(b.heading);

  if (b.weapon === 'medic') {
    if (b.medkits <= 0) {
      b.weapon = 'none';
      return;
    }
    const ally = w.buddies
      .filter((x) => x.team === b.team && x.id !== b.id && distance(x, b) < def.range && (x.state === 'ko' || x.hp < x.maxHp))
      .sort((x, y) => distance(b, x) - distance(b, y))[0];
    const target = ally ?? b;
    const useless = target.state !== 'ko' && target.hp >= target.maxHp;
    if (useless) return;
    b.medkits--;
    b.fireCooldown = def.cooldown;
    if (target.state === 'ko') {
      target.koTimer = 0;
      revive(target, 1.0);
      emit(w, { kind: 'revive', entity: target.id, at: { x: target.x, z: target.z } });
    } else {
      heal(target, MEDKIT_HEAL);
      emit(w, { kind: 'heal', entity: target.id, amount: MEDKIT_HEAL, at: { x: target.x, z: target.z } });
    }
    if (b.medkits <= 0) b.weapon = 'none';
    return;
  }

  if (b.weapon === 'grenade') {
    if (b.grenades <= 0) {
      b.weapon = 'none';
      return;
    }
    b.grenades--;
    b.fireCooldown = def.cooldown;
    spawnProjectile(
      w,
      'grenade',
      b,
      dirX * 11,
      8,
      dirZ * 11,
      GRENADE_LIFE,
      GRENADE_DAMAGE * (b.fireTimer > 0 ? 1.35 : 1)
    );
    return;
  }

  if (b.weapon === 'bazooka') {
    if (b.rockets <= 0) {
      b.weapon = 'pistol';
      return;
    }
    b.rockets--;
    b.fireCooldown = def.cooldown;
    spawnProjectile(
      w,
      'rocket',
      b,
      dirX * ROCKET_SPEED,
      0,
      dirZ * ROCKET_SPEED,
      def.range / ROCKET_SPEED,
      ROCKET_DAMAGE * (b.fireTimer > 0 ? 1.35 : 1)
    );
    return;
  }

  b.fireCooldown = def.cooldown;
  const bulletLife = def.range / BULLET_SPEED;
  for (let p = 0; p < def.pellets; p++) {
    const spread = def.spread * (p - (def.pellets - 1) / 2);
    const angle = b.heading + spread;
    spawnProjectile(
      w,
      'bullet',
      b,
      Math.sin(angle) * BULLET_SPEED,
      0,
      Math.cos(angle) * BULLET_SPEED,
      bulletLife,
      damageOf(b.cls, def) * (b.fireTimer > 0 ? 1.35 : 1)
    );
  }
  emit(w, { kind: 'shot', entity: b.id, weapon: b.weapon, at: { x: b.x, z: b.z }, dir: b.heading });
}

function performMelee(w: World, b: BuddyRec): void {
  b.fireCooldown = MELEE_COOLDOWN_S;
  b.meleeTimer = 0.26;
  const dirX = Math.sin(b.heading);
  const dirZ = Math.cos(b.heading);
  emit(w, { kind: 'melee', entity: b.id, at: { x: b.x + dirX * 0.7, z: b.z + dirZ * 0.7 }, dir: b.heading });

  // Team Buddies PS1 "Pop the Pad": punching your own stacked pad triggers buildPad!
  if (!b.isBot && nearOwnPad(b, w) && w.pads[b.team] !== 0) {
    buildPad(w, b.team, b);
  }

  const punchDmg = Math.round(
    MELEE_DAMAGE * CLASS_STATS[b.cls].damageMultiplier * (b.fireTimer > 0 ? 1.35 : 1)
  );

  const targets: Array<{ foe: BuddyRec; dx: number; dz: number; d: number }> = [];
  for (const foe of w.buddies) {
    if (foe.team === b.team || foe.state === 'ko' || w.eliminated[foe.team]) continue;
    const dx = foe.x - b.x;
    const dz = foe.z - b.z;
    const d = Math.hypot(dx, dz);
    if (d > MELEE_RANGE) continue;
    const dot = d > 1e-4 ? (dx / d) * dirX + (dz / d) * dirZ : 1;
    if (dot < -0.25 && d > 0.85) continue;
    targets.push({ foe, dx, dz, d });
  }
  targets.sort((a, bTarget) => a.d - bTarget.d);

  for (const { foe, dx, dz, d } of targets.slice(0, 2)) {
    // Disarm enemy crate carrier so crate drops loose and can be stolen!
    if (foe.carryCrate !== (NO_ENTITY as EntityId)) {
      const carried = findCrate(w, foe.carryCrate);
      if (carried) {
        detachCrate(carried);
        carried.x = foe.x + dirX * 0.65;
        carried.z = foe.z + dirZ * 0.65;
        carried.y = 0.55;
        carried.settled = 0.3;
        carried.claimTeam = null;
      }
      foe.carryCrate = NO_ENTITY as EntityId;
    }

    const dealt = applyDamage(foe, punchDmg);
    const pushX = d > 1e-4 ? dx / d : dirX;
    const pushZ = d > 1e-4 ? dz / d : dirZ;
    shove(foe, pushX * MELEE_KNOCK_IMPULSE, pushZ * MELEE_KNOCK_IMPULSE);
    emit(w, { kind: 'damage', entity: foe.id, amount: dealt, fromTeam: b.team, at: { x: foe.x, z: foe.z } });
    if (dealt > 0 && foe.hp <= 0) fell(w, foe);
  }

  // Punch soft bricks in front of the buddy
  const reachX = b.x + dirX * 1.35;
  const reachZ = b.z + dirZ * 1.35;
  for (const obs of w.obstacles) {
    if (obs.dead || obs.kind !== 'soft') continue;
    if (Math.hypot(obs.x - reachX, obs.z - reachZ) <= obs.halfSize + 0.85) {
      hitSoftBrick(w, obs, 30);
      break;
    }
  }
}

function hitSoftBrick(w: World, obs: ObstacleRec, amount: number): void {
  const broke = damageObstacle(obs, amount);
  if (broke) {
    emit(w, { kind: 'brickBreak', entity: obs.id, at: { x: obs.x, z: obs.z } });
    const roll = w.rngWorld.float(0, 1);
    if (roll < 0.55) {
      const kind: PowerUpKind = POWERUP_IDS[w.rngWorld.int(POWERUP_IDS.length)];
      w.powerups.push({
        id: (w.nextAuxId++) as EntityId,
        kind,
        x: obs.x,
        z: obs.z,
        y: 0.5,
        spin: 0,
        life: 18,
        dead: false
      });
    } else if (roll < 0.78 && w.crates.filter((c) => !c.dead).length < CRATE_MAX_ALIVE) {
      const crate = makeCrate(w.ids.alloc(), obs.x, 1.2, obs.z);
      w.crates.push(crate);
      emit(w, { kind: 'spawn', entity: crate.id, at: { x: crate.x, z: crate.z } });
    }
  } else {
    emit(w, { kind: 'brickHit', entity: obs.id, hp: obs.hp, at: { x: obs.x, z: obs.z } });
  }
}

function spawnProjectile(
  w: World, kind: ProjectileRec['kind'], owner: BuddyRec,
  vx: number, vy: number, vz: number, fuse: number, damage: number
): void {
  const radius = kind === 'bullet' ? 0 : kind === 'shell' ? 2.2 : kind === 'grenade' ? 3.4 + owner.bombBonus : 4.6;
  // Spawning at the owner's center means the swept checks cover the whole flight:
  // a muzzle offset used to skip the first stretch and let point-blank shots
  // pass through walls and enemies.
  w.projectiles.push(makeProjectile({
    kind, team: owner.team, owner: owner.id,
    x: owner.x, y: ARENA_SURFACE_Y + 1.1, z: owner.z,
    vx, vy, vz, fuse, damage, radius
  }, w.ids.alloc()));
}

function stepProjectiles(w: World, dt: number): void {
  for (const p of w.projectiles) {
    if (p.dead) continue;
    const fromX = p.x;
    const fromZ = p.z;
    stepProjectile(p, dt);

    const hitObs = hitObstacleAlongSegment(fromX, fromZ, p.x, p.z, w.obstacles);
    if (hitObs) {
      p.x = hitObs.x;
      p.z = hitObs.z;
      if (hitObs.kind === 'soft') {
        hitSoftBrick(w, hitObs, p.kind === 'bullet' ? p.damage : 60);
      }
      if (p.kind === 'bullet') {
        p.dead = true;
        continue;
      }
      p.fuse = 0;
    }

    if (p.kind === 'bullet' && w.pads[p.team] !== 0 && distance(p, padOrigin(p.team)) < PAD.halfWidth) {
      const shooter = findBuddy(w, p.owner);
      if (!shooter || !shooter.isBot) {
        buildPad(w, p.team, shooter);
      }
    }

    const hit = w.buddies.find(
      (b) => b.state !== 'ko' && b.team !== p.team && !w.eliminated[b.team] &&
        sweptDistance(fromX, fromZ, p.x, p.z, b.x, b.z) < 0.9
    );
    if (hit) {
      p.fuse = 0;
      if (p.kind === 'bullet' || p.kind === 'shell') {
        directHit(w, p, hit);
        p.dead = true;
        continue;
      }
    }
    if (p.kind !== 'shell' && p.kind !== 'bullet' && p.y <= 0.15) p.fuse = Math.min(p.fuse, 0.05);
    if (p.kind !== 'shell' && p.kind !== 'bullet' && nearEnemyBunker(w, p)) p.fuse = 0;
    if (p.fuse <= 0) {
      if (p.kind !== 'bullet') {
        explode(w, p);
      }
      p.dead = true;
    }
  }
}

function sweptDistance(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-9) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function nearEnemyBunker(w: World, p: ProjectileRec): boolean {
  for (const team of Object.keys(BASE_COORDINATES) as TeamId[]) {
    if (team === p.team || w.eliminated[team]) continue;
    const base = BASE_COORDINATES[team];
    if (Math.hypot(base.x - p.x, base.z - p.z) < 3) return true;
  }
  return false;
}

function directHit(w: World, p: ProjectileRec, target: BuddyRec): void {
  const dealt = applyDamage(target, p.damage);
  emit(w, { kind: 'damage', entity: target.id, amount: dealt, fromTeam: p.team, at: { x: target.x, z: target.z } });
  if (dealt > 0 && target.hp <= 0) fell(w, target);
}

function explode(w: World, p: ProjectileRec): void {
  const { radius, damage } = blastOf(p);
  emit(w, { kind: 'explosion', entity: p.id, radius, at: { x: p.x, z: p.z } });
  for (const b of w.buddies) {
    if (b.state === 'ko') continue;
    const d = distance(b, p);
    if (d > radius) continue;
    const falloff = 1 - (d / radius) * 0.82;
    // The blast shoves everyone caught in it (allies included) but only hurts
    // enemies, so a misthrown grenade still lets you rocket-shove your own squad.
    const nx = d > 1e-4 ? (b.x - p.x) / d : 0;
    const nz = d > 1e-4 ? (b.z - p.z) / d : 0;
    shove(b, nx * BLAST_KNOCK_IMPULSE * falloff, nz * BLAST_KNOCK_IMPULSE * falloff);
    if (b.team === p.team || w.eliminated[b.team]) continue;
    const dealt = applyDamage(b, damage * falloff);
    emit(w, { kind: 'damage', entity: b.id, amount: dealt, fromTeam: p.team, at: { x: b.x, z: b.z } });
    if (dealt > 0 && b.hp <= 0) fell(w, b);
  }
  for (const team of Object.keys(BASE_COORDINATES) as TeamId[]) {
    if (team === p.team) continue;
    const base = BASE_COORDINATES[team];
    if (Math.hypot(base.x - p.x, base.z - p.z) > radius + 2.5) continue;
    damageBunker(w, team, damage * 0.5, p.team);
  }
  for (const obs of w.obstacles) {
    if (obs.dead || obs.kind !== 'soft') continue;
    if (Math.hypot(obs.x - p.x, obs.z - p.z) <= radius + 0.9) {
      hitSoftBrick(w, obs, damage * 0.5);
    }
  }
}

/** Public so a test or a net event can apply the same drop rules as any hit. */
export function fell(w: World, target: BuddyRec): void {
  const carried = target.carryCrate !== (NO_ENTITY as EntityId) ? findCrate(w, target.carryCrate) : undefined;
  if (carried) {
    detachCrate(carried);
    carried.x = target.x;
    carried.z = target.z;
    carried.y = 0.6;
    carried.claimTeam = null;
  }
  target.carryCrate = NO_ENTITY as EntityId;
  knockout(target, 5);
  emit(w, { kind: 'knockout', entity: target.id, at: { x: target.x, z: target.z } });
}

function stepTanks(w: World, dt: number): void {
  for (const t of w.tanks) {
    if (t.destroyed) continue;
    const driver = t.driver !== (NO_ENTITY as EntityId) ? findBuddy(w, t.driver) : undefined;
    if (driver && driver.state === 'ko') t.driver = NO_ENTITY as EntityId;
    if (driver) {
      const cmd = w.inputs.get(driver.id) ?? EMPTY_INPUT;
      const fwd = -cmd.my / 127;
      stepTank(t, { fwd, turn: cmd.mx / 127 }, dt);
      aimTankFire(w, t, driver);
    } else {
      const target = w.buddies
        .filter((b) => b.team !== t.team && b.state !== 'ko' && !w.eliminated[b.team])
        .sort((a, b) => distance(a, t) - distance(b, t))[0];
      if (target && distance(target, t) < 20) aimTank(w, t, target, dt);
    }
  }
}

function aimTank(w: World, t: TankRec, target: BuddyRec, dt: number): void {
  const angle = Math.atan2(target.x - t.x, target.z - t.z);
  aimTurret(t, angle, dt);
  if (Math.abs(((angle - t.turretAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.08 && t.fireCooldown <= 0) fireTank(w, t);
}

function aimTankFire(w: World, t: TankRec, driver: BuddyRec): void {
  if (t.fireCooldown > 0) return;
  if (driver.fireCooldown > 0) return;
  const cmd = w.inputs.get(driver.id) ?? EMPTY_INPUT;
  if (cmd.attack === 0) return;
  fireTank(w, t);
  driver.fireCooldown = TANK_SHELL_COOLDOWN;
}

function fireTank(w: World, t: TankRec): void {
  t.fireCooldown = TANK_SHELL_COOLDOWN;
  const vx = Math.sin(t.turretAngle) * 30;
  const vz = Math.cos(t.turretAngle) * 30;
  w.projectiles.push(makeProjectile({
    kind: 'shell', team: t.team, owner: t.driver,
    x: t.x + vx * 0.05, y: 1.4, z: t.z + vz * 0.05, vx, vy: 0, vz,
    fuse: 1.2, damage: TANK_SHELL_DAMAGE, radius: 2.2
  }, w.ids.alloc()));
  emit(w, { kind: 'shot', entity: t.id, weapon: 'tank', at: { x: t.x, z: t.z }, dir: t.turretAngle });
}

function tickHealAuras(w: World, dt: number): void {
  for (const b of w.buddies) {
    if (b.state === 'ko' || w.eliminated[b.team]) continue;
    const stats = CLASS_STATS[b.cls];
    if (stats.healAuraRadius <= 0) continue;
    for (const ally of w.buddies) {
      if (ally.id === b.id || ally.team !== b.team || ally.state === 'ko') continue;
      if (distance(b, ally) > stats.healAuraRadius) continue;
      heal(ally, stats.healPerSecond * dt);
    }
  }
}

function recoverFromVoid(w: World): void {
  for (const b of w.buddies) {
    if (b.state === 'ko' || Math.hypot(b.x, b.z) <= VOID_DISTANCE) continue;
    const base = BASE_COORDINATES[b.team];
    b.x = base.x * 0.74;
    b.z = base.z * 0.74;
    knockout(b, 3);
    emit(w, { kind: 'knockout', entity: b.id, at: { x: b.x, z: b.z } });
  }
  for (const c of w.crates) {
    if (c.state === 'held' || c.state === 'onPad') continue;
    if (Math.hypot(c.x, c.z) <= VOID_DISTANCE && c.y > -5) continue;
    c.dead = true;
  }
}

function reap(w: World): void {
  let deadCrates = false;
  for (const c of w.crates) {
    if (c.dead) {
      w.ids.free(c.id);
      deadCrates = true;
    }
  }
  let deadProjectiles = false;
  for (const p of w.projectiles) {
    if (p.dead || isFinished(p)) {
      w.ids.free(p.id);
      deadProjectiles = true;
    }
  }
  let deadTanks = false;
  for (const t of w.tanks) {
    if (t.destroyed) {
      w.ids.free(t.id);
      deadTanks = true;
    }
  }

  let deadBuddies = false;
  for (const b of w.buddies) {
    if (!b.remove) continue;
    deadBuddies = true;
    w.ids.free(b.id);
    w.inputs.delete(b.id);
    w.prevInputs.delete(b.id);
    w.botMemory.delete(b.id);
    emit(w, { kind: 'despawn', entity: b.id });
  }
  if (deadBuddies) w.buddies = w.buddies.filter((b) => !b.remove);
  if (deadCrates) w.crates = w.crates.filter((c) => !c.dead);
  if (deadProjectiles) w.projectiles = w.projectiles.filter((p) => !p.dead && !isFinished(p));
  if (deadTanks) w.tanks = w.tanks.filter((t) => !t.destroyed);
  if (w.powerups.length > 0 && w.powerups.some((pu) => pu.dead)) {
    w.powerups = w.powerups.filter((pu) => !pu.dead);
  }

  for (const b of w.buddies) {
    if (b.carryCrate !== (NO_ENTITY as EntityId) && !findCrate(w, b.carryCrate)) b.carryCrate = NO_ENTITY as EntityId;
  }
  for (const [id] of w.prevInputs) if (!findBuddy(w, id)) w.prevInputs.delete(id);
  for (const [id, memory] of w.botMemory) {
    const owner = findBuddy(w, id);
    if (!owner) {
      w.botMemory.delete(id);
      continue;
    }
    const mask = w.pads[owner.team];
    if (isSlotFilled(mask, 7) && memory.wanted !== 'tank') nextWanted(memory);
  }
}

export { TANK_MAX_HP };

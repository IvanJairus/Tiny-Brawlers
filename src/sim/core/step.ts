import { EMPTY_INPUT, decodeAim, decodeMove } from '../input/actions';
import {
  ARENA_SURFACE_Y, BASE_COORDINATES, CRATE_DROP_RADIUS, CRATE_MAX_ALIVE, CRATE_SPAWN_INTERVAL_S,
  PAD, VOID_DISTANCE
} from '../domain/constants';
import { CLASS_STATS } from '../domain/classes';
import { applyDamage, distance, knockout, revive, stepBuddy, heal, type BuddyRec } from '../domain/buddy';
import { attachCrateToBuddy, detachCrate, makeCrate, placeCrateOnPad, stepCrate, throwCrate, type CrateRec } from '../domain/crate';
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

const SHELL_SPEED = 58;
const SHELL_LIFE = 0.45;
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
  tickHealAuras(w, dt);
  tickRespawns(w, dt);
  tickReinforcements(w, dt);
  recoverFromVoid(w);
  refreshElimination(w);
  reap(w);
}

function tickCrateSpawns(w: World, dt: number): void {
  w.crateTimer -= dt;
  if (w.crateTimer > 0 || w.crates.length >= CRATE_MAX_ALIVE) return;
  w.crateTimer = CRATE_SPAWN_INTERVAL_S;
  const angle = w.rngWorld.float(0, Math.PI * 2);
  const radius = w.rngWorld.float(0, CRATE_DROP_RADIUS);
  const crate = makeCrate(w.ids.alloc(), Math.cos(angle) * radius, 9, Math.sin(angle) * radius);
  w.crates.push(crate);
  emit(w, { kind: 'spawn', entity: crate.id, at: { x: crate.x, z: crate.z } });
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
  return distance(b, padOrigin(b.team)) < PAD.halfWidth + 1.3;
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
    const slot = nearOwnPad(b, w) ? findBestSlot(mask, b.team, b.x, b.z) : -1;
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
    throwCrate(crate, dirX, dirZ, CLASS_STATS[b.cls].throwForce, 5.5);
    crate.claimTeam = b.team;
    b.carryCrate = NO_ENTITY as EntityId;
    emit(w, { kind: 'throw', entity: crate.id, buddy: b.id, at: { x: b.x, z: b.z } });
    return;
  }

  const mountable = w.tanks.find((t) => t.team === b.team && !t.destroyed && t.driver === (NO_ENTITY as EntityId) && distance(b, t) < 2.4);
  if (mountable) {
    mountable.driver = b.id;
    emit(w, { kind: 'pickup', entity: mountable.id, buddy: b.id, at: { x: b.x, z: b.z } });
    return;
  }

  const target = w.crates
    .filter((c) => (c.state === 'loose' || c.state === 'dropping') && c.settled > 0.2 && distance(b, c) < 1.5)
    .sort((x, y) => distance(b, x) - distance(b, y))[0];
  if (!target) return;
  attachCrateToBuddy(target, b.id);
  target.y = 1.9;
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
      c.y = 1.9 + Math.sin(w.clock * 8) * 0.04;
      c.z = carrier.z;
      continue;
    }
    if (c.state === 'onPad') continue;

    const wasAirborne = c.y > 0.5;
    stepCrate(c, dt);
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
      revive(target);
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
    spawnProjectile(w, 'grenade', b, dirX * 11, 8, dirZ * 11, GRENADE_LIFE, GRENADE_DAMAGE);
    return;
  }

  if (b.weapon === 'bazooka') {
    if (b.rockets <= 0) {
      b.weapon = 'pistol';
      return;
    }
    b.rockets--;
    b.fireCooldown = def.cooldown;
    spawnProjectile(w, 'rocket', b, dirX * ROCKET_SPEED, 0, dirZ * ROCKET_SPEED, 2.2, ROCKET_DAMAGE);
    return;
  }

  b.fireCooldown = def.cooldown;
  for (let p = 0; p < def.pellets; p++) {
    const spread = def.spread * (p - (def.pellets - 1) / 2);
    const angle = b.heading + spread;
    spawnProjectile(w, 'shell', b, Math.sin(angle) * SHELL_SPEED, 0, Math.cos(angle) * SHELL_SPEED, SHELL_LIFE, damageOf(b.cls, def));
  }
  emit(w, { kind: 'shot', entity: b.id, weapon: b.weapon, at: { x: b.x, z: b.z }, dir: b.heading });
}

function spawnProjectile(
  w: World, kind: ProjectileRec['kind'], owner: BuddyRec,
  vx: number, vy: number, vz: number, fuse: number, damage: number
): void {
  const radius = kind === 'shell' ? 0.8 : kind === 'grenade' ? 3.4 : 4.6;
  w.projectiles.push(makeProjectile({
    kind, team: owner.team, owner: owner.id,
    x: owner.x + vx * 0.02, y: ARENA_SURFACE_Y + 1.1, z: owner.z + vz * 0.02,
    vx, vy, vz, fuse, damage, radius
  }, w.ids.alloc()));
}

function stepProjectiles(w: World, dt: number): void {
  for (const p of w.projectiles) {
    if (p.dead) continue;
    const fromX = p.x;
    const fromZ = p.z;
    stepProjectile(p, dt);

    const hit = w.buddies.find(
      (b) => b.state !== 'ko' && b.team !== p.team && !w.eliminated[b.team] &&
        sweptDistance(fromX, fromZ, p.x, p.z, b.x, b.z) < 0.9
    );
    if (hit) {
      p.fuse = 0;
      if (p.kind === 'shell') {
        directHit(w, p, hit);
        p.dead = true;
        continue;
      }
    }
    if (p.kind !== 'shell' && p.y <= 0.15) p.fuse = Math.min(p.fuse, 0.05);
    if (p.kind !== 'shell' && nearEnemyBunker(w, p)) p.fuse = 0;
    if (p.fuse <= 0) {
      explode(w, p);
      p.dead = true;
    }
  }
}

/**
 * A shell covers about two metres per tick, which is wider than a buddy, so a
 * point test would let fast shots pass straight through their target.
 */
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
    if (b.state === 'ko' || b.team === p.team || w.eliminated[b.team]) continue;
    const d = distance(b, p);
    if (d > radius) continue;
    const falloff = 1 - (d / radius) * 0.6;
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
  for (const c of w.crates) if (c.dead) w.ids.free(c.id);
  for (const p of w.projectiles) if (p.dead || isFinished(p)) w.ids.free(p.id);
  for (const t of w.tanks) if (t.destroyed) w.ids.free(t.id);

  for (const b of w.buddies) {
    if (!b.remove) continue;
    w.ids.free(b.id);
    w.inputs.delete(b.id);
    w.prevInputs.delete(b.id);
    w.botMemory.delete(b.id);
    emit(w, { kind: 'despawn', entity: b.id });
  }
  w.buddies = w.buddies.filter((b) => !b.remove);
  w.crates = w.crates.filter((c) => !c.dead);
  w.projectiles = w.projectiles.filter((p) => !p.dead && !isFinished(p));
  w.tanks = w.tanks.filter((t) => !t.destroyed);

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

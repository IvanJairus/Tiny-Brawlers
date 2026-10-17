import type { World } from '../core/world';
import type { EntityId } from '../core/ids';
import type { BuddyRec } from '../domain/buddy';
import type { CrateRec } from '../domain/crate';
import { encodeInput, type RawAxes } from '../input/actions';
import { findBestSlot, isSlotFilled, padOrigin, slotPosition, totalCrates } from '../domain/pad';
import { evaluatePad } from '../domain/recipes';
import { distance } from '../domain/buddy';
import { BASE_COORDINATES } from '../domain/constants';
import { TEAM_IDS, type TeamId } from '../domain/teams';
import { hitObstacleAlongSegment } from '../domain/obstacles';

export type BotDifficulty = 'mudah' | 'normal' | 'sulit';

export interface BotMemory {
  wanted: string;
  rotation: number;
  idleTimer: number;
  lastCheckX?: number;
  lastCheckZ?: number;
  stuckTicks?: number;
  detourTicks?: number;
  detourSign?: 1 | -1;
}

const DIFFICULTY_TUNING: Record<BotDifficulty, { sight: number; aimJitter: number; fireEvery: number }> = {
  mudah: { sight: 10.0, aimJitter: 0.28, fireEvery: 2 },
  normal: { sight: 12.5, aimJitter: 0.08, fireEvery: 1 },
  sulit: { sight: 14.5, aimJitter: 0.015, fireEvery: 1 }
};

/**
 * Slot sets the bots aim for when filling the pad. Without a target shape a bot
 * builds on its very first crate, which is how six of the seven recipes stopped
 * ever appearing in AI play.
 */
export const RECIPE_SLOTS: Record<string, number[]> = {
  pistol: [0],
  shotgun: [0, 1],
  grenade: [0, 4],
  medicUnit: [0, 1, 4],
  medkit: [0, 1, 2],
  bazooka: [0, 1, 2, 3],
  commando: [0, 1, 4, 5],
  tank: [0, 1, 2, 3, 4, 5, 6, 7]
};

const BUILD_ORDER = ['pistol', 'shotgun', 'grenade', 'medicUnit', 'medkit', 'bazooka', 'commando', 'tank'];

export function makeBotMemory(): BotMemory {
  return {
    wanted: 'pistol',
    rotation: 0,
    idleTimer: 0,
    stuckTicks: 0,
    detourTicks: 0,
    detourSign: 1
  };
}

function maskFor(slots: number[]): number {
  return slots.reduce((m, s) => m | (1 << s), 0);
}

export function nextWanted(memory: BotMemory): string {
  memory.rotation = (memory.rotation + 1) % BUILD_ORDER.length;
  memory.wanted = BUILD_ORDER[memory.rotation];
  return memory.wanted;
}

/**
 * The build target belongs to the team's pad, not the individual bot, so four
 * bots carrying for one pad all aim at the same shape and the pad walks through
 * the whole recipe table instead of rebuilding pistols forever.
 */
export function teamWanted(w: World, team: TeamId): string {
  return BUILD_ORDER[w.padRotation[team] % BUILD_ORDER.length];
}

export function advanceTeamWanted(w: World, team: TeamId): void {
  w.padRotation[team] = (w.padRotation[team] + 1) % BUILD_ORDER.length;
}

function steer(from: { x: number; z: number }, to: { x: number; z: number }, raw: RawAxes, arrive = 0.05, w?: World): void {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < arrive) {
    raw.moveX = 0;
    raw.moveY = 0;
    return;
  }
  let mx = dx / len;
  let mz = dz / len;

  if (w && w.obstacles && w.obstacles.length > 0) {
    const obs = hitObstacleAlongSegment(from.x, from.z, from.x + mx * 1.6, from.z + mz * 1.6, w.obstacles, 0.35);
    if (obs) {
      let tx = -mz;
      let tz = mx;
      const dot = tx * (from.x - obs.x) + tz * (from.z - obs.z);
      if (dot < 0) {
        tx = -tx;
        tz = -tz;
      }
      mx = mx * 0.35 + tx * 0.85;
      mz = mz * 0.35 + tz * 0.85;
      const blendLen = Math.sqrt(mx * mx + mz * mz) || 1;
      mx /= blendLen;
      mz /= blendLen;
    }
  }

  raw.moveX = mx;
  raw.moveY = mz;
}

function applyStuckDetour(me: BuddyRec, memory: BotMemory, raw: RawAxes): void {
  const moving = Math.hypot(raw.moveX, raw.moveY) > 0.2;
  if (!moving) {
    memory.stuckTicks = 0;
    memory.lastCheckX = me.x;
    memory.lastCheckZ = me.z;
    return;
  }

  if ((memory.detourTicks ?? 0) > 0) {
    memory.detourTicks = (memory.detourTicks ?? 1) - 1;
    const sign = memory.detourSign ?? 1;
    const tx = -raw.moveY * sign;
    const tz = raw.moveX * sign;
    const bx = raw.moveX * 0.25 + tx * 0.9;
    const bz = raw.moveY * 0.25 + tz * 0.9;
    const len = Math.hypot(bx, bz) || 1;
    raw.moveX = bx / len;
    raw.moveY = bz / len;
    return;
  }

  if (memory.lastCheckX === undefined || memory.lastCheckZ === undefined) {
    memory.lastCheckX = me.x;
    memory.lastCheckZ = me.z;
    memory.stuckTicks = 0;
    return;
  }

  memory.stuckTicks = (memory.stuckTicks ?? 0) + 1;
  if (memory.stuckTicks >= 30) {
    const moved = Math.hypot(me.x - memory.lastCheckX, me.z - memory.lastCheckZ);
    memory.lastCheckX = me.x;
    memory.lastCheckZ = me.z;
    memory.stuckTicks = 0;
    if (moved < 0.45) {
      memory.detourTicks = 18;
      memory.detourSign = memory.detourSign === 1 ? -1 : 1;
    }
  }
}

function nearestEnemy(w: World, me: BuddyRec, maxSight = 12.5): BuddyRec | null {
  let best: BuddyRec | null = null;
  let bestD = maxSight;
  for (const b of w.buddies) {
    if (b.team === me.team || b.state === 'ko' || w.eliminated[b.team]) continue;
    const d = distance(me, b);
    if (d >= bestD) continue;
    // Strict LOS discipline: do not target or fire if any obstacle blocks the line of sight
    const blocker = hitObstacleAlongSegment(me.x, me.z, b.x, b.z, w.obstacles, 0.05);
    if (blocker) continue;
    bestD = d;
    best = b;
  }
  return best;
}

function nearestLooseCrate(w: World, me: BuddyRec): CrateRec | null {
  let best: CrateRec | null = null;
  let bestScore = Infinity;
  const pad = padOrigin(me.team);
  for (const c of w.crates) {
    if (c.state !== 'loose' && !(c.state === 'thrown' && c.settled > 0.3)) continue;
    const d = distance(me, c);
    let score = d + distance(c, pad) * 0.35;
    for (const ally of w.buddies) {
      if (ally.team === me.team && ally.id !== me.id && ally.state !== 'ko' && ally.carryCrate === (0 as EntityId)) {
        const allyDist = distance(ally, c);
        if (!ally.isBot || ally.ownedByPlayer) {
          // Strongly defer crates that are closer to a human player
          if (allyDist <= d) {
            score += 35.0;
          }
        } else if (allyDist < d * 0.85) {
          score += 5.0;
        }
      }
    }
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

export function botInput(w: World, me: BuddyRec, memory: BotMemory, seq: number): RawAxes {
  const raw: RawAxes = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, attack: false, grab: false, build: false, zoom: 0 };
  if (me.state === 'ko') return raw;

  const diff = DIFFICULTY_TUNING[w.botDifficulty ?? 'normal'] ?? DIFFICULTY_TUNING.normal;
  const enemy = me.weapon !== 'none' ? nearestEnemy(w, me, diff.sight) : null;
  const fighting = enemy !== null;

  if (fighting && enemy) {
    steer(me, enemy, raw, 0.05, w);
    applyStuckDetour(me, memory, raw);
    const baseAngle = Math.atan2(enemy.x - me.x, enemy.z - me.z);
    const jitter = w.rngAi.float(-diff.aimJitter, diff.aimJitter);
    const aimAngle = baseAngle + jitter;
    raw.aimX = Math.sin(aimAngle);
    raw.aimY = Math.cos(aimAngle);
    raw.attack = diff.fireEvery <= 1 || (w.tick + me.id) % diff.fireEvery === 0;
    return raw;
  }

  // During opening 4s of match, bots prioritize gathering crates to base over brawl
  if (w.clock >= 4.0 && me.cls === 'fighter' && me.weapon === 'none' && me.carryCrate === (0 as EntityId)) {
    const carrierFoe = w.buddies.find(
      (b) => b.team !== me.team && b.state !== 'ko' && !w.eliminated[b.team] &&
        b.carryCrate !== (0 as EntityId) && distance(me, b) < 1.55
    );
    if (carrierFoe) {
      raw.aimX = carrierFoe.x - me.x;
      raw.aimY = carrierFoe.z - me.z;
      const aimLen = Math.hypot(raw.aimX, raw.aimY) || 1;
      raw.aimX /= aimLen;
      raw.aimY /= aimLen;
      raw.attack = true;
      steer(me, carrierFoe, raw, 0.05, w);
      applyStuckDetour(me, memory, raw);
      return raw;
    }
  }

  const hostileTeam = nextHostileTeam(w, me.team, seq);

  if (me.carryCrate !== (0 as EntityId)) {
    const mask = w.pads[me.team];
    memory.wanted = teamWanted(w, me.team);
    const target = RECIPE_SLOTS[memory.wanted] ?? RECIPE_SLOTS.pistol;
    const desired = maskFor(target);
    const origin = padOrigin(me.team);
    const atPad = distance(me, origin) < 3.2;
    const shapeReady = totalCrates(mask) === target.length && (mask & desired) === mask;
    const diverged = (mask & ~desired) !== 0;

    // The button is released while walking so the arrival can register as a new
    // press: holding it from the pickup onwards would throw the crate instead.
    if ((shapeReady || diverged || totalCrates(mask) >= 8) && atPad) {
      raw.moveX = 0;
      raw.moveY = 0;
      raw.build = evaluatePad(mask).id !== 'empty';
      if (w.clock < 5.0) raw.build = false;
      return raw;
    }

    const slot = target.find((q) => !isSlotFilled(mask, q));
    const slotWorld = slot === undefined ? origin : slotPosition(me.team, slot);
    steer(me, slotWorld, raw, 0.35, w);
    applyStuckDetour(me, memory, raw);
    // Standing on the intended slot is what decides it: placement resolves to the
    // nearest free quadrant, so a loose approach would drop the crate elsewhere
    // and make the shape diverge from the recipe the team is building.
    if (distance(me, slotWorld) < 0.6) raw.grab = true;
    return raw;
  }

  // The bot that placed the last crate is empty-handed, so the finished shape
  // would wait for the next carrier to trip the press by accident, and a full
  // pad has no shape left it can diverge from.
  const filled = w.pads[me.team];
  const wanted = RECIPE_SLOTS[teamWanted(w, me.team)] ?? RECIPE_SLOTS.pistol;
  const shapeDone = totalCrates(filled) === wanted.length && (filled & maskFor(wanted)) === filled;
  if ((shapeDone || totalCrates(filled) >= 8) && evaluatePad(filled).id !== 'empty') {
    const origin = padOrigin(me.team);
    steer(me, origin, raw, 0.9, w);
    applyStuckDetour(me, memory, raw);
    if (distance(me, origin) < 3.2) raw.build = true;
    if (w.clock < 5.0) raw.build = false;
    return raw;
  }

  const loose = nearestLooseCrate(w, me);
  if (loose) {
    steer(me, loose, raw, 0.05, w);
    applyStuckDetour(me, memory, raw);
    if (distance(me, loose) < 1.4) raw.grab = true;
    return raw;
  }

  if (me.cls === 'healer') {
    for (const ally of w.buddies) {
      if (ally.team === me.team && ally.id !== me.id && ally.state !== 'ko' &&
          ally.hp < ally.maxHp * 0.65 && distance(me, ally) < 9) {
        steer(me, ally, raw, 2.8, w);
        applyStuckDetour(me, memory, raw);
        return raw;
      }
    }
  }

  if (w.powerups.length > 0) {
    let bestPu = null;
    let bestPuD = 4.5;
    for (const p of w.powerups) {
      if (p.dead) continue;
      const d = distance(me, p);
      if (d < bestPuD) {
        bestPuD = d;
        bestPu = p;
      }
    }
    if (bestPu) {
      steer(me, bestPu, raw, 0.05, w);
      applyStuckDetour(me, memory, raw);
      return raw;
    }
  }

  for (const t of w.tanks) {
    if (t.team === me.team && !t.destroyed && t.driver === (0 as EntityId)) {
      steer(me, t, raw, 0.05, w);
      applyStuckDetour(me, memory, raw);
      if (distance(me, t) < 2) raw.grab = true;
      return raw;
    }
  }

  if (hostileTeam) steer(me, BASE_COORDINATES[hostileTeam], raw, 0.05, w);
  else steer(me, padOrigin(me.team), raw, 0.05, w);
  applyStuckDetour(me, memory, raw);
  return raw;
}

function nextHostileTeam(w: World, mine: TeamId, seq: number): TeamId | null {
  let count = 0;
  for (const t of TEAM_IDS) if (!w.eliminated[t] && t !== mine) count++;
  if (count === 0) return null;
  let index = 0;
  const pick = seq % count;
  for (const t of TEAM_IDS) {
    if (t === mine || w.eliminated[t]) continue;
    if (index === pick) return t;
    index++;
  }
  return null;
}

export function encodeBotInput(seq: number, raw: RawAxes): ReturnType<typeof encodeInput> {
  return encodeInput(seq, raw);
}

import type { EntityId } from '../core/ids';
import { CLASS_STATS, type BuddyClass } from '../domain/classes';
import type { TeamId } from '../domain/teams';
import { ARENA_HALF, KNOCK_CONTROL, KNOCK_DECAY, MOVE_ACCEL_S, MOVE_DECEL_S, VOID_DISTANCE } from '../domain/constants';
import type { ItemType } from '../domain/recipes';

export type BuddyState = 'idle' | 'walk' | 'carry' | 'ko' | 'celebrate';

export interface BuddyRec {
  id: EntityId;
  team: TeamId;
  cls: BuddyClass;
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  prevHeading: number;
  vx: number;
  vz: number;
  /** Shove velocity from knockback, decaying exponentially on top of input motion. */
  kx: number;
  kz: number;
  heading: number;
  hp: number;
  maxHp: number;
  state: BuddyState;
  weapon: ItemType;
  grenades: number;
  rockets: number;
  medkits: number;
  carryCrate: EntityId;
  koTimer: number;
  fireCooldown: number;
  invuln: number;
  isBot: boolean;
  ownedByPlayer: boolean;
  remove: boolean;
  meleeTimer: number;
  shieldHp: number;
  shieldTimer: number;
  fireTimer: number;
  speedTimer: number;
  bombBonus: number;
}

export function makeBuddy(
  id: EntityId, team: TeamId, cls: BuddyClass, x: number, z: number, isBot: boolean
): BuddyRec {
  const stats = CLASS_STATS[cls];
  return {
    id, team, cls, x, z, prevX: x, prevZ: z, prevHeading: 0, vx: 0, vz: 0, kx: 0, kz: 0, heading: 0,
    hp: stats.maxHp, maxHp: stats.maxHp,
    state: 'idle', weapon: 'none', grenades: 0, rockets: 0, medkits: 0,
    carryCrate: 0 as EntityId, koTimer: 0, fireCooldown: 0, invuln: 0,
    isBot, ownedByPlayer: false, remove: false,
    meleeTimer: 0, shieldHp: 0, shieldTimer: 0, fireTimer: 0, speedTimer: 0, bombBonus: 0
  };
}

export function speedOf(b: BuddyRec): number {
  const stats = CLASS_STATS[b.cls];
  const base = stats.moveSpeed * (b.speedTimer > 0 ? 1.3 : 1);
  return b.carryCrate !== (0 as EntityId) ? base * stats.carrySpeedFactor : base;
}

/**
 * Move input is given in camera space: x is screen-right, y is screen-down on a
 * ground plane, which is what both the keyboard and the stick produce.
 */
export function stepBuddy(b: BuddyRec, move: { x: number; y: number }, dt: number): void {
  b.prevX = b.x;
  b.prevZ = b.z;
  b.prevHeading = b.heading;

  if (b.invuln > 0) b.invuln = Math.max(0, b.invuln - dt);
  if (b.fireCooldown > 0) b.fireCooldown = Math.max(0, b.fireCooldown - dt);
  if (b.meleeTimer > 0) b.meleeTimer = Math.max(0, b.meleeTimer - dt);
  if (b.shieldTimer > 0) {
    b.shieldTimer = Math.max(0, b.shieldTimer - dt);
    if (b.shieldTimer <= 0) b.shieldHp = 0;
  }
  if (b.fireTimer > 0) b.fireTimer = Math.max(0, b.fireTimer - dt);
  if (b.speedTimer > 0) b.speedTimer = Math.max(0, b.speedTimer - dt);

  if (b.state === 'ko') {
    b.vx = 0; b.vz = 0;
    b.kx = 0; b.kz = 0;
    b.koTimer = Math.max(0, b.koTimer - dt);
    return;
  }

  const speed = speedOf(b);
  const len = Math.hypot(move.x, move.y);
  // While a shove is still decaying the player only partly counters it, so a
  // hit actually displaces its target before control returns.
  const control = b.kx !== 0 || b.kz !== 0 ? KNOCK_CONTROL : 1;
  let targetVx = 0;
  let targetVz = 0;
  if (len >= 0.01) {
    const scale = Math.min(1, len) * speed * control;
    targetVx = (move.x / len) * scale;
    targetVz = (move.y / len) * scale;
  }
  const rate = (len >= 0.01 ? speed / MOVE_ACCEL_S : speed / MOVE_DECEL_S) * dt;
  const dvx = targetVx - b.vx;
  const dvz = targetVz - b.vz;
  const dLen = Math.hypot(dvx, dvz);
  if (dLen <= rate) {
    b.vx = targetVx;
    b.vz = targetVz;
  } else {
    b.vx += (dvx / dLen) * rate;
    b.vz += (dvz / dLen) * rate;
  }

  b.x += (b.vx + b.kx) * dt;
  b.z += (b.vz + b.kz) * dt;
  const decay = Math.exp(-KNOCK_DECAY * dt);
  b.kx *= decay;
  b.kz *= decay;
  if (Math.abs(b.kx) < 0.05 && Math.abs(b.kz) < 0.05) {
    b.kx = 0;
    b.kz = 0;
  }

  const slideX = b.vx + b.kx;
  const slideZ = b.vz + b.kz;
  if (slideX === 0 && slideZ === 0) {
    // Fully at rest: leave the position untouched so a buddy parked outside the
    // island (test setups, glitches) stays recallable by the void check.
    b.state = b.carryCrate ? 'carry' : 'idle';
    return;
  }
  if (Math.hypot(slideX, slideZ) > 0.4) {
    b.heading = Math.atan2(slideX, slideZ);
    b.state = b.carryCrate ? 'carry' : 'walk';
  } else {
    b.state = b.carryCrate ? 'carry' : 'idle';
  }

  const limit = ARENA_HALF - 1;
  b.x = Math.max(-limit, Math.min(limit, b.x));
  b.z = Math.max(-limit, Math.min(limit, b.z));
}

/** Adds a knockback impulse; total slide distance ≈ impulse / KNOCK_DECAY. */
export function shove(b: BuddyRec, impulseX: number, impulseZ: number): void {
  if (b.state === 'ko') return;
  b.kx += impulseX;
  b.kz += impulseZ;
}

export function isOutOfBounds(b: BuddyRec): boolean {
  return Math.hypot(b.x, b.z) > VOID_DISTANCE;
}

export function applyDamage(b: BuddyRec, amount: number): number {
  if (amount <= 0 || b.invuln > 0 || b.state === 'ko') return 0;
  let remaining = amount;
  if (b.shieldHp > 0) {
    const absorbed = Math.min(b.shieldHp, remaining);
    b.shieldHp -= absorbed;
    remaining -= absorbed;
    if (b.shieldHp <= 0) b.shieldTimer = 0;
  }
  if (remaining <= 0) return 0;
  const dealt = Math.min(remaining, b.hp);
  b.hp -= dealt;
  return dealt;
}

export function heal(b: BuddyRec, amount: number): number {
  if (amount <= 0 || b.state === 'ko') return 0;
  const gained = Math.min(amount, b.maxHp - b.hp);
  b.hp += gained;
  return gained;
}

export function knockout(b: BuddyRec, respawnSeconds: number): void {
  b.hp = 0;
  b.state = 'ko';
  b.koTimer = respawnSeconds;
  b.weapon = 'none';
  b.vx = 0; b.vz = 0;
  b.kx = 0; b.kz = 0;
  b.shieldHp = 0;
  b.shieldTimer = 0;
  b.fireTimer = 0;
  b.speedTimer = 0;
  b.meleeTimer = 0;
}

export function revive(b: BuddyRec, fraction = 0.4): void {
  if (b.state !== 'ko') return;
  b.state = 'idle';
  b.hp = Math.max(1, Math.round(b.maxHp * fraction));
  b.koTimer = 0;
  b.invuln = 1.5;
}

export function distance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

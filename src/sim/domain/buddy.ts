import type { EntityId } from '../core/ids';
import { CLASS_STATS, type BuddyClass } from '../domain/classes';
import type { TeamId } from '../domain/teams';
import { ARENA_HALF, VOID_DISTANCE } from '../domain/constants';
import type { ItemType } from '../domain/recipes';

export type BuddyState = 'idle' | 'walk' | 'carry' | 'ko' | 'celebrate';

export interface BuddyRec {
  id: EntityId;
  team: TeamId;
  cls: BuddyClass;
  x: number;
  z: number;
  vx: number;
  vz: number;
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
    id, team, cls, x, z, vx: 0, vz: 0, heading: 0,
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
    b.koTimer = Math.max(0, b.koTimer - dt);
    return;
  }

  const len = Math.hypot(move.x, move.y);
  if (len < 0.01) {
    b.vx = 0; b.vz = 0;
    if (b.state === 'walk' || b.state === 'carry') b.state = b.carryCrate ? 'carry' : 'idle';
    return;
  }

  const scale = Math.min(1, len) * speedOf(b);
  b.vx = (move.x / len) * scale;
  b.vz = (move.y / len) * scale;
  b.x += b.vx * dt;
  b.z += b.vz * dt;
  b.heading = Math.atan2(b.vx, b.vz);
  b.state = b.carryCrate ? 'carry' : 'walk';

  const limit = ARENA_HALF - 1;
  b.x = Math.max(-limit, Math.min(limit, b.x));
  b.z = Math.max(-limit, Math.min(limit, b.z));
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

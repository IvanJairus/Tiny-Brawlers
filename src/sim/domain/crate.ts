import type { EntityId } from '../core/ids';
import { CRATE_SIZE, TICK_S } from './constants';
import type { TeamId } from './teams';

export type CrateState = 'dropping' | 'loose' | 'held' | 'onPad' | 'thrown';

export interface CrateRec {
  id: EntityId;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  spinZ: number;
  state: CrateState;
  heldBy: EntityId;
  padTeam: TeamId | null;
  padSlot: number;
  claimTeam: TeamId | null;
  settled: number;
  dead: boolean;
}

const GRAVITY = 22;
const HALF = CRATE_SIZE / 2;

export function makeCrate(id: EntityId, x: number, y: number, z: number): CrateRec {
  return {
    id, x, y, z, vx: 0, vy: 0, vz: 0, spin: 0, spinZ: 0,
    state: 'dropping', heldBy: 0 as EntityId, padTeam: null, padSlot: -1,
    claimTeam: null, settled: 0, dead: false
  };
}

/**
 * A held crate rides on its carrier, so it must not be integrated at all.
 * Skipping this guard is how the old build left invisible crates in the world.
 */
export function stepCrate(c: CrateRec, dt: number): void {
  if (c.state === 'held' || c.state === 'onPad') return;

  c.vy -= GRAVITY * dt;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  c.z += c.vz * dt;
  c.spin += c.spinZ * dt;

  if (c.y <= HALF) {
    c.y = HALF;
    if (c.vy < -1.5) {
      c.vy = -c.vy * 0.32;
      c.vx *= 0.6;
      c.vz *= 0.6;
      c.spinZ *= 0.5;
    } else {
      c.vy = 0;
      c.vx *= 0.82;
      c.vz *= 0.82;
      c.spinZ *= 0.8;
      c.settled += dt;
      if (c.settled > 0.25) {
        c.state = 'loose';
        c.settled = 0.5;
      }
    }
  } else {
    c.settled = 0;
  }
}

export function attachCrateToBuddy(c: CrateRec, buddyId: EntityId): void {
  c.state = 'held';
  c.heldBy = buddyId;
  c.padTeam = null;
  c.padSlot = -1;
  c.vx = 0; c.vy = 0; c.vz = 0;
  c.spinZ = 0;
}

export function detachCrate(c: CrateRec): void {
  c.state = 'dropping';
  c.heldBy = 0 as EntityId;
  c.padTeam = null;
  c.padSlot = -1;
  c.settled = 0;
}

export function placeCrateOnPad(c: CrateRec, team: TeamId, slot: number, x: number, y: number, z: number): void {
  c.state = 'onPad';
  c.heldBy = 0 as EntityId;
  c.padTeam = team;
  c.padSlot = slot;
  c.x = x; c.y = y; c.z = z;
  c.vx = 0; c.vy = 0; c.vz = 0;
  c.spin = 0; c.spinZ = 0;
}

export function throwCrate(c: CrateRec, dirX: number, dirZ: number, force: number, heightBias: number): void {
  c.state = 'thrown';
  c.heldBy = 0 as EntityId;
  c.padTeam = null;
  c.padSlot = -1;
  const len = Math.hypot(dirX, dirZ) || 1;
  c.vx = (dirX / len) * force;
  c.vz = (dirZ / len) * force;
  c.vy = heightBias;
  c.spinZ = force * 0.5;
  c.settled = 0;
}

export const CARRY_HEIGHT = 1.9;
export const THROW_LIFT = 5.5;
const PREVIEW_TICKS = 240;

export interface ArcPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Replays the real crate integrator instead of approximating a parabola, so the
 * on-screen arc cannot drift away from where the crate actually lands.
 */
export function throwPreview(x: number, z: number, heading: number, force: number): ArcPoint[] {
  const crate = makeCrate(0 as EntityId, x, CARRY_HEIGHT, z);
  throwCrate(crate, Math.sin(heading), Math.cos(heading), force, THROW_LIFT);

  const points: ArcPoint[] = [{ x: crate.x, y: crate.y, z: crate.z }];
  for (let i = 0; i < PREVIEW_TICKS && crate.state !== 'loose'; i++) {
    stepCrate(crate, TICK_S);
    points.push({ x: crate.x, y: crate.y, z: crate.z });
  }
  return points;
}

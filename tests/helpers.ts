import { createWorld, type World } from '../src/sim/core/world';
import { stepWorld } from '../src/sim/core/step';
import { spawnBuddy } from '../src/sim/domain/match';
import { makeCrate } from '../src/sim/domain/crate';
import { encodeInput, EMPTY_INPUT, type RawAxes } from '../src/sim/input/actions';
import { TICK_S } from '../src/sim/domain/constants';
import { NO_ENTITY, type EntityId } from '../src/sim/core/ids';
import type { BuddyClass } from '../src/sim/domain/classes';
import type { TeamId } from '../src/sim/domain/teams';
import type { BuddyRec } from '../src/sim/domain/buddy';

export const NO = NO_ENTITY as EntityId;

export function testWorld(seed = 1234): World {
  return createWorld({ seed });
}

export function addBuddy(w: World, team: TeamId, cls: BuddyClass, x: number, z: number): BuddyRec {
  const b = spawnBuddy(w, team, cls, false);
  b.x = x;
  b.z = z;
  b.invuln = 0;
  return b;
}

export function addCrate(w: World, x: number, z: number, y = 0.45): EntityId {
  const c = makeCrate(w.ids.alloc(), x, y, z);
  c.state = 'loose';
  c.settled = 1;
  w.crates.push(c);
  return c.id;
}

export function press(w: World, id: EntityId, axes: Partial<RawAxes> & { seq?: number }): void {
  const raw: RawAxes = {
    moveX: 0, moveY: 0, aimX: 0, aimY: 0,
    attack: false, grab: false, build: false, zoom: 0,
    ...axes
  };
  w.inputs.set(id, encodeInput(axes.seq ?? 1, raw));
}

export function release(w: World, id: EntityId): void {
  w.inputs.set(id, { ...EMPTY_INPUT, seq: (w.inputs.get(id)?.seq ?? 0) + 1 });
}

export function run(w: World, seconds: number): void {
  const steps = Math.round(seconds / TICK_S);
  for (let i = 0; i < steps; i++) stepWorld(w, TICK_S);
}

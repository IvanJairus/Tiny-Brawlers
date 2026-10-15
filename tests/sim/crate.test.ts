import { describe, expect, it } from 'vitest';
import { attachCrateToBuddy, CARRY_HEIGHT, detachCrate, makeCrate, placeCrateOnPad, stepCrate, throwCrate, throwPreview, THROW_LIFT } from '../../src/sim/domain/crate';
import { TICK_S } from '../../src/sim/domain/constants';
import { NO_ENTITY, type EntityId } from '../../src/sim/core/ids';
import { makeBuddy } from '../../src/sim/domain/buddy';

const crate = (x = 0, y = 6, z = 0) => makeCrate(1 as EntityId, x, y, z);
const buddy = () => makeBuddy(2 as EntityId, 'red', 'constructor', 0, 0, false);

describe('crate physics', () => {
  it('falls and settles on the ground', () => {
    const c = crate();
    for (let i = 0; i < 120; i++) stepCrate(c, 1 / 30);
    expect(c.y).toBeCloseTo(0.45, 2);
    expect(c.state).toBe('loose');
  });

  it('bounces once before resting', () => {
    const c = crate(0, 8, 0);
    let bounced = false;
    for (let i = 0; i < 200; i++) {
      const before = c.vy;
      stepCrate(c, 1 / 30);
      if (before < 0 && c.vy > 0) bounced = true;
    }
    expect(bounced).toBe(true);
    expect(c.state).toBe('loose');
  });

  it('does not drift sideways once resting', () => {
    const c = crate(3, 0.5, -2);
    for (let i = 0; i < 60; i++) stepCrate(c, 1 / 30);
    const x = c.x;
    for (let i = 0; i < 60; i++) stepCrate(c, 1 / 30);
    expect(c.x).toBeCloseTo(x, 3);
  });

  it('arcs when thrown and keeps its spin', () => {
    const c = crate();
    throwCrate(c, 1, 0, 18, 5.5);
    expect(c.state).toBe('thrown');
    const peak = (() => {
      let top = c.y;
      for (let i = 0; i < 90; i++) {
        stepCrate(c, 1 / 30);
        top = Math.max(top, c.y);
      }
      return top;
    })();
    expect(peak).toBeGreaterThan(1);
    expect(c.x).toBeGreaterThan(6);
  });

  it('rides its carrier and is never integrated while held', () => {
    const c = crate(0, 0.45, 0);
    const b = buddy();
    attachCrateToBuddy(c, b.id);
    b.x = 5;
    b.z = -3;
    stepCrate(c, 1 / 30);
    expect(c.x).toBe(0);
    expect(c.state).toBe('held');
    expect(c.heldBy).toBe(b.id);
  });

  it('clears pad membership when detached', () => {
    const c = crate();
    placeCrateOnPad(c, 'red', 3, 1, 0.55, 2);
    expect(c.state).toBe('onPad');
    stepCrate(c, 1 / 30);
    expect(c.x).toBe(1);
    detachCrate(c);
    expect(c.state).toBe('dropping');
    expect(c.padTeam).toBeNull();
    expect(c.heldBy).toBe(NO_ENTITY as EntityId);
  });

  it('predicts the throw by replaying the same integrator', () => {
    const heading = Math.PI / 2;
    const arc = throwPreview(0, 0, heading, 18);

    const c = crate(0, CARRY_HEIGHT, 0);
    throwCrate(c, Math.sin(heading), Math.cos(heading), 18, THROW_LIFT);
    let guard = 0;
    while (c.state !== 'loose' && guard++ < 300) stepCrate(c, TICK_S);

    const end = arc[arc.length - 1];
    expect(end.x).toBeCloseTo(c.x, 6);
    expect(end.z).toBeCloseTo(c.z, 6);
    expect(arc.length).toBeGreaterThan(10);
    expect(Math.hypot(c.x, c.z)).toBeGreaterThan(6);
  });

  it('lands short when thrown straight ahead at a low force', () => {
    const near = throwPreview(0, 0, 0, 8);
    const far = throwPreview(0, 0, 0, 18);
    expect(near[near.length - 1].z).toBeLessThan(far[far.length - 1].z);
  });
});

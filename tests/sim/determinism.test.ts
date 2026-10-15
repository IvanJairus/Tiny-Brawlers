import { describe, expect, it } from 'vitest';
import { createWorld } from '../../src/sim/core/world';
import { hashWorld } from '../../src/sim/core/world';
import { stepWorld } from '../../src/sim/core/step';
import { initialSquads } from '../../src/sim/domain/match';
import { TICK_S } from '../../src/sim/domain/constants';
import { encodeInput } from '../../src/sim/input/actions';

function scriptedMatch(seed: number, ticks: number): number[] {
  const w = createWorld({ seed });
  initialSquads(w, 2);
  const hashes: number[] = [];
  for (let i = 0; i < ticks; i++) {
    for (const b of w.buddies) {
      const t = i / 30;
      w.inputs.set(b.id, encodeInput(i % 256, {
        moveX: Math.sin(t * 0.7 + b.x),
        moveY: Math.cos(t * 0.5 + b.z),
        aimX: 0,
        aimY: 0,
        attack: i % 97 === 0,
        grab: i % 53 === 0,
        build: i % 211 === 0,
        zoom: 0
      }));
    }
    stepWorld(w, TICK_S);
    if (i % 200 === 0) hashes.push(hashWorld(w));
  }
  hashes.push(hashWorld(w));
  return hashes;
}

describe('deterministic simulation', () => {
  it('replays identically from the same seed and inputs', () => {
    expect(scriptedMatch(4242, 1200)).toEqual(scriptedMatch(4242, 1200));
  });

  it('diverges when the seed changes', () => {
    expect(scriptedMatch(1, 600)).not.toEqual(scriptedMatch(2, 600));
  });

  it('runs a 60 second match far faster than realtime', () => {
    const started = process.hrtime.bigint();
    const w = createWorld({ seed: 31337 });
    initialSquads(w, 2);
    for (let i = 0; i < 1800; i++) stepWorld(w, TICK_S);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const multiplier = 60_000 / ms;
    console.log(`sim: 60s match in ${ms.toFixed(1)}ms (${multiplier.toFixed(0)}x realtime)`);
    // A 30 Hz sim needs 30x realtime to keep up; the floor is a hundred times
    // that, which is the margin a mid-range phone needs. Measured on an idle
    // machine this runs above 2000x, and test files share CPU while they run.
    expect(multiplier).toBeGreaterThan(300);
  });
});

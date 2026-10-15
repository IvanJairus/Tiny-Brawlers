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
  it('replays identically from the same seed and inputs, three runs', () => {
    const first = scriptedMatch(4242, 1200);
    expect(scriptedMatch(4242, 1200)).toEqual(first);
    expect(scriptedMatch(4242, 1200)).toEqual(first);
  });

  it('diverges when the seed changes', () => {
    expect(scriptedMatch(1, 600)).not.toEqual(scriptedMatch(2, 600));
  });

  it('runs a 60 second match far faster than realtime', () => {
    const rates: number[] = [];
    for (let run = 0; run < 5; run++) {
      const started = process.hrtime.bigint();
      const w = createWorld({ seed: 31337 });
      initialSquads(w, 2);
      for (let i = 0; i < 1800; i++) stepWorld(w, TICK_S);
      rates.push(60_000 / (Number(process.hrtime.bigint() - started) / 1e6));
    }
    console.log(`sim: 60s match x realtime: ${rates.map((r) => r.toFixed(0)).join(' ')}`);
    // The M1 gate is 1000x, measured when this file owns the CPU. In the parallel
    // suite the same code reads near 1000x because other files steal cores, so the
    // floor there is a regression net, not the gate. `npm run test:speed` raises it.
    const floor = process.env.TB_SPEED_GATE === '1' ? 1000 : 300;
    expect(Math.max(...rates)).toBeGreaterThanOrEqual(floor);
  });
});

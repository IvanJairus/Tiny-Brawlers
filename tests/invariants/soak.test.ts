import { describe, expect, it } from 'vitest';
import { createWorld, hashWorld } from '../../src/sim/core/world';
import { stepWorld } from '../../src/sim/core/step';
import { initialSquads } from '../../src/sim/domain/match';
import { TICK_S } from '../../src/sim/domain/constants';
import { TEAM_IDS } from '../../src/sim/domain/teams';
import { totalCrates } from '../../src/sim/domain/pad';

/**
 * A browser tab that degrades after ten minutes of play is not deployable, and no
 * short test catches it. This runs twenty simulated minutes with every bot
 * fighting and building, then checks nothing grew without a bound.
 */
describe('soak: twenty simulated minutes', () => {
  const world = createWorld({ seed: 90210 });
  initialSquads(world, 2);

  const samples: Array<{ tick: number; ids: number; crates: number; buddies: number; projectiles: number; tanks: number }> = [];
  let ticks = 0;
  let thrown: Error | null = null;

  try {
    for (let i = 0; i < 20 * 60 * 30; i++) {
      stepWorld(world, TICK_S);
      world.events.length = 0;
      ticks++;
      if (i % (60 * 30) === 0) {
        samples.push({
          tick: world.tick,
          ids: world.ids.liveCount(),
          crates: world.crates.length,
          buddies: world.buddies.length,
          projectiles: world.projectiles.length,
          tanks: world.tanks.length
        });
      }
      if (world.over) {
        world.over = false;
        world.winner = null;
        for (const team of TEAM_IDS) {
          world.eliminated[team] = false;
          world.bunkerHp[team] = 1000;
        }
      }
    }
  } catch (error) {
    thrown = error as Error;
  }

  it('completes without throwing', () => {
    expect(thrown).toBeNull();
    expect(ticks).toBe(20 * 60 * 30);
  });

  it('keeps entity counts inside their declared bounds', () => {
    expect(world.crates.length).toBeLessThanOrEqual(24);
    expect(world.buddies.length).toBeLessThanOrEqual(24);
    for (const team of TEAM_IDS) {
      const size = world.buddies.filter((b) => b.team === team).length;
      expect(size, `team ${team} roster` ).toBeLessThanOrEqual(6);
    }
    expect(world.projectiles.length).toBeLessThan(60);
    expect(world.tanks.length).toBeLessThanOrEqual(4);
  });

  it('does not leak entity ids', () => {
    const first = samples[0];
    const last = samples[samples.length - 1];
    expect(samples.length).toBe(20);
    expect(last.ids).toBeLessThanOrEqual(last.buddies + last.crates + last.projectiles + last.tanks);
    expect(first.ids).toBeGreaterThan(0);
  });

  it('keeps the pad and bunker state inside their ranges', () => {
    for (const team of TEAM_IDS) {
      expect(totalCrates(world.pads[team])).toBeLessThanOrEqual(8);
      expect(world.bunkerHp[team]).toBeGreaterThanOrEqual(0);
      expect(world.bunkerHp[team]).toBeLessThanOrEqual(1000);
    }
  });

  it('still produces a stable fingerprint at the end', () => {
    expect(Number.isFinite(hashWorld(world))).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { createWorld } from '../../src/sim/core/world';
import { stepWorld } from '../../src/sim/core/step';
import { initialSquads } from '../../src/sim/domain/match';
import { ARENA_HALF, TICK_S } from '../../src/sim/domain/constants';
import { TEAM_IDS } from '../../src/sim/domain/teams';

const PAD_RECIPES = ['pistol', 'shotgun', 'grenade', 'medic_unit', 'medic', 'bazooka', 'commando'];

function playFiveMinutes(seed: number): { built: Map<string, number>; world: ReturnType<typeof createWorld> } {
  const w = createWorld({ seed });
  initialSquads(w, 3);
  const built = new Map<string, number>();
  for (let i = 0; i < 9000; i++) {
    stepWorld(w, TICK_S);
    for (const event of w.events.splice(0, w.events.length)) {
      if (event.kind === 'build') built.set(event.recipe, (built.get(event.recipe) ?? 0) + 1);
    }
  }
  return { built, world: w };
}

describe('bots at tier B', () => {
  it('reaches all seven pad recipes in one five minute all-bot match', () => {
    const { built } = playFiveMinutes(20260);
    console.log(`ai: seed 20260 ${[...PAD_RECIPES, 'tank'].map((r) => `${r}:${built.get(r) ?? 0}`).join(' ')}`);
    for (const recipe of PAD_RECIPES) {
      expect(built.has(recipe), `${recipe} never appeared in bot play`).toBe(true);
    }
  });

  it('finishes a tank pad without a human pressing the button', () => {
    const { built } = playFiveMinutes(1);
    expect(built.get('tank'), 'the eight crate shape was never completed by bots').toBeGreaterThanOrEqual(1);
  });

  it('gets a tank built in most five minute bot matches', () => {
    const seeds = [20260, 1, 7, 99, 505, 12, 404, 777];
    const withTank = seeds.filter((seed) => (playFiveMinutes(seed).built.get('tank') ?? 0) > 0);
    console.log(`ai: tank in ${withTank.length} of ${seeds.length} seeds (${withTank.join(' ')})`);
    expect(withTank.length).toBeGreaterThanOrEqual(5);
  }, 25000);

  it('keeps an all bot match inside its invariants', () => {
    const { world: w } = playFiveMinutes(20260);
    expect(w.tick).toBe(9000);
    for (const buddy of w.buddies) {
      if (buddy.remove) continue;
      expect(Number.isFinite(buddy.x) && Number.isFinite(buddy.z)).toBe(true);
      expect(Math.abs(buddy.x)).toBeLessThanOrEqual(ARENA_HALF);
      expect(Math.abs(buddy.z)).toBeLessThanOrEqual(ARENA_HALF);
      expect(buddy.hp).toBeGreaterThanOrEqual(0);
    }
    for (const team of TEAM_IDS) expect(w.bunkerHp[team]).toBeGreaterThanOrEqual(0);
  });
});

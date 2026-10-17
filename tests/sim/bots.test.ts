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

  it('does not fire when an obstacle blocks line of sight to the target', async () => {
    const { botInput, makeBotMemory } = await import('../../src/sim/ai/bot');
    const { makeBuddy } = await import('../../src/sim/domain/buddy');
    const w = createWorld({ seed: 42 });
    w.obstacles = [
      { id: 10000 as never, kind: 'soft', x: 0, z: 3, halfSize: 0.9, hp: 60, maxHp: 60, dead: false }
    ];
    const bot = makeBuddy(1 as never, 'red', 'fighter', 0, 0, true);
    bot.weapon = 'pistol';
    const foe = makeBuddy(2 as never, 'blue', 'fighter', 0, 6, true);
    w.buddies.push(bot, foe);

    const raw = botInput(w, bot, makeBotMemory(), 1);
    expect(raw.attack).toBe(false);
  });

  it('defers a crate that is closer to a human teammate instead of stealing it', async () => {
    const { botInput, makeBotMemory } = await import('../../src/sim/ai/bot');
    const { makeBuddy } = await import('../../src/sim/domain/buddy');
    const { makeCrate } = await import('../../src/sim/domain/crate');
    const w = createWorld({ seed: 42 });
    w.obstacles = [];

    const human = makeBuddy(1 as never, 'red', 'fighter', 0, 0, false);
    human.ownedByPlayer = true;
    const bot = makeBuddy(2 as never, 'red', 'fighter', 0, 2, true);

    const humanCrate = makeCrate(10 as never, 0, 0.45, 0.8);
    humanCrate.state = 'loose';
    const otherCrate = makeCrate(11 as never, 4, 0.45, 2);
    otherCrate.state = 'loose';
    w.buddies.push(human, bot);
    w.crates.push(humanCrate, otherCrate);

    const raw = botInput(w, bot, makeBotMemory(), 1);
    // Bot steers toward otherCrate (+X) instead of humanCrate (-Z)
    expect(raw.moveX).toBeGreaterThan(0.5);
  });

  it('triggers a perpendicular detour when stuck in place for 30 ticks', async () => {
    const { botInput, makeBotMemory } = await import('../../src/sim/ai/bot');
    const { makeBuddy } = await import('../../src/sim/domain/buddy');
    const { makeCrate } = await import('../../src/sim/domain/crate');
    const w = createWorld({ seed: 42 });
    w.obstacles = [];

    const bot = makeBuddy(1 as never, 'red', 'fighter', 0, 0, true);
    const crate = makeCrate(10 as never, 0, 0.45, 8);
    crate.state = 'loose';
    w.buddies.push(bot);
    w.crates.push(crate);

    const mem = makeBotMemory();
    for (let i = 0; i < 31; i++) {
      botInput(w, bot, mem, i);
    }
    expect(mem.detourTicks).toBeGreaterThan(0);
    const detourRaw = botInput(w, bot, mem, 32);
    expect(Math.abs(detourRaw.moveX)).toBeGreaterThan(0.5);
  });
});

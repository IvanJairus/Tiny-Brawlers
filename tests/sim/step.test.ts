import { describe, expect, it } from 'vitest';
import { addBuddy, addCrate, press, release, run, testWorld } from '../helpers';
import { createWorld } from '../../src/sim/core/world';
import { buildPad } from '../../src/sim/core/step';
import { maskOf, padOrigin, slotPosition, totalCrates } from '../../src/sim/domain/pad';
import { NO_ENTITY, type EntityId } from '../../src/sim/core/ids';
import { findCrate } from '../../src/sim/core/world';
import { tickReinforcements } from '../../src/sim/domain/match';
import { TEAM_IDS, type TeamId } from '../../src/sim/domain/teams';
import {
  BASE_COORDINATES, REINFORCEMENT_INTERVAL_S, SQUAD_SIZE_MAX, VOID_DISTANCE
} from '../../src/sim/domain/constants';

function playerAtPad(w: ReturnType<typeof testWorld>) {
  const origin = padOrigin('red');
  const b = addBuddy(w, 'red', 'constructor', origin.x, origin.z + 0.6);
  return { b, origin };
}

describe('player crate loop', () => {
  it('picks up, carries, places and builds a pistol', () => {
    const w = testWorld();
    const { b, origin } = playerAtPad(w);
    const crateId = addCrate(w, b.x + 0.5, b.z);

    press(w, b.id, { grab: true });
    run(w, 0.1);
    release(w, b.id);
    expect(b.carryCrate).toBe(crateId);
    expect(findCrate(w, crateId)?.state).toBe('held');

    release(w, b.id);
    run(w, 0.05);
    press(w, b.id, { grab: true });
    run(w, 0.1);
    expect(totalCrates(w.pads.red)).toBe(1);
    release(w, b.id);

    const placed = findCrate(w, crateId);
    expect(placed?.state).toBe('onPad');
    expect(placed?.padTeam).toBe('red');
    expect(Math.hypot(placed!.x - origin.x, placed!.z - origin.z)).toBeLessThan(1.2);

    press(w, b.id, { build: true });
    run(w, 0.1);
    expect(b.weapon).toBe('pistol');
    expect(w.pads.red).toBe(0);
    expect(w.crates.some((c) => c.id === crateId)).toBe(false);
  });

  it('throws instead of placing when far from its own pad', () => {
    const w = testWorld();
    const b = addBuddy(w, 'red', 'constructor', -20, -20);
    const crateId = addCrate(w, b.x + 0.4, b.z);
    press(w, b.id, { grab: true });
    run(w, 0.1);
    release(w, b.id);
    run(w, 0.05);
    b.heading = 0;
    press(w, b.id, { grab: true });
    run(w, 0.05);
    expect(findCrate(w, crateId)?.state).toBe('thrown');
    run(w, 4);
    expect(findCrate(w, crateId)?.state).toBe('loose');
    expect(w.pads.red).toBe(0);
  });

  it('will not feed an enemy pad with a thrown crate', () => {
    const w = testWorld();
    const blue = padOrigin('blue');
    const b = addBuddy(w, 'red', 'constructor', blue.x, blue.z + 0.5);
    const crateId = addCrate(w, b.x + 0.4, b.z);
    press(w, b.id, { grab: true });
    run(w, 0.1);
    release(w, b.id);
    run(w, 0.05);
    press(w, b.id, { grab: true });
    run(w, 0.05);
    run(w, 5);
    expect(w.pads.blue).toBe(0);
    expect(w.pads.red).toBe(0);
    expect(findCrate(w, crateId)?.state).toBe('loose');
  });
});

describe('pad builds', () => {
  const cases: Array<[string, number, (w: ReturnType<typeof testWorld>) => void]> = [
    ['pistol', maskOf([0]), (w) => expect(w.buddies[0].weapon).toBe('pistol')],
    ['shotgun', maskOf([0, 1]), (w) => expect(w.buddies[0].weapon).toBe('shotgun')],
    ['grenade', maskOf([0, 4]), (w) => expect(w.buddies[0].grenades).toBe(5)],
    ['medicUnit', maskOf([0, 1, 4]), (w) => expect(w.buddies.filter((b) => b.cls === 'healer').length).toBe(1)],
    ['medkit', maskOf([0, 1, 2]), (w) => expect(w.buddies[0].medkits).toBe(3)],
    ['bazooka', maskOf([0, 1, 2, 3]), (w) => expect(w.buddies[0].rockets).toBe(4)],
    ['commando', maskOf([0, 1, 4, 5]), (w) => expect(w.buddies.length).toBe(2)],
    ['tank', maskOf([0, 1, 2, 3, 4, 5, 6, 7]), (w) => expect(w.tanks.length).toBe(1)]
  ];

  for (const [id, mask, assert] of cases) {
    it(`turns the ${id} shape into its effect and clears the pad`, () => {
      const w = testWorld();
      const origin = padOrigin('red');
      const b = addBuddy(w, 'red', 'fighter', origin.x, origin.z);
      b.invuln = 0;
      w.pads.red = mask;
      const built = buildPad(w, 'red', b);
      expect(built).toBe(id);
      assert(w);
      expect(w.pads.red).toBe(0);
      expect(w.padCrates.red.length).toBe(0);
    });
  }

  it('does nothing on an empty pad', () => {
    const w = testWorld();
    const b = addBuddy(w, 'red', 'fighter', 0, 0);
    expect(buildPad(w, 'red', b)).toBe('empty');
  });
});

describe('combat', () => {
  it('gives the player a real fire rate instead of an unlimited tap', () => {
    const w = testWorld();
    const shooter = addBuddy(w, 'red', 'fighter', 0, 0);
    shooter.weapon = 'pistol';
    const victim = addBuddy(w, 'blue', 'fighter', 6, 0);
    shooter.heading = Math.PI / 2;

    press(w, shooter.id, { attack: true });
    run(w, 0.3);
    expect(victim.hp).toBeCloseTo(102.5, 5);
    const afterFirst = victim.hp;
    run(w, 0.1);
    expect(victim.hp).toBe(afterFirst);
  });

  it('enforces weapon range so shotgun expires at 11u while pistol reaches 16u', () => {
    const w = testWorld();
    w.obstacles = [];
    const sgShooter = addBuddy(w, 'red', 'fighter', 0, 0);
    sgShooter.weapon = 'shotgun';
    sgShooter.heading = Math.PI / 2;
    const farTarget = addBuddy(w, 'blue', 'fighter', 15.5, 0);

    press(w, sgShooter.id, { attack: true });
    run(w, 0.65);
    expect(farTarget.hp).toBe(130);

    sgShooter.weapon = 'pistol';
    sgShooter.fireCooldown = 0;
    press(w, sgShooter.id, { attack: true });
    run(w, 0.65);
    expect(farTarget.hp).toBeLessThan(130);
  });

  it('caps melee hits to the 2 nearest enemies in cone', () => {
    const w = testWorld();
    const brawler = addBuddy(w, 'red', 'fighter', 0, 0);
    brawler.heading = Math.PI / 2;
    const f1 = addBuddy(w, 'blue', 'fighter', 0.9, -0.2);
    const f2 = addBuddy(w, 'blue', 'fighter', 1.1, 0.2);
    const f3 = addBuddy(w, 'blue', 'fighter', 1.6, 0);

    press(w, brawler.id, { attack: true });
    run(w, 0.05);
    expect(f1.hp).toBeLessThan(130);
    expect(f2.hp).toBeLessThan(130);
    expect(f3.hp).toBe(130);
  });

  it('never damages the shooter team with their own blast', () => {
    const w = testWorld();
    const thrower = addBuddy(w, 'red', 'fighter', 0, 0);
    thrower.weapon = 'grenade';
    thrower.grenades = 5;
    const mate = addBuddy(w, 'red', 'fighter', 1.2, 1.2);
    const foe = addBuddy(w, 'blue', 'fighter', 10, 0);
    thrower.heading = Math.PI / 2;

    press(w, thrower.id, { attack: true });
    run(w, 3.6);

    expect(mate.hp).toBe(130);
    expect(thrower.hp).toBe(130);
    expect(foe.hp).toBeLessThan(100);
  });

  it('knocks out at zero hp and drops a crate a teammate can pick up again', () => {
    const w = testWorld();
    const carrier = addBuddy(w, 'red', 'constructor', 0, 0);
    const crateId = addCrate(w, carrier.x + 0.4, carrier.z);
    press(w, carrier.id, { grab: true });
    run(w, 0.1);
    expect(carrier.carryCrate).toBe(crateId);

    const foe = addBuddy(w, 'blue', 'fighter', 2, 0);
    foe.weapon = 'bazooka';
    foe.rockets = 4;
    foe.heading = -Math.PI / 2;
    press(w, foe.id, { attack: true });
    run(w, 2.5);

    expect(carrier.state).toBe('ko');
    expect(carrier.carryCrate).toBe(NO_ENTITY as EntityId);
    const dropped = findCrate(w, crateId);
    expect(dropped).toBeDefined();
    expect(dropped?.state).not.toBe('held');
    expect(dropped?.heldBy).toBe(NO_ENTITY as EntityId);

    const mate = addBuddy(w, 'red', 'constructor', dropped!.x + 0.4, dropped!.z);
    press(w, mate.id, { grab: true });
    run(w, 0.1);
    expect(mate.carryCrate).toBe(crateId);
  });

  it('heals allies inside the healer aura only', () => {
    const w = testWorld();
    const healer = addBuddy(w, 'red', 'healer', 0, 0);
    const near = addBuddy(w, 'red', 'fighter', 2, 0);
    const far = addBuddy(w, 'red', 'fighter', 20, 0);
    near.hp = 40;
    far.hp = 40;
    run(w, 1);
    expect(near.hp).toBeGreaterThan(60);
    expect(far.hp).toBe(40);
    expect(healer.hp).toBe(100);
  });

  it('lets a medic weapon revive a knocked-out teammate', () => {
    const w = testWorld();
    const down = addBuddy(w, 'red', 'fighter', 0, 0);
    down.hp = 0;
    down.state = 'ko';
    down.koTimer = 999;
    const medic = addBuddy(w, 'red', 'healer', 3, 0);
    medic.weapon = 'medic';
    medic.medkits = 2;
    medic.heading = -Math.PI / 2;
    press(w, medic.id, { attack: true });
    run(w, 0.2);
    expect(down.state).not.toBe('ko');
    expect(down.hp).toBeGreaterThan(0);
    expect(medic.medkits).toBe(1);
  });
});

describe('tanks', () => {
  it('lets a buddy mount, drive and be ejected when knocked out', () => {
    const w = testWorld();
    const driver = addBuddy(w, 'red', 'fighter', 0, 0);
    const tank = (() => {
      w.pads.red = maskOf([0, 1, 2, 3, 4, 5, 6, 7]);
      buildPad(w, 'red', driver);
      return w.tanks[0];
    })();
    expect(tank).toBeDefined();

    driver.x = tank.x;
    driver.z = tank.z;
    press(w, driver.id, { grab: true });
    run(w, 0.1);
    expect(tank.driver).toBe(driver.id);

    const before = { x: tank.x, z: tank.z };
    press(w, driver.id, { moveY: 1 });
    run(w, 1);
    expect(Math.hypot(tank.x - before.x, tank.z - before.z)).toBeGreaterThan(3);

    driver.hp = 0;
    driver.state = 'ko';
    run(w, 0.1);
    expect(tank.driver).toBe(NO_ENTITY as EntityId);
  });

  it('locks driver to tank seat without double-firing and allows dismounting with grab', () => {
    const w = testWorld();
    const driver = addBuddy(w, 'red', 'fighter', 0, 0);
    driver.weapon = 'grenade';
    driver.grenades = 5;
    w.pads.red = maskOf([0, 1, 2, 3, 4, 5, 6, 7]);
    buildPad(w, 'red', driver);
    const tank = w.tanks[0];

    driver.x = tank.x;
    driver.z = tank.z;
    press(w, driver.id, { grab: true });
    run(w, 0.05);
    expect(tank.driver).toBe(driver.id);

    press(w, driver.id, { moveY: -1, attack: true, grab: false });
    run(w, 0.2);
    expect(driver.x).toBeCloseTo(tank.x, 5);
    expect(driver.z).toBeCloseTo(tank.z, 5);
    expect(driver.grenades).toBe(5);
    expect(w.projectiles.some((p) => p.kind === 'shell')).toBe(true);

    press(w, driver.id, { grab: true });
    run(w, 0.05);
    expect(tank.driver).toBe(NO_ENTITY as EntityId);
    expect(Math.hypot(driver.x - tank.x, driver.z - tank.z)).toBeGreaterThan(1.0);
  });

  it('removes a destroyed tank and frees its id', () => {
    const w = testWorld();
    const owner = addBuddy(w, 'red', 'fighter', 0, 0);
    w.pads.red = maskOf([0, 1, 2, 3, 4, 5, 6, 7]);
    buildPad(w, 'red', owner);
    const tank = w.tanks[0];
    const id = tank.id;
    const liveBefore = w.ids.liveCount();
    tank.destroyed = true;
    run(w, 0.1);
    expect(w.tanks.length).toBe(0);
    expect(w.ids.liveCount()).toBe(liveBefore - 1);
    const reused = w.ids.alloc();
    expect(reused).not.toBe(id);
    w.ids.free(reused);
  });
});

describe('match state', () => {
  it('destroys a bunker only from enemy fire and eliminates the team when empty', () => {
    const w = testWorld();
    const red = addBuddy(w, 'red', 'fighter', 0, 0);
    const blue = addBuddy(w, 'blue', 'fighter', BASE_COORDINATES.red.x + 7, BASE_COORDINATES.red.z);
    blue.weapon = 'bazooka';
    blue.rockets = 40;
    blue.heading = -Math.PI / 2;
    w.bunkerHp.red = 200;
    press(w, blue.id, { attack: true });
    run(w, 12);
    expect(w.bunkerHp.red).toBeLessThan(200);
    expect(w.eliminated.red).toBe(false);

    red.state = 'ko';
    red.koTimer = 9999;
    w.bunkerHp.red = 0;
    run(w, 0.2);
    expect(w.eliminated.red).toBe(true);
  });

  it('ends the match and then refuses to advance any further', () => {
    const w = createWorld({ seed: 99, teams: ['red', 'blue'] });
    addBuddy(w, 'red', 'fighter', 0, 0);
    addBuddy(w, 'blue', 'fighter', 4, 0);
    w.bunkerHp.blue = 0;
    w.buddies[1].state = 'ko';
    w.buddies[1].koTimer = 9999;
    run(w, 0.5);
    expect(w.over).toBe(true);
    expect(w.winner).toBe('red');

    const frozen = { tick: w.tick, crates: w.crates.length, clock: w.clock };
    run(w, 5);
    expect(w.tick).toBe(frozen.tick);
    expect(w.crates.length).toBe(frozen.crates);
    expect(w.clock).toBe(frozen.clock);
  });

  it('spawns crates over time and caps how many exist', () => {
    const w = testWorld();
    addBuddy(w, 'red', 'fighter', 0, 0);
    run(w, 60);
    expect(w.crates.length).toBeGreaterThan(0);
    expect(w.crates.length).toBeLessThanOrEqual(24);
  });

  it('keeps every live reference valid, which is what stopped ghost crates', () => {
    const w = testWorld();
    const a = addBuddy(w, 'red', 'constructor', 0, 0);
    const b = addBuddy(w, 'blue', 'constructor', 2, 0);
    for (let i = 0; i < 3; i++) addCrate(w, i * 0.5, 0.5);
    press(w, a.id, { grab: true, moveY: 1 });
    press(w, b.id, { grab: true, moveX: 1 });
    run(w, 40);

    for (const buddy of w.buddies) {
      if (buddy.carryCrate === (NO_ENTITY as EntityId)) continue;
      const held = w.crates.find((c) => c.id === buddy.carryCrate);
      expect(held, 'carryCrate must point at a crate that still exists').toBeDefined();
      expect(held?.state).toBe('held');
      expect(held?.heldBy).toBe(buddy.id);
    }
    for (const c of w.crates) {
      if (c.heldBy === (NO_ENTITY as EntityId)) continue;
      const carrier = w.buddies.find((x) => x.id === c.heldBy);
      expect(carrier, 'heldBy must point at a buddy that still exists').toBeDefined();
      expect(c.state).toBe('held');
    }
    expect(w.crates.filter((c) => c.state === 'held').length).toBe(
      w.buddies.filter((x) => x.carryCrate !== (NO_ENTITY as EntityId)).length
    );
  });

  it('frees ids of everything it drops', () => {
    const w = testWorld();
    const shooter = addBuddy(w, 'red', 'fighter', 0, 0);
    shooter.weapon = 'bazooka';
    shooter.rockets = 1;
    addBuddy(w, 'blue', 'fighter', 12, 0);
    const shotId = w.projectiles.length;
    void shotId;
    press(w, shooter.id, { attack: true });
    run(w, 0.1);
    const firedId = w.projectiles[0]?.id;
    expect(firedId).toBeDefined();
    release(w, shooter.id);
    run(w, 4);
    expect(w.projectiles.length).toBe(0);
    expect(w.crates.some((c) => c.id === firedId)).toBe(false);
    const expectedLive = w.buddies.length + w.crates.length + w.tanks.length;
    expect(w.ids.liveCount()).toBe(expectedLive);
  });
});

describe('scripted pad builds', () => {
  /**
   * The pad shapes above are set directly as a mask. This is the path a human
   * takes instead: pick a crate up, stand in a quadrant, put it down, and only
   * then press build. Every shape has to be reachable that way, because the
   * placement rule and the recipe rule can disagree without anyone noticing.
   */
  const shapes: Array<[string, number[], (w: ReturnType<typeof testWorld>) => void]> = [
    ['pistol', [0], (w) => expect(w.buddies[0].weapon).toBe('pistol')],
    ['shotgun', [0, 1], (w) => expect(w.buddies[0].weapon).toBe('shotgun')],
    ['grenade', [0, 4], (w) => expect(w.buddies[0].grenades).toBe(5)],
    ['medicUnit', [0, 1, 4], (w) => expect(w.buddies.filter((b) => b.cls === 'healer').length).toBe(1)],
    ['medkit', [0, 1, 2], (w) => expect(w.buddies[0].medkits).toBe(3)],
    ['bazooka', [0, 1, 2, 3], (w) => expect(w.buddies[0].rockets).toBe(4)],
    ['commando', [0, 1, 4, 5], (w) => expect(w.buddies.length).toBe(2)],
    ['tank', [0, 1, 2, 3, 4, 5, 6, 7], (w) => expect(w.tanks.length).toBe(1)]
  ];

  for (const [recipe, slots, assert] of shapes) {
    it(`reaches ${recipe} with nothing but input commands`, () => {
      const w = testWorld();
      const origin = padOrigin('red');
      const b = addBuddy(w, 'red', 'constructor', origin.x, origin.z);

      for (const slot of slots) {
        const place = slotPosition('red', slot);
        addCrate(w, b.x + 0.4, b.z);

        press(w, b.id, { grab: true });
        run(w, 0.1);
        release(w, b.id);
        run(w, 0.05);

        b.x = place.x;
        b.z = place.z;
        press(w, b.id, { grab: true });
        run(w, 0.1);
        release(w, b.id);
        run(w, 0.05);
      }

      expect(w.pads.red, `${recipe} shape filled`).toBe(maskOf(slots));

      press(w, b.id, { build: true });
      run(w, 0.1);
      assert(w);
      expect(w.pads.red).toBe(0);
    });
  }
});

describe('island bounds and reinforcements', () => {
  it('recalls a buddy that ends up past the shoreline', () => {
    const w = testWorld();
    const b = addBuddy(w, 'red', 'fighter', VOID_DISTANCE + 14, 0);

    run(w, 0.1);

    expect(Math.hypot(b.x, b.z)).toBeLessThan(VOID_DISTANCE);
    expect(b.state).toBe('ko');
    expect(b.koTimer).toBeGreaterThan(0);
  });

  it('swallows a crate lost in the void and frees its id', () => {
    const w = testWorld();
    const crateId = addCrate(w, VOID_DISTANCE + 10, 0);
    const before = w.ids.liveCount();

    run(w, 0.1);

    expect(w.crates.some((c) => c.id === crateId)).toBe(false);
    expect(w.ids.liveCount()).toBeLessThan(before);
  });

  it('leaves a crate alone while it still falls over the island', () => {
    const w = testWorld();
    const crateId = addCrate(w, 5, 5, 9);

    run(w, 0.1);

    expect(w.crates.some((c) => c.id === crateId)).toBe(true);
  });

  it('fields a fresh fighter for every surviving team on the clock', () => {
    const w = testWorld();
    w.eliminated.blue = true;
    w.troopTimer = 0.1;

    tickReinforcements(w, 0.2);

    for (const team of TEAM_IDS) {
      const size = w.buddies.filter((b) => b.team === team).length;
      expect(size, team).toBe(team === 'blue' ? 0 : 1);
    }
    expect(w.troopTimer).toBe(REINFORCEMENT_INTERVAL_S);
  });

  it('stops calling troops once a squad is at full strength', () => {
    const w = testWorld();
    for (let i = 0; i < SQUAD_SIZE_MAX; i++) addBuddy(w, 'red', 'fighter', 2, 2 + i * 0.5);
    w.troopTimer = 0.1;

    tickReinforcements(w, 0.2);

    expect(w.buddies.filter((b) => b.team === 'red').length).toBe(SQUAD_SIZE_MAX);
  });
});

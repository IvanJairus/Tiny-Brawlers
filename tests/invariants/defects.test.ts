import { describe, expect, it } from 'vitest';
import { addBuddy, addCrate, press, release, run, testWorld } from '../helpers';
import { createWorld } from '../../src/sim/core/world';
import { initialSquads } from '../../src/sim/domain/match';
import { fell, stepWorld } from '../../src/sim/core/step';
import { knockout } from '../../src/sim/domain/buddy';
import { aimTurret, makeTank } from '../../src/sim/domain/tank';
import { TICK_S } from '../../src/sim/domain/constants';
import { NO_ENTITY, type EntityId } from '../../src/sim/core/ids';
import type { ItemType } from '../../src/sim/domain/recipes';

/**
 * One test per defect that shipped in the previous build. They exist so the fix
 * cannot quietly regress while the rest of the engine changes around it.
 */
describe('regression: defects from the previous build', () => {
  it('a knocked-out carrier leaves a crate that still exists and can be taken again', () => {
    const w = testWorld();
    const carrier = addBuddy(w, 'red', 'constructor', 0, 0);
    const crateId = addCrate(w, carrier.x + 0.4, carrier.z);
    press(w, carrier.id, { grab: true });
    run(w, 0.1);
    release(w, carrier.id);
    expect(carrier.carryCrate).toBe(crateId);

    knockout(carrier, 5);
    fell(w, carrier);
    run(w, 0.1);

    const dropped = w.crates.find((c) => c.id === crateId);
    expect(dropped, 'the crate must still be in the world').toBeDefined();
    expect(dropped?.heldBy).toBe(NO_ENTITY as EntityId);
    expect(dropped?.state).not.toBe('held');

    run(w, 1.5);
    const mate = addBuddy(w, 'red', 'constructor', dropped!.x + 0.4, dropped!.z);
    press(w, mate.id, { grab: true });
    run(w, 0.1);
    expect(mate.carryCrate).toBe(crateId);
  });

  it('never leaves a held reference pointing at a removed crate', () => {
    const w = testWorld();
    initialSquads(w, 2);
    for (let i = 0; i < 9000; i++) stepWorld(w, TICK_S);
    for (const b of w.buddies) {
      if (b.carryCrate === (NO_ENTITY as EntityId)) continue;
      expect(w.crates.some((c) => c.id === b.carryCrate)).toBe(true);
    }
    for (const c of w.crates) {
      if (c.heldBy === (NO_ENTITY as EntityId)) continue;
      expect(c.state).toBe('held');
      expect(w.buddies.some((b) => b.id === c.heldBy)).toBe(true);
    }
  });

  it('reports every damage and explosion with a position the renderer can draw', () => {
    const w = testWorld();
    const shooter = addBuddy(w, 'red', 'fighter', 0, 0);
    shooter.weapon = 'bazooka';
    shooter.rockets = 6;
    addBuddy(w, 'blue', 'fighter', 8, 0);
    shooter.heading = Math.PI / 2;
    press(w, shooter.id, { attack: true });
    run(w, 4);
    release(w, shooter.id);

    const explosions = w.events.filter((e) => e.kind === 'explosion');
    expect(explosions.length).toBeGreaterThan(0);
    for (const event of w.events) {
      if (event.kind === 'damage' || event.kind === 'explosion' || event.kind === 'heal') {
        expect(Number.isFinite(event.at.x)).toBe(true);
        expect(Number.isFinite(event.at.z)).toBe(true);
      }
    }
  });

  it('keeps blast damage off the firing team', () => {
    const w = testWorld();
    const shooter = addBuddy(w, 'red', 'fighter', 0, 0);
    shooter.weapon = 'bazooka';
    shooter.rockets = 6;
    const mate = addBuddy(w, 'red', 'fighter', 2, 1);
    addBuddy(w, 'blue', 'fighter', 8, 0);
    shooter.heading = Math.PI / 2;
    press(w, shooter.id, { attack: true });
    run(w, 4);
    expect(mate.hp).toBe(130);
    expect(shooter.hp).toBe(130);
  });

  it('uses one world frame for the tank turret, so AI aim matches the mesh', () => {
    const tank = makeTank(1 as EntityId, 'red', 0, 0, 0);
    aimTurret(tank, Math.PI / 2, 10);
    expect(tank.turretAngle).toBeCloseTo(Math.PI / 2, 2);
    aimTurret(tank, -Math.PI / 2, 10);
    expect(tank.turretAngle).toBeCloseTo(-Math.PI / 2, 2);
  });

  it('ends the match without letting the simulation keep running', () => {
    const w = createWorld({ seed: 5, teams: ['red', 'blue'] });
    addBuddy(w, 'red', 'fighter', 0, 0);
    const doomed = addBuddy(w, 'blue', 'fighter', 4, 0);
    doomed.state = 'ko';
    doomed.koTimer = 9999;
    w.bunkerHp.blue = 0;
    run(w, 1);
    expect(w.over).toBe(true);
    const snapshot = { tick: w.tick, clock: w.clock, crates: w.crates.length, events: w.events.length };
    run(w, 20);
    expect(w.tick).toBe(snapshot.tick);
    expect(w.clock).toBe(snapshot.clock);
    expect(w.crates.length).toBe(snapshot.crates);
    expect(w.events.length).toBe(snapshot.events);
  });

  it('lets bots reach all seven recipes instead of building on the first crate', () => {
    const w = createWorld({ seed: 77 });
    initialSquads(w, 2);
    const built = new Set<string>();
    for (let i = 0; i < 600 * 30; i++) {
      stepWorld(w, TICK_S);
      for (const event of w.events) if (event.kind === 'build') built.add(event.recipe as ItemType);
      w.events.length = 0;
    }
    for (const recipe of ['pistol', 'shotgun', 'grenade', 'bazooka', 'medic_unit', 'commando', 'tank']) {
      expect(built.has(recipe), `bots never built ${recipe}`).toBe(true);
    }
  });
});

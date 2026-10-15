import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WorldRenderer } from '../../src/render/bridge';
import { createWorld } from '../../src/sim/core/world';
import { stepWorld } from '../../src/sim/core/step';
import { makeCrate } from '../../src/sim/domain/crate';
import { CRATE_SIZE, TICK_S } from '../../src/sim/domain/constants';
import type { EntityId } from '../../src/sim/core/ids';

const REST_Y = CRATE_SIZE / 2;

describe('feel effects', () => {
  it('puffs dust when a falling crate reaches the ground', () => {
    const renderer = new WorldRenderer(new THREE.Scene());
    const world = createWorld({ seed: 5 });
    const crate = makeCrate(7 as EntityId, 4, 9, -4);
    crate.state = 'loose';
    world.crates.push(crate);

    renderer.sync(world, 1, 0, 1 / 60);
    expect(renderer.effects().crateLanded ?? 0).toBe(0);

    crate.y = REST_Y + 0.6;
    world.tick += 1;
    renderer.sync(world, 1, 0.1, 1 / 60);
    expect(renderer.effects().crateLanded ?? 0, 'still in the air').toBe(0);

    crate.y = REST_Y;
    world.tick += 1;
    renderer.sync(world, 1, 0.13, 1 / 60);
    expect(renderer.effects().crateLanded).toBe(1);

    world.tick += 1;
    renderer.sync(world, 1, 0.2, 1 / 60);
    expect(renderer.effects().crateLanded, 'a resting crate must not puff every tick').toBe(1);
    renderer.dispose();
  });

  it('catches the landing of a crate the simulation actually dropped', () => {
    const renderer = new WorldRenderer(new THREE.Scene());
    const world = createWorld({ seed: 11 });

    for (let i = 0; i < 300; i++) {
      stepWorld(world, TICK_S);
      renderer.sync(world, 1, i / 30, 1 / 60);
    }

    const landed = renderer.effects().crateLanded ?? 0;
    console.log(`fx: ${landed} crate landings detected over 10s of real falling`);
    expect(landed).toBeGreaterThanOrEqual(1);
    renderer.dispose();
  });

  it('throws splinters when the pad consumes a crate', () => {
    const renderer = new WorldRenderer(new THREE.Scene());
    renderer.consume([{ kind: 'build', team: 'red', recipe: 'pistol', at: { x: 0, z: 0 } }]);
    expect(renderer.effects().crateBroken).toBe(1);
    renderer.dispose();
  });
});

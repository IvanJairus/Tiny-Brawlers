import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createAdaptation, FRAMES_BEFORE_DOWNGRADE, SLOW_FRAME_MS } from '../../src/render/adaptation';
import { PlacementGhost } from '../../src/render/props';
import { createMaterials } from '../../src/render/materials';
import { WorldRenderer } from '../../src/render/bridge';
import { createWorld } from '../../src/sim/core/world';
import { spawnBuddy } from '../../src/sim/domain/match';
import { padOrigin, findBestSlot, slotPosition } from '../../src/sim/domain/pad';
import { makeCrate } from '../../src/sim/domain/crate';
import { NO_ENTITY, type EntityId } from '../../src/sim/core/ids';
import type { IsoCamera } from '../../src/render/camera';

describe('render adaptation', () => {
  it('only drops resolution after a sustained slow streak', () => {
    const adaptation = createAdaptation();
    for (let i = 0; i < FRAMES_BEFORE_DOWNGRADE - 1; i++) {
      expect(adaptation.sample(SLOW_FRAME_MS + 5)).toBe(false);
    }
    expect(adaptation.sample(SLOW_FRAME_MS + 5)).toBe(true);
    expect(adaptation.scale).toBe(0.75);
  });

  it('a single fast frame resets the streak', () => {
    const adaptation = createAdaptation();
    for (let i = 0; i < 40; i++) adaptation.sample(SLOW_FRAME_MS + 5);
    adaptation.sample(8);
    for (let i = 0; i < 40; i++) expect(adaptation.sample(SLOW_FRAME_MS + 5)).toBe(false);
  });

  it('never drops twice or oscillates back up', () => {
    const adaptation = createAdaptation();
    for (let i = 0; i < FRAMES_BEFORE_DOWNGRADE * 4; i++) adaptation.sample(40);
    expect(adaptation.scale).toBe(0.75);
  });
});

describe('placement ghost', () => {
  it('stays hidden until a slot is offered', () => {
    const ghost = new PlacementGhost(createMaterials());
    expect(ghost.mesh.visible).toBe(false);
    ghost.showAt(1, 2, 3, 0.5);
    expect(ghost.mesh.visible).toBe(true);
    expect(ghost.mesh.position.toArray()).toEqual([1, 2, 3]);
    ghost.hide();
    expect(ghost.mesh.visible).toBe(false);
  });
});

function carriedCrateWorld(): ReturnType<typeof createWorld> {
  const world = createWorld({ seed: 5 });
  const origin = padOrigin('red');
  const hero = spawnBuddy(world, 'red', 'constructor', false);
  hero.x = origin.x;
  hero.z = origin.z;
  hero.carryCrate = 1 as EntityId;
  world.localPlayer = hero.id;
  const crate = makeCrate(1 as EntityId, hero.x, 1.9, hero.z);
  crate.state = 'held';
  crate.heldBy = hero.id;
  world.crates.push(crate);
  return world;
}

describe('world renderer reading aids', () => {
  it('shows the ghost on the slot a carried crate would fill', () => {
    const scene = new THREE.Scene();
    const renderer = new WorldRenderer(scene);
    const world = carriedCrateWorld();

    renderer.sync(world, 1, 0, 1 / 60);
    const ghost = scene.getObjectByName('placement_ghost') as THREE.Mesh;
    expect(ghost).toBeDefined();
    expect(ghost.visible).toBe(true);

    const slot = findBestSlot(world.pads.red, 'red', world.buddies[0].x, world.buddies[0].z);
    const expected = slotPosition('red', slot);
    expect(ghost.position.x).toBeCloseTo(expected.x, 5);
    expect(ghost.position.z).toBeCloseTo(expected.z, 5);
    renderer.dispose();
  });

  it('hides the ghost when the player is away from the pad or empty handed', () => {
    const scene = new THREE.Scene();
    const renderer = new WorldRenderer(scene);
    const world = carriedCrateWorld();
    world.buddies[0].x = 14;
    world.buddies[0].z = 14;
    renderer.sync(world, 1, 0, 1 / 60);
    expect((scene.getObjectByName('placement_ghost') as THREE.Mesh).visible).toBe(false);

    world.buddies[0].x = padOrigin('red').x;
    world.buddies[0].z = padOrigin('red').z;
    world.buddies[0].carryCrate = NO_ENTITY as EntityId;
    renderer.sync(world, 1, 0, 1 / 60);
    expect((scene.getObjectByName('placement_ghost') as THREE.Mesh).visible).toBe(false);
    renderer.dispose();
  });

  it('shakes the camera for a nearby blast and not for a distant one', () => {
    const scene = new THREE.Scene();
    const renderer = new WorldRenderer(scene);
    const shake = vi.fn();
    renderer.attachCamera({ shake } as unknown as IsoCamera);
    const world = carriedCrateWorld();
    renderer.sync(world, 1, 0, 1 / 60);

    renderer.consume([{ kind: 'explosion', entity: 1 as EntityId, radius: 4, at: { x: world.buddies[0].x, z: world.buddies[0].z } }]);
    expect(shake).toHaveBeenCalled();

    shake.mockClear();
    renderer.consume([{ kind: 'explosion', entity: 1 as EntityId, radius: 4, at: { x: 30, z: 30 } }]);
    expect(shake).not.toHaveBeenCalled();
    renderer.dispose();
  });
});

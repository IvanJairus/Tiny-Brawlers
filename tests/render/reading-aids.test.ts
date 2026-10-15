import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createAdaptation, FRAMES_BEFORE_DOWNGRADE, SLOW_FRAME_MS } from '../../src/render/adaptation';
import { PlacementGhost } from '../../src/render/props';
import { createMaterials } from '../../src/render/materials';
import { ChibiField, type ActorView } from '../../src/render/chibi';
import { WorldRenderer } from '../../src/render/bridge';
import { TEAM_IDS } from '../../src/sim/domain/teams';
import { createWorld } from '../../src/sim/core/world';
import { spawnBuddy } from '../../src/sim/domain/match';
import { padOrigin, findBestSlot, slotPosition } from '../../src/sim/domain/pad';
import { makeCrate, throwPreview } from '../../src/sim/domain/crate';
import { CLASS_STATS } from '../../src/sim/domain/classes';
import { blastWorthFreezing, createHitStop, HIT_STOP_S } from '../../src/render/hitstop';
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

  it('draws the flight path of a crate that is away from its pad', () => {
    const scene = new THREE.Scene();
    const renderer = new WorldRenderer(scene);
    const world = carriedCrateWorld();
    world.buddies[0].x = 14;
    world.buddies[0].z = 14;

    renderer.sync(world, 1, 0, 1 / 60);
    const arc = scene.getObjectByName('throw_arc') as THREE.Line;
    expect(arc.visible).toBe(true);

    const range = arc.geometry.drawRange;
    expect(range.count).toBeGreaterThan(1);
    const positions = arc.geometry.getAttribute('position') as THREE.BufferAttribute;
    const expected = throwPreview(14, 14, world.buddies[0].heading, CLASS_STATS.constructor.throwForce);
    const last = (range.count ?? 0) - 1;
    expect(positions.getX(last)).toBeCloseTo(expected[last].x, 5);
    expect(positions.getZ(last)).toBeCloseTo(expected[last].z, 5);

    world.buddies[0].x = padOrigin('red').x;
    world.buddies[0].z = padOrigin('red').z;
    renderer.sync(world, 1, 0, 1 / 60);
    expect(arc.visible).toBe(false);
    renderer.dispose();
  });

  it('flashes the body that took the hit for one short window', () => {
    const scene = new THREE.Scene();
    const renderer = new WorldRenderer(scene);
    const world = carriedCrateWorld();
    const hero = world.buddies[0];
    hero.x = 14;
    hero.z = 14;
    hero.carryCrate = NO_ENTITY as EntityId;

    renderer.sync(world, 1, 0, 1 / 60);
    const flash = scene.getObjectByName('hit_flash') as THREE.InstancedMesh;
    expect(flash.count).toBe(0);

    renderer.consume([{ kind: 'damage', entity: hero.id, amount: 12, fromTeam: 'blue', at: { x: hero.x, z: hero.z } }]);
    renderer.sync(world, 1, 0.01, 1 / 60);
    expect(flash.count).toBe(1);

    renderer.sync(world, 1, 0.07, 1 / 60);
    expect(flash.count).toBe(0);
    renderer.dispose();
  });

  it('holds the picture still for a near blast on a desktop only', () => {
    const scene = new THREE.Scene();
    const desktop = new WorldRenderer(scene);
    const world = carriedCrateWorld();
    desktop.attachCamera({ shake: vi.fn() } as unknown as IsoCamera);
    desktop.sync(world, 1, 0, 1 / 60);
    desktop.consume([{ kind: 'explosion', entity: 1 as EntityId, radius: 4, at: { x: world.buddies[0].x, z: world.buddies[0].z } }]);
    expect(desktop.frozen()).toBe(true);
    desktop.sync(world, 1, 0.5, 1 / 60);
    expect(desktop.frozen()).toBe(false);
    desktop.dispose();

    const phone = new WorldRenderer(new THREE.Scene(), () => ({ coarsePointer: true, reducedMotion: false }));
    phone.attachCamera({ shake: vi.fn() } as unknown as IsoCamera);
    phone.sync(world, 1, 0, 1 / 60);
    phone.consume([{ kind: 'explosion', entity: 1 as EntityId, radius: 4, at: { x: world.buddies[0].x, z: world.buddies[0].z } }]);
    expect(phone.frozen()).toBe(false);
    phone.dispose();
  });
});

describe('body language', () => {
  const actor = (over: Partial<ActorView>): ActorView => ({
    id: 1, team: 'red', x: 0, z: 0, heading: 0, state: 'idle',
    weapon: 'none', hpRatio: 1, phase: 0, flash: 0, pop: 0, ...over
  });

  function torsoScale(field: ChibiField, index: number): THREE.Vector3 {
    const mesh = field.group.children[index] as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(0, matrix);
    const scale = new THREE.Vector3();
    matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    return scale;
  }

  it('compresses the body under a carried crate', () => {
    const red = TEAM_IDS.indexOf('red');
    const idle = new ChibiField(createMaterials());
    idle.sync([actor({ state: 'idle' })], 0);
    const carrying = new ChibiField(createMaterials());
    carrying.sync([actor({ state: 'carry' })], 0);

    expect(torsoScale(carrying, red).y).toBeLessThan(torsoScale(idle, red).y);
    expect(torsoScale(carrying, red).x).toBeGreaterThan(torsoScale(idle, red).x);
  });

  it('pops the body at the moment of a knockout', () => {
    const red = TEAM_IDS.indexOf('red');
    const flat = new ChibiField(createMaterials());
    flat.sync([actor({ state: 'ko' })], 0);
    const popped = new ChibiField(createMaterials());
    popped.sync([actor({ state: 'ko', pop: 1 })], 0);

    expect(torsoScale(popped, red).y).toBeGreaterThan(torsoScale(flat, red).y);
  });
});

describe('hit stop policy', () => {
  const clear = { strength: 0.28, coarsePointer: false, reducedMotion: false, frameMs: 12 };

  it('freezes only for a strong blast on a fast desktop', () => {
    expect(blastWorthFreezing(clear)).toBe(true);
    expect(blastWorthFreezing({ ...clear, strength: 0.05 })).toBe(false);
    expect(blastWorthFreezing({ ...clear, coarsePointer: true })).toBe(false);
    expect(blastWorthFreezing({ ...clear, reducedMotion: true })).toBe(false);
    expect(blastWorthFreezing({ ...clear, frameMs: SLOW_FRAME_MS + 4 })).toBe(false);
  });

  it('expires after its window', () => {
    const stop = createHitStop();
    expect(stop.frozen(0)).toBe(false);
    stop.trigger(10);
    expect(stop.frozen(10 + HIT_STOP_S / 2)).toBe(true);
    expect(stop.frozen(10 + HIT_STOP_S * 2)).toBe(false);
  });
});

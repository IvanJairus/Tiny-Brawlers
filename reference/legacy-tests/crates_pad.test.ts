import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  createCrateMesh,
  CrateGeometryCache,
  CrateMaterialCache,
  disposeCrateSharedResources,
  calculateHeadCarryTransform,
  calculateThrowAngularImpulse,
  updateCrateTumbleAndSettling,
  CRATE_DIMENSIONS,
  CRATE_COLORS
} from '../src/rendering/crateModel';
import { CrateEntity } from '../src/entities/crate';
import { StackingPad } from '../src/entities/basePad';
import { TinyBrawlersGame } from '../src/game';

describe('Milestone 3: 3D Wooden Crates & Stacking Pad Interaction', () => {
  afterEach(() => {
    disposeCrateSharedResources();
  });

  describe('1. 3D Stylized Wooden Crate Compound Model & Caches', () => {
    it('creates compound crate group with 0.9x0.9x0.9 body, 12 diagonal braces, and 8 metal corners', () => {
      const crateMesh = createCrateMesh();
      expect(crateMesh).toBeDefined();
      expect(crateMesh.name).toBe('crate_compound_root');

      // Core body
      const core = crateMesh.getObjectByName('crate_body_core') as THREE.Mesh;
      expect(core).toBeDefined();
      expect(core.geometry).toBeInstanceOf(THREE.BoxGeometry);
      const coreGeo = core.geometry as THREE.BoxGeometry;
      expect(coreGeo.parameters.width).toBe(0.9);
      expect(coreGeo.parameters.height).toBe(0.9);
      expect(coreGeo.parameters.depth).toBe(0.9);

      // Braces group (12 diagonal braces across 6 faces)
      const bracesGroup = crateMesh.getObjectByName('crate_braces') as THREE.Group;
      expect(bracesGroup).toBeDefined();
      expect(bracesGroup.children.length).toBe(12);

      // Corners group (8 dark metal reinforcement brackets)
      const cornersGroup = crateMesh.getObjectByName('crate_corners') as THREE.Group;
      expect(cornersGroup).toBeDefined();
      expect(cornersGroup.children.length).toBe(8);
    });

    it('reuses static geometry and material caches across multiple crate instances (zero leaks)', () => {
      const crate1 = createCrateMesh();
      const crate2 = createCrateMesh();

      const core1 = crate1.getObjectByName('crate_body_core') as THREE.Mesh;
      const core2 = crate2.getObjectByName('crate_body_core') as THREE.Mesh;
      expect(core1.geometry).toBe(core2.geometry);
      expect(core1.material).toBe(core2.material);

      const corner1 = (crate1.getObjectByName('crate_corners') as THREE.Group).children[0] as THREE.Mesh;
      const corner2 = (crate2.getObjectByName('crate_corners') as THREE.Group).children[0] as THREE.Mesh;
      expect(corner1.geometry).toBe(corner2.geometry);
      expect(corner1.material).toBe(corner2.material);
    });

    it('cleanly disposes cached resources via disposeCrateSharedResources', () => {
      createCrateMesh();
      expect(() => disposeCrateSharedResources()).not.toThrow();
    });
  });

  describe('2. Head Carry Mounting & Walking Bob Physics', () => {
    it('calculates walking bob with two bounces per stride cycle and waddle tilt when moving', () => {
      const carrierPos = { x: 10, y: 0.7, z: 5 };
      const facingAngle = 1.2;
      const walkPhase = Math.PI * 0.25; // sin(0.5 * PI) = 1.0 (peak bounce)

      const transform = calculateHeadCarryTransform(carrierPos, facingAngle, true, walkPhase, 0);

      expect(transform.x).toBe(10);
      expect(transform.z).toBe(5);
      expect(transform.rotY).toBe(facingAngle);
      // y = carrier.y + 1.15 + sin(walkPhase * 2) * 0.05 = 0.7 + 1.15 + 0.05 = 1.90
      expect(transform.y).toBeCloseTo(0.7 + 1.15 + 0.05, 3);
      expect(transform.rotZ).toBeCloseTo(Math.sin(walkPhase) * 0.04, 3);
    });

    it('calculates gentle breathing squish when idle', () => {
      const carrierPos = { x: 0, y: 0.7, z: 0 };
      const time = Math.PI * 0.125; // sin(4 * time) = sin(0.5 * PI) = 1.0

      const transform = calculateHeadCarryTransform(carrierPos, 0, false, 0, time);

      expect(transform.y).toBeCloseTo(0.7 + 1.15 + 0.03, 3);
      expect(transform.rotZ).toBe(0);
      expect(transform.rotX).toBe(0);
    });
  });

  describe('3. Throw Flight & Tumble Dynamics', () => {
    it('computes angular tumble impulse around lateral axis perpendicular to forward', () => {
      const forwardDir = { x: 0, y: 0, z: 1 }; // forward along +Z
      const impulse = calculateThrowAngularImpulse(forwardDir, 14.0);

      // Lateral axis (-fz, 0, fx) = (-1, 0, 0)
      expect(impulse.x).toBeLessThan(0);
      expect(Math.abs(impulse.x)).toBeCloseTo(6.0 + 14.0 * 0.25, 2);
    });

    it('integrates tumble angles during flight and rights crate to flat face on ground landing', () => {
      const rotation = { x: 0.8, y: 0, z: 0.7 };
      const angularVel = { x: 5.0, y: 0, z: 5.0 };

      // In flight: angles integrate freely
      updateCrateTumbleAndSettling(rotation, angularVel, false, 4.0, 0.1);
      expect(rotation.x).toBeCloseTo(0.8 + 0.5, 2);

      // On ground: angular velocity damps, rights towards nearest orthogonal multiple of PI/2
      for (let i = 0; i < 30; i++) {
        updateCrateTumbleAndSettling(rotation, angularVel, true, 0.5, 0.1);
      }
      const nearestMultipleX = Math.round(rotation.x / (Math.PI / 2)) * (Math.PI / 2);
      expect(rotation.x).toBeCloseTo(nearestMultipleX, 1);
    });
  });

  describe('4. CrateEntity Parabolic Hop Snapping Animation', () => {
    it('animates parabolic hop and settles at target pad grid slot', () => {
      const crate = new CrateEntity('crate_snap_test', { x: 0, y: 0.35, z: 0 });
      const padPos = { x: 18, y: 0, z: 18 };

      // Snap with animation to slot 0 (Layer 0, NW: x = 18 - 0.55, y = 0.55, z = 18 - 0.55)
      crate.snapToPad('cyan', 0, padPos, true);
      expect(crate.isSnapping).toBe(true);
      expect(crate.isStackedOnPad).toBe(false);
      expect(crate.snapTargetPos.x).toBeCloseTo(17.45, 2);
      expect(crate.snapTargetPos.y).toBeCloseTo(0.55, 2);
      expect(crate.snapTargetPos.z).toBeCloseTo(17.45, 2);

      // Mid-flight step (hop peak +0.12m)
      crate.updatePhysics(0.09); // Halfway through SNAP_DURATION (0.18s)
      expect(crate.isSnapping).toBe(true);
      expect(crate.position.y).toBeGreaterThan(0.35);

      // Finish animation step
      crate.updatePhysics(0.12);
      expect(crate.isSnapping).toBe(false);
      expect(crate.isStackedOnPad).toBe(true);
      expect(crate.position.x).toBeCloseTo(17.45, 2);
      expect(crate.position.y).toBeCloseTo(0.55, 2);
      expect(crate.position.z).toBeCloseTo(17.45, 2);
      expect(crate.rotation.x).toBe(0);
      expect(crate.rotation.y).toBe(0);
      expect(crate.rotation.z).toBe(0);
    });
  });

  describe('5. 2x2x2 Pad Coordinate Geometry & Spatial Snapping', () => {
    it('calculates exact 0.9m grid coordinates for all 8 pad slots (±0.55, y=0.55 / 1.50)', () => {
      const pad = new StackingPad('red', -18, -18);

      // Layer 0 (slots 0..3)
      for (let i = 0; i < 4; i++) {
        const coord = pad.getSlotCoordinates(i);
        expect(coord.layer).toBe(0);
        expect(coord.local.y).toBe(0.55);
        expect(coord.world.y).toBe(0.55);
        expect(Math.abs(coord.local.x)).toBe(0.55);
        expect(Math.abs(coord.local.z)).toBe(0.55);
      }

      // Layer 1 (slots 4..7)
      for (let i = 4; i < 8; i++) {
        const coord = pad.getSlotCoordinates(i);
        expect(coord.layer).toBe(1);
        expect(coord.local.y).toBe(1.50);
        expect(coord.world.y).toBe(1.50);
        expect(Math.abs(coord.local.x)).toBe(0.55);
        expect(Math.abs(coord.local.z)).toBe(0.55);
      }
    });

    it('spatially resolves the nearest valid slot based on incoming position', () => {
      const pad = new StackingPad('blue', 18, -18);

      // Approaching from NW (-0.55, -0.55) -> Slot 0
      const bestNW = pad.findBestSlotForPosition(18 - 1.0, -18 - 1.0);
      expect(bestNW).toBe(0);

      // Fill slot 0: next closest in that quadrant is top slot 4
      pad.setSlot(0, true);
      const bestNWTop = pad.findBestSlotForPosition(18 - 1.0, -18 - 1.0);
      expect(bestNWTop).toBe(4);

      // Fill slot 4: cascades to adjacent nearest bottom slot (slot 1 or 2)
      pad.setSlot(4, true);
      const bestCascade = pad.findBestSlotForPosition(18 - 1.0, -18 - 1.0);
      expect([1, 2]).toContain(bestCascade);
    });

    it('evaluates all 7 recipes via evaluate() and evaluateRecipe() alias', () => {
      const pad = new StackingPad('yellow', -18, 18);
      expect(pad.evaluateRecipe().category).toBe('empty');

      // 1. Pistol (1 crate)
      pad.setSlot(0, true);
      expect(pad.evaluateRecipe().itemType).toBe('pistol');

      // 2. Shotgun (2 crates horizontal)
      pad.setSlot(1, true);
      expect(pad.evaluateRecipe().itemType).toBe('shotgun');

      // 3. Grenade (2 crates vertical)
      pad.clear();
      pad.setSlot(2, true);
      pad.setSlot(6, true);
      expect(pad.evaluateRecipe().itemType).toBe('grenade');

      // 4A. Medic Buddy unit (2 bottom + 1 top)
      pad.clear();
      pad.setSlot(0, true);
      pad.setSlot(1, true);
      pad.setSlot(4, true);
      expect(pad.evaluateRecipe().itemType).toBe('medic_unit');

      // 4B. Medic Syringe weapon (3 bottom flat)
      pad.clear();
      pad.setSlot(0, true);
      pad.setSlot(1, true);
      pad.setSlot(2, true);
      expect(pad.evaluateRecipe().itemType).toBe('medic');

      // 5. Rocket Bazooka (4 bottom flat)
      pad.setSlot(3, true);
      expect(pad.evaluateRecipe().itemType).toBe('bazooka');

      // 6. Commando Buddy unit (4 vertical wall)
      pad.clear();
      pad.setSlot(0, true);
      pad.setSlot(1, true);
      pad.setSlot(4, true);
      pad.setSlot(5, true);
      expect(pad.evaluateRecipe().itemType).toBe('commando');

      // 7. Heavy Battle Tank (full 8 crates)
      for (let i = 0; i < 8; i++) {
        if (i < 4) pad.setSlot(i, true);
        else pad.setSlot(i, true);
      }
      expect(pad.evaluateRecipe().itemType).toBe('tank');
      expect(pad.evaluateRecipe().category).toBe('vehicle');
      expect(pad.evaluateRecipe().dps).toBe(980);
    });
  });

  describe('6. Game Pad Build Lifecycle & Mesh Memory Cleanup', () => {
    it('removes Three.js meshes from scene and map when pad build is triggered (zero leaks)', () => {
      const mockContainer = { clientWidth: 800, clientHeight: 600, appendChild: () => {} } as any;
      const game = new TinyBrawlersGame(mockContainer);

      // Place 2 crates on red pad
      const c1 = new CrateEntity('pad_crate_1', { x: -18, y: 0.55, z: -18 });
      c1.isStackedOnPad = true;
      c1.padTeamId = 'red';
      c1.padSlotIndex = 0;
      game.crates.push(c1);

      const c2 = new CrateEntity('pad_crate_2', { x: -18, y: 0.55, z: -18 });
      c2.isStackedOnPad = true;
      c2.padTeamId = 'red';
      c2.padSlotIndex = 1;
      game.crates.push(c2);

      game.pads['red'].setSlot(0, true);
      game.pads['red'].setSlot(1, true);

      // Render one frame to create crate meshes
      (game as any).render(0.016);
      expect((game as any).crateMeshes.has('pad_crate_1')).toBe(true);
      expect((game as any).crateMeshes.has('pad_crate_2')).toBe(true);

      // Trigger pad build
      game.triggerPadBuild('red');

      // Crates should be removed from game.crates and crateMeshes
      expect(game.crates.some((c) => c.padTeamId === 'red')).toBe(false);
      expect((game as any).crateMeshes.has('pad_crate_1')).toBe(false);
      expect((game as any).crateMeshes.has('pad_crate_2')).toBe(false);
      expect(game.pads['red'].totalCrates).toBe(0);
    });

    it('spawns HeavyBattleTank when 8-crate pad build is triggered and mounts nearby buddy', () => {
      const mockContainer = { clientWidth: 800, clientHeight: 600, appendChild: () => {} } as any;
      const game = new TinyBrawlersGame(mockContainer);

      // Fill red pad with 8 crates
      for (let i = 0; i < 8; i++) {
        const c = new CrateEntity(`c_tank_${i}`, { x: -18, y: 0.55, z: -18 });
        c.isStackedOnPad = true;
        c.padTeamId = 'red';
        c.padSlotIndex = i;
        game.crates.push(c);
        game.pads['red'].setSlot(i, true);
      }

      // Position player near pad
      game.player.position = { x: -17, y: 0.7, z: -17 };

      game.triggerPadBuild('red');

      expect(game.tanks.length).toBe(1);
      const tank = game.tanks[0];
      expect(tank.team).toBe('red');
      expect(tank.isOccupied).toBe(true);
      expect(tank.driverId).toBe(game.player.id);
      expect(game.player.isInTank).toBe(true);
      expect(game.tankMeshes.has(tank.id)).toBe(true);
    });
  });
});

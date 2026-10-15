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
import { Vector3D } from '../src/types';

describe('Milestone 3 Empirical Stress Testing Suite (Challenger 1)', () => {
  afterEach(() => {
    disposeCrateSharedResources();
  });

  /* =========================================================================
     1. Crate Model Integrity & Geometry/Material Cache Verification
     ========================================================================= */
  describe('1. Crate Model Integrity & Hierarchy Verification', () => {
    it('verifies compound 3D crate group has all 21 expected meshes (body, 12 diagonal braces, 8 corner brackets)', () => {
      const crateMesh = createCrateMesh();
      expect(crateMesh).toBeInstanceOf(THREE.Group);
      expect(crateMesh.name).toBe('crate_compound_root');

      // 1. Core warm wood body
      const core = crateMesh.getObjectByName('crate_body_core') as THREE.Mesh;
      expect(core).toBeDefined();
      expect(core.isMesh).toBe(true);
      const coreGeo = core.geometry as THREE.BoxGeometry;
      expect(coreGeo.parameters.width).toBeCloseTo(0.90, 3);
      expect(coreGeo.parameters.height).toBeCloseTo(0.90, 3);
      expect(coreGeo.parameters.depth).toBeCloseTo(0.90, 3);
      expect((core.material as THREE.MeshStandardMaterial).color.getHex()).toBe(CRATE_COLORS.woodCore);

      // 2. Embossed diagonal braces (all 6 faces, 2 per face = 12 total)
      const bracesGroup = crateMesh.getObjectByName('crate_braces') as THREE.Group;
      expect(bracesGroup).toBeDefined();
      expect(bracesGroup.children.length).toBe(12);

      const expectedFaces = ['front', 'back', 'right', 'left', 'top', 'bottom'];
      for (const face of expectedFaces) {
        const b1 = crateMesh.getObjectByName(`brace_${face}_1`) as THREE.Mesh;
        const b2 = crateMesh.getObjectByName(`brace_${face}_2`) as THREE.Mesh;
        expect(b1).toBeDefined();
        expect(b2).toBeDefined();
        expect(b1.isMesh).toBe(true);
        expect(b2.isMesh).toBe(true);

        const geo1 = b1.geometry as THREE.BoxGeometry;
        expect(geo1.parameters.width).toBeCloseTo(CRATE_DIMENSIONS.braceWidth, 3);
        expect(geo1.parameters.height).toBeCloseTo(CRATE_DIMENSIONS.braceLength, 3);
        expect(geo1.parameters.depth).toBeCloseTo(CRATE_DIMENSIONS.braceThickness, 3);
      }

      // 3. Corner reinforcement brackets (8 corners)
      const cornersGroup = crateMesh.getObjectByName('crate_corners') as THREE.Group;
      expect(cornersGroup).toBeDefined();
      expect(cornersGroup.children.length).toBe(8);

      for (let i = 0; i < 8; i++) {
        const corner = crateMesh.getObjectByName(`corner_bracket_${i}`) as THREE.Mesh;
        expect(corner).toBeDefined();
        expect(corner.isMesh).toBe(true);
        const cornerGeo = corner.geometry as THREE.BoxGeometry;
        expect(cornerGeo.parameters.width).toBeCloseTo(CRATE_DIMENSIONS.cornerSize, 3);
        expect(cornerGeo.parameters.height).toBeCloseTo(CRATE_DIMENSIONS.cornerSize, 3);
        expect(cornerGeo.parameters.depth).toBeCloseTo(CRATE_DIMENSIONS.cornerSize, 3);
      }

      // 4. Count total meshes in hierarchy: 1 core + 12 braces + 8 corners = 21 meshes
      let totalMeshes = 0;
      crateMesh.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          totalMeshes++;
        }
      });
      expect(totalMeshes).toBe(21);
    });

    it('verifies geometry and material singleton caches prevent memory leaks across 100 crate instantiations', () => {
      const crates: THREE.Group[] = [];
      for (let i = 0; i < 100; i++) {
        crates.push(createCrateMesh());
      }

      const firstCore = crates[0].getObjectByName('crate_body_core') as THREE.Mesh;
      const firstBrace = crates[0].getObjectByName('brace_front_1') as THREE.Mesh;
      const firstCorner = crates[0].getObjectByName('corner_bracket_0') as THREE.Mesh;

      for (let i = 1; i < 100; i++) {
        const core = crates[i].getObjectByName('crate_body_core') as THREE.Mesh;
        const brace = crates[i].getObjectByName('brace_front_1') as THREE.Mesh;
        const corner = crates[i].getObjectByName('corner_bracket_0') as THREE.Mesh;

        // Geometries MUST be identical references
        expect(core.geometry).toBe(firstCore.geometry);
        expect(brace.geometry).toBe(firstBrace.geometry);
        expect(corner.geometry).toBe(firstCorner.geometry);

        // Materials MUST be identical references
        expect(core.material).toBe(firstCore.material);
        expect(brace.material).toBe(firstBrace.material);
        expect(corner.material).toBe(firstCorner.material);
      }
    });
  });

  /* =========================================================================
     2. Throw Tumble Physics Stress Testing (1,000 Randomized Runs + Boundary Checks)
     ========================================================================= */
  describe('2. Throw Tumble Physics Stress Testing', () => {
    it('simulates 1,000 randomized throw velocities and directions and verifies clean settling to upright flat face without NaN', () => {
      const NUM_SIMS = 1000;
      let settledCount = 0;

      for (let i = 0; i < NUM_SIMS; i++) {
        const crate = new CrateEntity(`crate_stress_${i}`, { x: 0, y: 0.35, z: 0 });

        // Random direction on unit circle (XZ plane)
        const angle = Math.random() * Math.PI * 2;
        const forwardDir: Vector3D = {
          x: Math.cos(angle),
          y: 0,
          z: Math.sin(angle)
        };
        // Random throw force between 5.0 and 45.0
        const throwForce = 5.0 + Math.random() * 40.0;

        crate.throwCrate({ x: 0, y: 0.35, z: 0 }, forwardDir, throwForce);

        // Verify initial tumble impulse has non-zero angular velocity
        expect(Number.isFinite(crate.angularVelocity.x)).toBe(true);
        expect(Number.isFinite(crate.angularVelocity.y)).toBe(true);
        expect(Number.isFinite(crate.angularVelocity.z)).toBe(true);
        expect(Math.hypot(crate.angularVelocity.x, crate.angularVelocity.z)).toBeGreaterThan(0);

        // Simulate flight and ground settling with fixed dt = 0.016s for up to 300 steps (4.8 seconds)
        const dt = 0.016;
        for (let step = 0; step < 300; step++) {
          crate.updatePhysics(dt);

          // Invariant: Position and Rotation must NEVER contain NaN or Infinity
          expect(Number.isFinite(crate.position.x)).toBe(true);
          expect(Number.isFinite(crate.position.y)).toBe(true);
          expect(Number.isFinite(crate.position.z)).toBe(true);
          expect(Number.isFinite(crate.rotation.x)).toBe(true);
          expect(Number.isFinite(crate.rotation.y)).toBe(true);
          expect(Number.isFinite(crate.rotation.z)).toBe(true);
        }

        // After 4.8 seconds, the crate must be grounded at y = 0.35
        expect(crate.position.y).toBeCloseTo(0.35, 2);
        // Linear velocity should be stopped
        expect(Math.hypot(crate.velocity.x, crate.velocity.z)).toBe(0);

        // Pitch (rot.x) and Roll (rot.z) must settle cleanly to an orthogonal multiple of PI/2
        const halfPi = Math.PI / 2;
        const pitchMod = Math.abs(crate.rotation.x % halfPi);
        const pitchDist = Math.min(pitchMod, halfPi - pitchMod);

        const rollMod = Math.abs(crate.rotation.z % halfPi);
        const rollDist = Math.min(rollMod, halfPi - rollMod);

        expect(pitchDist).toBeLessThan(0.02);
        expect(rollDist).toBeLessThan(0.02);

        // Angular velocities must be zeroed out
        expect(crate.angularVelocity.x).toBe(0);
        expect(crate.angularVelocity.y).toBe(0);
        expect(crate.angularVelocity.z).toBe(0);

        settledCount++;
      }

      expect(settledCount).toBe(NUM_SIMS);
    });

    describe('Boundary & Adversarial Physics Inputs', () => {
      it('handles zero throw force without crashing or producing NaN', () => {
        const crate = new CrateEntity('crate_zero_force', { x: 0, y: 0.35, z: 0 });
        crate.throwCrate({ x: 0, y: 0.35, z: 0 }, { x: 1, y: 0, z: 0 }, 0);

        for (let step = 0; step < 100; step++) {
          crate.updatePhysics(0.016);
          expect(Number.isFinite(crate.position.x)).toBe(true);
          expect(Number.isFinite(crate.rotation.x)).toBe(true);
        }

        expect(crate.position.y).toBeCloseTo(0.35, 2);
      });

      it('handles extreme hyper-velocity throw (force = 10,000) without numerical overflow', () => {
        const crate = new CrateEntity('crate_hyper_vel', { x: 0, y: 0.35, z: 0 });
        crate.throwCrate({ x: 0, y: 0.35, z: 0 }, { x: 0, y: 0, z: 1 }, 10000);

        expect(Number.isFinite(crate.velocity.z)).toBe(true);
        expect(Number.isFinite(crate.angularVelocity.x)).toBe(true);

        for (let step = 0; step < 200; step++) {
          crate.updatePhysics(0.016);
          expect(Number.isFinite(crate.position.z)).toBe(true);
          expect(Number.isFinite(crate.rotation.x)).toBe(true);
        }
      });

      it('handles huge delta time (dt = 100.0s) gracefully', () => {
        const crate = new CrateEntity('crate_huge_dt', { x: 0, y: 5.0, z: 0 });
        crate.velocity = { x: 2.0, y: 1.0, z: 0 };
        crate.angularVelocity = { x: 5.0, y: 2.0, z: 3.0 };

        // Single giant step
        crate.updatePhysics(100.0);

        expect(Number.isFinite(crate.position.y)).toBe(true);
        expect(crate.position.y).toBe(0.35); // Grounded
        expect(Number.isFinite(crate.rotation.x)).toBe(true);
        expect(Number.isFinite(crate.rotation.z)).toBe(true);
      });

      it('investigates negative and zero dt behavior', () => {
        const crate = new CrateEntity('crate_edge_dt', { x: 0, y: 0.35, z: 0 });
        
        // Zero dt: position and velocity remain unchanged
        const startX = crate.position.x;
        crate.updatePhysics(0);
        expect(crate.position.x).toBe(startX);
        expect(Number.isFinite(crate.rotation.x)).toBe(true);
      });
    });
  });

  /* =========================================================================
     3. Pad Slot Snapping Stress Testing (1,000 Randomized Drops & Structural Gravity)
     ========================================================================= */
  describe('3. Pad Slot Snapping & Structural Gravity Stress Testing', () => {
    it('simulates 1,000 randomized drop positions and verifies strict Layer 0 priority', () => {
      const pad = new StackingPad('red', 0, 0);

      // Across 1,000 random drops in range [-4, +4]m around pad origin
      for (let i = 0; i < 1000; i++) {
        pad.clear();

        const randX = (Math.random() - 0.5) * 8.0;
        const randZ = (Math.random() - 0.5) * 8.0;

        // When pad is completely empty, chosen slot MUST be in Layer 0 (0..3)
        const chosenSlot = pad.findBestSlotForPosition(randX, randZ);
        expect(chosenSlot).toBeGreaterThanOrEqual(0);
        expect(chosenSlot).toBeLessThan(4); // Strictly bottom layer!
      }
    });

    it('strictly enforces structural gravity: Layer 1 requires Layer 0 occupied', () => {
      const pad = new StackingPad('blue', 10, 10);

      // Attempting to set any top layer slot (4..7) when bottom is empty must be rejected
      for (let topSlot = 4; topSlot < 8; topSlot++) {
        pad.clear();
        const success = pad.setSlot(topSlot, true);
        expect(success).toBe(false);
        expect(pad.slots[topSlot]).toBe(false);
      }

      // When bottom slot is set, top slot can be filled
      for (let q = 0; q < 4; q++) {
        pad.clear();
        expect(pad.setSlot(q, true)).toBe(true);
        expect(pad.setSlot(q + 4, true)).toBe(true);
        expect(pad.slots[q]).toBe(true);
        expect(pad.slots[q + 4]).toBe(true);

        // When bottom slot is removed, top slot must automatically drop/clear
        pad.setSlot(q, false);
        expect(pad.slots[q]).toBe(false);
        expect(pad.slots[q + 4]).toBe(false);
      }
    });

    it('verifies slot proximity selection overflows to Layer 1 only when Layer 0 is occupied', () => {
      const pad = new StackingPad('yellow', 0, 0);

      // Fill quadrant 0 bottom slot (slot 0)
      pad.setSlot(0, true);

      // Drop crate right at quadrant 0 coordinates (-0.55, -0.55)
      const slot = pad.findBestSlotForPosition(-0.55, -0.55);
      // Because bottom slot 0 is occupied, it should pick top slot 4
      expect(slot).toBe(4);

      // Fill top slot 4 as well
      pad.setSlot(4, true);

      // Now quadrant 0 is completely full (bottom 0, top 4).
      // Dropping at (-0.55, -0.55) must now overflow to the next nearest quadrant on Layer 0!
      const nextSlot = pad.findBestSlotForPosition(-0.55, -0.55);
      expect(nextSlot).toBeGreaterThanOrEqual(0);
      expect(nextSlot).toBeLessThan(4); // Must still pick a Layer 0 slot from another quadrant
      expect(nextSlot).not.toBe(0);
    });

    it('verifies full pad (8/8) returns -1 across 100 randomized positions', () => {
      const pad = new StackingPad('cyan', 5, -5);
      for (let i = 0; i < 8; i++) {
        pad.setSlot(i, true);
      }
      expect(pad.totalCrates).toBe(8);

      for (let i = 0; i < 100; i++) {
        const randX = 5 + (Math.random() - 0.5) * 10;
        const randZ = -5 + (Math.random() - 0.5) * 10;
        expect(pad.findBestSlotForPosition(randX, randZ)).toBe(-1);
      }
    });

    it('verifies snapToPad strictly clamps to exact coordinates (±0.55, 0.55 / 1.50)', () => {
      const origin: Vector3D = { x: -18, y: 0, z: -18 };

      // Test all 8 slots
      for (let slot = 0; slot < 8; slot++) {
        const crate = new CrateEntity(`c_snap_${slot}`, { x: 0, y: 0, z: 0 });
        crate.snapToPad('red', slot, origin, false, 'm3');

        const layer = slot >= 4 ? 1 : 0;
        const quad = slot % 4;

        const expectedLocalX = (quad % 2 === 1) ? 0.55 : -0.55;
        const expectedLocalZ = quad >= 2 ? 0.55 : -0.55;
        const expectedLocalY = layer === 1 ? 1.50 : 0.55;

        expect(crate.position.x).toBeCloseTo(origin.x + expectedLocalX, 3);
        expect(crate.position.y).toBeCloseTo(expectedLocalY, 3);
        expect(crate.position.z).toBeCloseTo(origin.z + expectedLocalZ, 3);

        // Rotation must be axis-aligned
        expect(crate.rotation.x).toBe(0);
        expect(crate.rotation.y).toBe(0);
        expect(crate.rotation.z).toBe(0);
        expect(crate.isStackedOnPad).toBe(true);
      }
    });

    it('verifies animated parabolic hop smoothly eases into exact coordinates over duration', () => {
      const origin: Vector3D = { x: 0, y: 0, z: 0 };
      const crate = new CrateEntity('c_hop', { x: 2, y: 0.35, z: 2 });
      crate.snapToPad('blue', 0, origin, true, 'm3');

      expect(crate.isSnapping).toBe(true);
      expect(crate.isStackedOnPad).toBe(false);

      // Advance by half SNAP_DURATION (t = 0.5)
      crate.updatePhysics(CrateEntity.SNAP_DURATION / 2);
      expect(crate.isSnapping).toBe(true);
      // Peak hop should be elevated
      expect(crate.position.y).toBeGreaterThan(0.35);

      // Advance past full duration
      crate.updatePhysics(CrateEntity.SNAP_DURATION);
      expect(crate.isSnapping).toBe(false);
      expect(crate.isStackedOnPad).toBe(true);
      expect(crate.position.x).toBeCloseTo(-0.55, 3);
      expect(crate.position.y).toBeCloseTo(0.55, 3);
      expect(crate.position.z).toBeCloseTo(-0.55, 3);
    });
  });

  /* =========================================================================
     4. Mesh Leak Resolution: 50 Consecutive Pad Build Cycles in game.ts
     ========================================================================= */
  describe('4. Mesh Leak Resolution Across 50 Consecutive Pad Build Cycles', () => {
    it('simulates 50 consecutive pad build cycles in TinyBrawlersGame and asserts zero orphan Three.js meshes', () => {
      const mockContainer = {
        clientWidth: 800,
        clientHeight: 600,
        appendChild: () => {}
      } as any;

      const game = new TinyBrawlersGame(mockContainer);

      // Initial baseline scene child count (arena, bunkers, lights, etc.)
      (game as any).render(0.016);
      const baselineMeshCount = (game as any).scene.children.length;

      const NUM_CYCLES = 50;

      for (let cycle = 0; cycle < NUM_CYCLES; cycle++) {
        // Alternating recipe patterns: 2 crates, 4 crates, 8 crates
        const crateCount = (cycle % 3 === 0) ? 8 : (cycle % 3 === 1) ? 4 : 2;
        const team = (['red', 'blue', 'yellow', 'cyan'] as const)[cycle % 4];
        const pad = game.pads[team];

        // Ensure pad is clear
        pad.clear();

        // Add crates to game and pad
        for (let i = 0; i < crateCount; i++) {
          const c = new CrateEntity(`cycle_${cycle}_crate_${i}`, {
            x: pad.origin.x,
            y: 0.55,
            z: pad.origin.z
          });
          c.isStackedOnPad = true;
          c.padTeamId = team;
          c.padSlotIndex = i;
          game.crates.push(c);
          pad.setSlot(i, true);
        }

        // Render one frame to construct 3D crate meshes in scene
        (game as any).render(0.016);

        // Verify crate meshes were tracked
        for (let i = 0; i < crateCount; i++) {
          expect((game as any).crateMeshes.has(`cycle_${cycle}_crate_${i}`)).toBe(true);
        }

        // Trigger pad build
        game.triggerPadBuild(team);

        // Render again to execute mesh reconciliation
        (game as any).render(0.016);

        // Verify that all crates for this cycle were removed from crateMeshes map
        for (let i = 0; i < crateCount; i++) {
          expect((game as any).crateMeshes.has(`cycle_${cycle}_crate_${i}`)).toBe(false);
        }

        // Verify that no consumed crate meshes remain in scene.children
        for (let i = 0; i < crateCount; i++) {
          const childInScene = (game as any).scene.children.some((obj: any) => obj.name === `cycle_${cycle}_crate_${i}`);
          expect(childInScene).toBe(false);
        }

        // Verify pad state was reset
        expect(pad.totalCrates).toBe(0);
      }

      // After 50 build cycles, verify crateMeshes map is completely empty of pad crates
      expect((game as any).crateMeshes.size).toBe(0);

      // Verify that there are NO orphan crate meshes left in scene.children
      let remainingCrateMeshes = 0;
      (game as any).scene.traverse((obj: any) => {
        if (obj.name === 'crate_compound_root') {
          remainingCrateMeshes++;
        }
      });
      expect(remainingCrateMeshes).toBe(0);
    });
  });
});

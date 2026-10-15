import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  calculateIdleBounce,
  calculateWalkCycle,
  calculateCarryPose,
  calculateCelebrateJump,
  calculateKnockedPose,
  calculateThrowPose,
  shortestAngleDiff,
  lerpAngle,
  updateBuddyProceduralAnimation,
  getBuddyAnimTracker,
  resetAllAnimTrackers,
  cleanupStaleAnimTrackers
} from '../src/rendering/animations';
import { createChibiBuddyRig, ChibiRigInstance } from '../src/rendering/buddyRig';
import { BuddyEntity } from '../src/entities/buddy';
import { WeaponType } from '../src/types';

describe('Milestone 1 Empirical Stress Test Suite', () => {
  beforeEach(() => {
    resetAllAnimTrackers();
  });

  /* =========================================================================
     1. Mathematical Volume Preservation Tests
     ========================================================================= */
  describe('Volume Preservation: Sxz^2 * Sy ≈ 1.0', () => {
    it('preserves volume within 0.3% error across 10,000 time steps of idle bounce', () => {
      let minVol = Infinity;
      let maxVol = -Infinity;

      // Sample t from 0 to 10 seconds at 1ms intervals (covers 6.3+ full bounce cycles)
      for (let t = 0; t <= 10.0; t += 0.001) {
        const frame = calculateIdleBounce(t);
        const sx = frame.bodyScaleX;
        const sy = frame.bodyScaleY;
        const sz = frame.bodyScaleZ;

        // Radial symmetry check
        expect(sx).toBeCloseTo(sz, 6);

        // Volume calculation: V = Sx * Sy * Sz = Sxz^2 * Sy
        const volume = sx * sz * sy;
        if (volume < minVol) minVol = volume;
        if (volume > maxVol) maxVol = volume;

        // Volume must be within 0.3% of 1.0 (0.997 <= V <= 1.000)
        expect(volume).toBeGreaterThanOrEqual(0.997);
        expect(volume).toBeLessThanOrEqual(1.0001);
      }

      // Assert bounds empirically observed
      expect(minVol).toBeGreaterThanOrEqual(0.9972);
      expect(maxVol).toBeLessThanOrEqual(1.00001);
      const maxDeviation = Math.max(Math.abs(1.0 - minVol), Math.abs(maxVol - 1.0));
      expect(maxDeviation).toBeLessThan(0.003); // < 0.3% maximum error
    });

    it('exhibits correct squash at bounce minimum and stretch at bounce apex', () => {
      // Bounce apex: sin(4t) = 1 -> 4t = π/2 -> t = π/8
      const apexFrame = calculateIdleBounce(Math.PI / 8);
      expect(apexFrame.bodyScaleY).toBeGreaterThan(1.05); // Stretched
      expect(apexFrame.bodyScaleX).toBeLessThan(0.98); // Thinned
      expect(apexFrame.bodyScaleX * apexFrame.bodyScaleZ * apexFrame.bodyScaleY).toBeCloseTo(0.99735, 4);

      // Bounce trough: sin(4t) = -1 -> 4t = 3π/2 -> t = 3π/8
      const troughFrame = calculateIdleBounce((3 * Math.PI) / 8);
      expect(troughFrame.bodyScaleY).toBeLessThan(0.95); // Squashed
      expect(troughFrame.bodyScaleX).toBeGreaterThan(1.02); // Widened
      expect(troughFrame.bodyScaleX * troughFrame.bodyScaleZ * troughFrame.bodyScaleY).toBeCloseTo(0.99725, 4);
    });
  });

  /* =========================================================================
     2. Extreme Conditions: Delta Time & Velocity Tests
     ========================================================================= */
  describe('Extreme Delta Time & Velocity Conditions', () => {
    let rig: ChibiRigInstance;
    let buddy: BuddyEntity;

    beforeEach(() => {
      rig = createChibiBuddyRig('red', 'fighter');
      buddy = new BuddyEntity('test_buddy_1', 'red', 'fighter', { x: 0, y: 0, z: 0 });
    });

    it('handles very large delta time (dt = 0.5s) safely without numerical explosion', () => {
      buddy.velocity = { x: 5, y: 0, z: 0 };
      // Call with large dt = 0.5s (simulating browser background tab resume)
      expect(() => {
        updateBuddyProceduralAnimation(rig, buddy, 0.5, 1.0);
      }).not.toThrow();

      // Transforms must remain strictly finite and within physical bounds
      expect(Number.isFinite(rig.bodyMesh.position.y)).toBe(true);
      expect(rig.bodyMesh.position.y).toBeGreaterThan(0.5);
      expect(rig.bodyMesh.position.y).toBeLessThan(1.5);
      expect(Number.isFinite(rig.root.rotation.y)).toBe(true);

      const tracker = getBuddyAnimTracker(buddy.id);
      expect(Number.isFinite(tracker.stridePhase)).toBe(true);
      expect(tracker.stridePhase).toBeGreaterThanOrEqual(0);
      expect(tracker.stridePhase).toBeLessThanOrEqual(Math.PI * 2);
    });

    it('handles zero and negative delta time gracefully without negative progression or NaN', () => {
      buddy.velocity = { x: 3, y: 0, z: 0 };
      const tracker = getBuddyAnimTracker(buddy.id);
      tracker.stridePhase = 1.0;
      tracker.throwTimer = 0.2;

      // dt = 0
      updateBuddyProceduralAnimation(rig, buddy, 0, 1.0);
      expect(tracker.stridePhase).toBe(1.0); // No progression
      expect(tracker.throwTimer).toBe(0.2); // No timer decrement

      // dt = -0.5 (negative dt / clock jitter)
      updateBuddyProceduralAnimation(rig, buddy, -0.5, 1.0);
      expect(tracker.stridePhase).toBe(1.0); // Clamped, not moved backwards
      expect(tracker.throwTimer).toBe(0.2);
      expect(Number.isFinite(rig.root.rotation.y)).toBe(true);
    });

    it('handles stationary character (speed = 0) maintaining orientation without jitter', () => {
      buddy.velocity = { x: 0, y: 0, z: 0 };
      const tracker = getBuddyAnimTracker(buddy.id);
      tracker.facingAngle = 1.25; // Pre-existing heading

      updateBuddyProceduralAnimation(rig, buddy, 0.016, 1.0);

      // Facing angle should remain preserved, not snap to 0 or NaN
      expect(tracker.facingAngle).toBe(1.25);
      expect(rig.root.rotation.y).toBe(1.25);
      expect(tracker.currentMode).toBe('idle');
    });

    it('handles extreme movement speed (50 m/s) with capped stride cadence and lean', () => {
      buddy.velocity = { x: 50, y: 0, z: 0 };

      for (let i = 0; i < 60; i++) {
        updateBuddyProceduralAnimation(rig, buddy, 0.016, i * 0.016);
      }

      // Torso lean must be strictly capped (not flipped over)
      expect(rig.bodyMesh.rotation.x).toBeLessThanOrEqual(0.06);
      expect(rig.bodyMesh.rotation.x).toBeGreaterThanOrEqual(-0.06);

      // Torso scales must remain strictly 1.0 in walk cycle
      expect(rig.bodyMesh.scale.x).toBe(1.0);
      expect(rig.bodyMesh.scale.y).toBe(1.0);
      expect(rig.bodyMesh.scale.z).toBe(1.0);

      // Boots must remain within ground walking bounds
      expect(rig.leftBootPivot.position.y).toBeGreaterThanOrEqual(0.13);
      expect(rig.leftBootPivot.position.y).toBeLessThanOrEqual(0.25);
      expect(rig.rightBootPivot.position.y).toBeGreaterThanOrEqual(0.13);
      expect(rig.rightBootPivot.position.y).toBeLessThanOrEqual(0.25);
    });

    it('verifies bilateral symmetry of torso waddle roll across full stride cycle', () => {
      // A genuine waddle sway rolls left on left step and right on right step
      const zRotations: number[] = [];
      for (let phase = 0; phase < Math.PI * 2; phase += 0.05) {
        const frame = calculateWalkCycle(phase);
        zRotations.push(frame.bodyRotZ);
      }

      const minZ = Math.min(...zRotations);
      const maxZ = Math.max(...zRotations);

      // Symmetrical waddle sway requires both negative (left) and positive (right) lean
      // Note: currently phase * 0.5 in [0, 2π) only covers [0, π), resulting in minZ = 0!
      expect(maxZ).toBeGreaterThan(0.04);
      expect(minZ).toBeLessThan(-0.04);
    });
  });

  /* =========================================================================
     3. Heading Rotation: ±π Boundary Wrap-Around Tests
     ========================================================================= */
  describe('Heading Rotation & Shortest-Arc Lerp', () => {
    it('computes shortestAngleDiff correctly across the ±π boundary', () => {
      const current = Math.PI - 0.05; // ~ +3.0916 rad
      const target = -Math.PI + 0.05; // ~ -3.0916 rad

      // The angular distance across boundary is +0.10 rad, NOT -6.18 rad!
      const diff = shortestAngleDiff(target, current);
      expect(diff).toBeCloseTo(0.10, 4);
      expect(Math.abs(diff)).toBeLessThan(0.20);
    });

    it('computes shortestAngleDiff correctly in reverse direction across boundary', () => {
      const current = -Math.PI + 0.05; // ~ -3.0916 rad
      const target = Math.PI - 0.05; // ~ +3.0916 rad

      const diff = shortestAngleDiff(target, current);
      expect(diff).toBeCloseTo(-0.10, 4);
      expect(Math.abs(diff)).toBeLessThan(0.20);
    });

    it('does NOT spin 360 degrees when crossing the ±π boundary during animation updates', () => {
      const rig = createChibiBuddyRig('blue', 'constructor');
      const buddy = new BuddyEntity('test_wrap', 'blue', 'constructor', { x: 0, y: 0, z: 0 });
      const tracker = getBuddyAnimTracker(buddy.id);

      // Start facing just below +PI: e.g. angle = 3.10 rad (facing backward-left)
      tracker.facingAngle = 3.10;

      // Velocity set to face just above -PI: vx = -0.01, vz = -1.0 -> atan2(-0.01, -1.0) ≈ -3.13 rad
      buddy.velocity = { x: -0.01, y: 0, z: -1.0 };

      let previousAngle = tracker.facingAngle;
      let totalAngleDelta = 0;

      // Simulate 10 frames of turning across boundary
      for (let f = 0; f < 10; f++) {
        updateBuddyProceduralAnimation(rig, buddy, 0.016, f * 0.016);
        const stepDelta = Math.abs(tracker.facingAngle - previousAngle);
        totalAngleDelta += stepDelta;
        previousAngle = tracker.facingAngle;

        // In NO single frame should the angle jump more than 0.5 rad (never a 360° flip)
        expect(stepDelta).toBeLessThan(0.5);
      }

      // Total angular distance travelled should be tiny (< 0.5 rad), NOT a full 2π spin (~6.28 rad)!
      expect(totalAngleDelta).toBeLessThan(0.5);
    });

    it('shortestAngleDiff never returns values outside [-π, π] for 1,000 random angle pairs', () => {
      for (let i = 0; i < 1000; i++) {
        const a = (Math.random() * 2 - 1) * Math.PI * 4; // Arbitrary angles, even > 2π
        const b = (Math.random() * 2 - 1) * Math.PI * 4;
        const diff = shortestAngleDiff(b, a);
        expect(diff).toBeGreaterThanOrEqual(-Math.PI - 1e-9);
        expect(diff).toBeLessThanOrEqual(Math.PI + 1e-9);
      }
    });
  });

  /* =========================================================================
     4. Rapid Knockout and Revive State Transitions
     ========================================================================= */
  describe('Rapid Knockout and Revive Oscillations', () => {
    it('maintains integrity under 500 rapid KO/revive state switches', () => {
      const rig = createChibiBuddyRig('yellow', 'healer');
      const buddy = new BuddyEntity('test_ko_revive', 'yellow', 'healer', { x: 0, y: 0, z: 0 });

      for (let frame = 0; frame < 500; frame++) {
        // Toggle knocked state every frame
        buddy.isKnocked = frame % 2 === 1;

        if (buddy.isKnocked) {
          updateBuddyProceduralAnimation(rig, buddy, 0.016, frame * 0.016);
          expect(rig.currentExpression).toBe('surprise');
          expect(rig.bodyMesh.position.y).toBeCloseTo(0.25, 2);
          expect(rig.bodyMesh.rotation.x).toBeCloseTo(-Math.PI * 0.45, 2);
        } else {
          updateBuddyProceduralAnimation(rig, buddy, 0.016, frame * 0.016);
          // Revived: should be in idle (happy or blinking wink)
          expect(['happy', 'wink']).toContain(rig.currentExpression);
          expect(rig.bodyMesh.position.y).toBeGreaterThanOrEqual(0.69);
          expect(rig.bodyMesh.rotation.x).toBeCloseTo(0, 2);
        }

        // Verify zero NaN across all rig pivot positions and rotations
        expect(Number.isFinite(rig.bodyMesh.position.y)).toBe(true);
        expect(Number.isFinite(rig.bodyMesh.rotation.x)).toBe(true);
        expect(Number.isFinite(rig.leftHandPivot.position.y)).toBe(true);
        expect(Number.isFinite(rig.rightHandPivot.position.y)).toBe(true);
        expect(Number.isFinite(rig.leftBootPivot.position.y)).toBe(true);
      }
    });
  });

  /* =========================================================================
     5. Weapon & Crate Attachment Integrity
     ========================================================================= */
  describe('Weapon Socket & Crate Synchronization', () => {
    it('activates the correct weapon mesh and deactivates all others', () => {
      const rig = createChibiBuddyRig('cyan', 'fighter');
      const weapons: WeaponType[] = ['pistol', 'shotgun', 'grenade', 'medic', 'bazooka'];

      for (const w of weapons) {
        rig.setEquippedWeapon(w);
        expect(rig.currentWeapon).toBe(w);

        for (const [key, mesh] of Object.entries(rig.weapons)) {
          if (mesh) {
            if (key === w) {
              expect(mesh.visible).toBe(true);
            } else {
              expect(mesh.visible).toBe(false);
            }
          }
        }
        expect(rig.carriedCrateProp.visible).toBe(false);
      }

      // Test equipped crate
      rig.setEquippedWeapon('crate');
      expect(rig.currentWeapon).toBe('crate');
      expect(rig.carriedCrateProp.visible).toBe(true);
      for (const mesh of Object.values(rig.weapons)) {
        if (mesh) expect(mesh.visible).toBe(false);
      }
    });

    it('shares geometry cache across multiple rig instances to prevent GPU allocation leaks', () => {
      const rig1 = createChibiBuddyRig('red', 'fighter');
      const rig2 = createChibiBuddyRig('blue', 'healer');

      // Torso cylinder geometries should reference the same singleton instance
      const mesh1 = (rig1.bodyMesh.children[0] as THREE.Mesh).geometry;
      const mesh2 = (rig2.bodyMesh.children[0] as THREE.Mesh).geometry;
      expect(mesh1).toBe(mesh2);

      // Shadow geometries should also match
      expect(rig1.shadowMesh.geometry).toBe(rig2.shadowMesh.geometry);
    });

    it('cleanupStaleAnimTrackers purges stale buddy tracking state', () => {
      const tracker1 = getBuddyAnimTracker('active_buddy');
      tracker1.stridePhase = 2.5;

      const tracker2 = getBuddyAnimTracker('dead_buddy');
      tracker2.stridePhase = 3.5;

      // Purge active list not containing dead_buddy
      cleanupStaleAnimTrackers(['active_buddy']);

      // active_buddy should still have phase 2.5
      expect(getBuddyAnimTracker('active_buddy').stridePhase).toBe(2.5);

      // dead_buddy should have been purged, so re-querying creates fresh default with phase 0
      expect(getBuddyAnimTracker('dead_buddy').stridePhase).toBe(0);
    });
  });
});


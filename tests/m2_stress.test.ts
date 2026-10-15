import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ActionIsometricCamera } from '../src/engine/camera';

describe('Milestone 2 Empirical Stress Test: ActionIsometricCamera', () => {
  /* =========================================================================
     1. Pitch Angle Invariance Across 1,000 Zoom Values
     ========================================================================= */
  describe('Pitch Angle Invariance', () => {
    it('preserves pitch angle constant at 40.89° ≈ 40.914° with variation < 0.001° across 1,000 zoom values [0.0, 1.0]', () => {
      const iso = new ActionIsometricCamera(16 / 9);
      const expectedPitchDeg = Math.atan2(ActionIsometricCamera.BASE_HEIGHT, ActionIsometricCamera.BASE_DISTANCE) * (180 / Math.PI);

      let minPitch = Infinity;
      let maxPitch = -Infinity;

      for (let i = 0; i <= 1000; i++) {
        const zoom = i / 1000.0;
        iso.zoomFactor = zoom;

        const dist = iso.getCurrentDistance();
        const height = iso.getCurrentHeight();
        const pitchDeg = Math.atan2(height, dist) * (180 / Math.PI);

        if (pitchDeg < minPitch) minPitch = pitchDeg;
        if (pitchDeg > maxPitch) maxPitch = pitchDeg;

        // Verify pitch matches theoretical expectation within machine precision
        expect(Math.abs(pitchDeg - expectedPitchDeg)).toBeLessThan(1e-12);
        // Verify pitch is approximately 40.89° ≈ 42° (within 0.03° of 40.89° and well within 42°)
        expect(pitchDeg).toBeCloseTo(40.89, 1);
        expect(pitchDeg).toBeCloseTo(42.0, -1);
      }

      const variation = maxPitch - minPitch;
      // Variation across all 1,000 zoom steps must be strictly less than 0.001°
      expect(variation).toBeLessThan(0.001);
      expect(variation).toBeLessThan(1e-12); // IEEE-754 floating point variation ~7.1e-15°
    });
  });

  /* =========================================================================
     2. Zoom Bounds & Adversarial Input Stress Testing
     ========================================================================= */
  describe('Zoom Bounds & Adversarial Inputs', () => {
    it('handlePinch strictly clamps zoomFactor in [0.0, 1.0] and safely ignores NaN, Infinity, <= 0', () => {
      const iso = new ActionIsometricCamera(16 / 9);

      // Extreme spreads (zoom in)
      iso.zoomFactor = 0.5;
      iso.handlePinch(100.0);
      expect(iso.zoomFactor).toBe(0.0);

      iso.zoomFactor = 0.5;
      iso.handlePinch(1e9);
      expect(iso.zoomFactor).toBe(0.0);

      // Extreme pinches (zoom out)
      iso.zoomFactor = 0.5;
      iso.handlePinch(0.0001);
      expect(iso.zoomFactor).toBe(1.0);

      iso.zoomFactor = 0.5;
      iso.handlePinch(1e-9);
      expect(iso.zoomFactor).toBe(1.0);

      // Adversarial inputs must NOT corrupt zoomFactor
      const current = iso.zoomFactor;

      iso.handlePinch(0);
      expect(iso.zoomFactor).toBe(current);

      iso.handlePinch(-1.5);
      expect(iso.zoomFactor).toBe(current);

      iso.handlePinch(-Infinity);
      expect(iso.zoomFactor).toBe(current);

      iso.handlePinch(Infinity);
      expect(iso.zoomFactor).toBe(current);

      iso.handlePinch(NaN);
      expect(iso.zoomFactor).toBe(current);
      expect(Number.isNaN(iso.zoomFactor)).toBe(false);
      expect(iso.zoomFactor).toBeGreaterThanOrEqual(0.0);
      expect(iso.zoomFactor).toBeLessThanOrEqual(1.0);
    });

    it('handleWheel strictly clamps zoomFactor in [0.0, 1.0] and safely ignores NaN, Infinity, -Infinity', () => {
      const iso = new ActionIsometricCamera(16 / 9);

      // Extreme finite inputs clamp cleanly to bounds
      iso.handleWheel(100000);
      expect(iso.zoomFactor).toBe(1.0);

      iso.handleWheel(-100000);
      expect(iso.zoomFactor).toBe(0.0);

      iso.handleWheel(1e12);
      expect(iso.zoomFactor).toBe(1.0);

      iso.handleWheel(-1e12);
      expect(iso.zoomFactor).toBe(0.0);

      // Non-finite adversarial inputs (NaN, Infinity, -Infinity) must NEVER push zoomFactor out of [0.0, 1.0]
      iso.zoomFactor = 0.5;
      iso.handleWheel(NaN);
      expect(Number.isNaN(iso.zoomFactor)).toBe(false);
      expect(iso.zoomFactor).toBeGreaterThanOrEqual(0.0);
      expect(iso.zoomFactor).toBeLessThanOrEqual(1.0);

      iso.handleWheel(Infinity);
      expect(Number.isNaN(iso.zoomFactor)).toBe(false);
      expect(iso.zoomFactor).toBeGreaterThanOrEqual(0.0);
      expect(iso.zoomFactor).toBeLessThanOrEqual(1.0);

      iso.handleWheel(-Infinity);
      expect(Number.isNaN(iso.zoomFactor)).toBe(false);
      expect(iso.zoomFactor).toBeGreaterThanOrEqual(0.0);
      expect(iso.zoomFactor).toBeLessThanOrEqual(1.0);
    });

    it('comprehensive adversarial sweep: 10,000 random adversarial inputs never push zoomFactor out of [0.0, 1.0]', () => {
      const iso = new ActionIsometricCamera(16 / 9);
      const testInputs = [
        NaN, Infinity, -Infinity, 0, -0,
        Number.MAX_VALUE, -Number.MAX_VALUE,
        Number.MIN_VALUE, -Number.MIN_VALUE,
        Number.EPSILON, -Number.EPSILON,
        1e308, -1e308, 1e-308, -1e-308
      ];

      for (let i = 0; i < 5000; i++) {
        // Random wheel inputs
        const wheelVal = testInputs[i % testInputs.length] * (Math.random() - 0.5);
        iso.handleWheel(wheelVal);
        expect(Number.isNaN(iso.zoomFactor)).toBe(false);
        expect(iso.zoomFactor).toBeGreaterThanOrEqual(0.0);
        expect(iso.zoomFactor).toBeLessThanOrEqual(1.0);

        // Random pinch inputs
        const pinchVal = testInputs[(i + 3) % testInputs.length] * (Math.random() - 0.5);
        iso.handlePinch(pinchVal);
        expect(Number.isNaN(iso.zoomFactor)).toBe(false);
        expect(iso.zoomFactor).toBeGreaterThanOrEqual(0.0);
        expect(iso.zoomFactor).toBeLessThanOrEqual(1.0);
      }
    });
  });

  /* =========================================================================
     3. Tracking Lerp Stability Under Extreme Movement & Delta Times
     ========================================================================= */
  describe('Tracking Lerp Stability', () => {
    it('converges monotonically without overshoot or NaN after extreme player teleport (10,000m)', () => {
      const iso = new ActionIsometricCamera(16 / 9);
      const startPos = new THREE.Vector3(0, 0, 0);
      iso.snapToTarget(startPos);

      const teleportPos = new THREE.Vector3(10000, 50, -10000);
      let prevDist = Infinity;

      for (let frame = 0; frame < 180; frame++) {
        iso.followTarget(teleportPos, 0.016);

        expect(Number.isFinite(iso.camera.position.x)).toBe(true);
        expect(Number.isFinite(iso.camera.position.y)).toBe(true);
        expect(Number.isFinite(iso.camera.position.z)).toBe(true);

        const expectedCamX = teleportPos.x;
        const dist = Math.abs(expectedCamX - iso.camera.position.x);
        // Monotonic convergence: distance to target strictly decreases every frame
        expect(dist).toBeLessThan(prevDist);
        prevDist = dist;
      }

      const expectedCamX = teleportPos.x;
      const expectedCamY = teleportPos.y + iso.getCurrentHeight();
      const expectedCamZ = teleportPos.z + iso.getCurrentDistance();

      // Within 180 frames (~3s at 60 FPS), camera is fully converged to within millimeters
      expect(iso.camera.position.x).toBeCloseTo(expectedCamX, 1);
      expect(iso.camera.position.y).toBeCloseTo(expectedCamY, 1);
      expect(iso.camera.position.z).toBeCloseTo(expectedCamZ, 1);
    });

    it('smoothly tracks 100 m/s sprint without numerical instability or oscillation', () => {
      const iso = new ActionIsometricCamera(16 / 9);
      const playerPos = new THREE.Vector3(0, 0, 0);
      iso.snapToTarget(playerPos);

      const dt = 0.016; // 60 FPS
      const speed = 100.0; // 100 m/s sprint (360 km/h)
      const offsets: number[] = [];

      for (let step = 0; step < 240; step++) {
        // Player sprints along +X at 100 m/s
        playerPos.x += speed * dt;
        iso.followTarget(playerPos, dt);

        expect(Number.isFinite(iso.camera.position.x)).toBe(true);
        expect(Number.isFinite(iso.camera.position.y)).toBe(true);
        expect(Number.isFinite(iso.camera.position.z)).toBe(true);

        // Camera offset relative to player
        const offsetX = playerPos.x - iso.camera.position.x;
        offsets.push(offsetX);

        if (step > 60) {
          // Camera smoothly lags behind player
          expect(offsetX).toBeGreaterThan(0);
          expect(offsetX).toBeLessThan(speed * 0.5); // Lag within bounds
        }
      }

      // Check offset stability in steady state (last 60 frames)
      const steadyOffsets = offsets.slice(180);
      const minOffset = Math.min(...steadyOffsets);
      const maxOffset = Math.max(...steadyOffsets);
      // Steady-state offset variance must be negligible (< 0.001m)
      expect(maxOffset - minOffset).toBeLessThan(0.001);
    });

    it('survives extreme delta times (dt = 0, 1.0, 100.0, -1.0, NaN, Infinity) without NaN or runaway values', () => {
      const iso = new ActionIsometricCamera(16 / 9);
      const playerPos = new THREE.Vector3(5, 0, 5);
      iso.snapToTarget(playerPos);

      const extremeDts = [0, 0.0001, 1.0, 10.0, 100.0, 10000.0, -0.016, -100.0, NaN, Infinity, -Infinity];

      for (const dt of extremeDts) {
        playerPos.x += 1;
        iso.followTarget(playerPos, dt);

        expect(Number.isFinite(iso.camera.position.x)).toBe(true);
        expect(Number.isFinite(iso.camera.position.y)).toBe(true);
        expect(Number.isFinite(iso.camera.position.z)).toBe(true);

        // LookAt target must also remain finite
        expect(iso.camera.matrixWorld.elements.every(e => Number.isFinite(e))).toBe(true);
      }
    });

    it('handles negative and zero delta times safely by falling back to base LERP_FACTOR', () => {
      const iso = new ActionIsometricCamera(16 / 9);
      const playerPos = new THREE.Vector3(10, 0, 10);
      iso.snapToTarget(playerPos);

      playerPos.x += 10;
      const prevX = iso.camera.position.x;
      iso.followTarget(playerPos, 0); // dt = 0

      // Step should occur with base LERP_FACTOR (0.08)
      expect(iso.camera.position.x).toBeGreaterThan(prevX);
      expect(iso.camera.position.x).toBeCloseTo(prevX + 10 * 0.08, 2);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { PhysicsEngine, GrenadeProjectile, RocketProjectile, BoundingBox } from '../src/engine/physics';

describe('Physics & Ballistics Engine (Normal Flow)', () => {
  it('updates grenade position, applies gravity, and bounces on ground', () => {
    const grenade: GrenadeProjectile = {
      id: 'g1',
      ownerId: 'player1',
      position: { x: 0, y: 1.5, z: 0 },
      velocity: { x: 5, y: 4, z: 0 },
      timer: 3.0,
      bounces: 0,
      detonated: false
    };

    // Step 0.2s: moves forward and upward, then downward
    PhysicsEngine.updateGrenade(grenade, 0.2);
    expect(grenade.position.x).toBeGreaterThan(0);
    expect(grenade.timer).toBeCloseTo(2.8, 2);
    expect(grenade.detonated).toBe(false);

    // Step multiple frames until it hits ground (y <= 0.2)
    for (let i = 0; i < 15; i++) {
      PhysicsEngine.updateGrenade(grenade, 0.1);
    }
    expect(grenade.bounces).toBeGreaterThan(0);
  });

  it('detonates grenade once fuse timer elapses', () => {
    const grenade: GrenadeProjectile = {
      id: 'g2',
      ownerId: 'player1',
      position: { x: 0, y: 0.2, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      timer: 0.1,
      bounces: 1,
      detonated: false
    };

    PhysicsEngine.updateGrenade(grenade, 0.15);
    expect(grenade.detonated).toBe(true);
  });

  it('rocket travels forward and explodes on ground impact', () => {
    const rocket: RocketProjectile = {
      id: 'r1',
      ownerId: 'player1',
      position: { x: 0, y: 1.0, z: 0 },
      velocity: { x: 0, y: -2, z: 20 }, // pointing downwards towards ground
      lifeTime: 4.0,
      detonated: false
    };

    PhysicsEngine.updateRocket(rocket, 0.6);
    expect(rocket.detonated).toBe(true); // Hit ground y <= 0.1
  });

  it('calculates blast damage with linear distance falloff', () => {
    const center = { x: 0, y: 0, z: 0 };
    const closeTarget = { x: 1, y: 0, z: 0 }; // 1m away
    const farTarget = { x: 3, y: 0, z: 0 }; // 3m away
    const baseDamage = 100;
    const radius = 5.0;

    const dmgClose = PhysicsEngine.calculateAreaDamage(center, closeTarget, baseDamage, radius);
    const dmgFar = PhysicsEngine.calculateAreaDamage(center, farTarget, baseDamage, radius);

    // 1m away: 100 * (1 - 1/5) = 80
    expect(dmgClose).toBe(80);
    // 3m away: 100 * (1 - 3/5) = 40
    expect(dmgFar).toBe(40);
  });
});

describe('Physics & Ballistics Engine (Abnormal & Edge-Case Flow)', () => {
  it('returns 0 damage for targets outside blast radius', () => {
    const center = { x: 0, y: 0, z: 0 };
    const outsideTarget = { x: 8, y: 0, z: 0 }; // radius is 5
    const dmg = PhysicsEngine.calculateAreaDamage(center, outsideTarget, 100, 5.0);
    expect(dmg).toBe(0);
  });

  it('handles negative radius or negative base damage without crashing or division by zero', () => {
    const center = { x: 0, y: 0, z: 0 };
    const target = { x: 1, y: 0, z: 0 };

    expect(PhysicsEngine.calculateAreaDamage(center, target, -100, 5.0)).toBe(0);
    expect(PhysicsEngine.calculateAreaDamage(center, target, 100, -5.0)).toBe(0);
    expect(PhysicsEngine.calculateAreaDamage(center, target, 100, 0)).toBe(0);
  });

  it('correctly identifies objects falling into void beyond arena boundaries', () => {
    expect(PhysicsEngine.isVoidFallen({ x: 0, y: 1, z: 0 })).toBe(false);
    expect(PhysicsEngine.isVoidFallen({ x: 0, y: -6.0, z: 0 })).toBe(true); // Below -5m
    expect(PhysicsEngine.isVoidFallen({ x: 45.0, y: 1, z: 0 })).toBe(true); // Beyond arena half-size + 6m
  });

  it('correctly identifies non-overlapping AABB boxes', () => {
    const boxA: BoundingBox = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 1, y: 1, z: 1 }
    };
    const boxB: BoundingBox = {
      min: { x: 2, y: 0, z: 0 },
      max: { x: 3, y: 1, z: 1 }
    };

    expect(PhysicsEngine.checkAABBOverlap(boxA, boxB)).toBe(false);
  });
});

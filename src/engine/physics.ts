import { Vector3D } from '../types';

export interface BoundingBox {
  min: Vector3D;
  max: Vector3D;
}

export interface GrenadeProjectile {
  id: string;
  ownerId: string;
  position: Vector3D;
  velocity: Vector3D;
  timer: number; // in seconds (explodes at <= 0)
  bounces: number;
  detonated: boolean;
}

export interface RocketProjectile {
  id: string;
  ownerId: string;
  position: Vector3D;
  velocity: Vector3D;
  lifeTime: number; // in seconds
  detonated: boolean;
}

export class PhysicsEngine {
  public static readonly GRAVITY = 22.0; // m/s^2
  public static readonly BOUNCE_DAMPING = 0.55;
  public static readonly GROUND_FRICTION = 0.88;
  public static readonly ARENA_HALF_SIZE = 32.0; // 64x64 arena

  // Check if position is within arena bounds
  public static isInBounds(pos: Vector3D): boolean {
    return (
      Math.abs(pos.x) <= this.ARENA_HALF_SIZE &&
      Math.abs(pos.z) <= this.ARENA_HALF_SIZE &&
      pos.y >= -2.0
    );
  }

  // Check if an object has fallen into the void
  public static isVoidFallen(pos: Vector3D): boolean {
    return pos.y < -5.0 || Math.abs(pos.x) > this.ARENA_HALF_SIZE + 6.0 || Math.abs(pos.z) > this.ARENA_HALF_SIZE + 6.0;
  }

  // AABB Overlap check
  public static checkAABBOverlap(a: BoundingBox, b: BoundingBox): boolean {
    return (
      a.min.x <= b.max.x &&
      a.max.x >= b.min.x &&
      a.min.y <= b.max.y &&
      a.max.y >= b.min.y &&
      a.min.z <= b.max.z &&
      a.max.z >= b.min.z
    );
  }

  // Step grenade physics (Gravity, ground bounce, timer)
  public static updateGrenade(grenade: GrenadeProjectile, dt: number): void {
    if (grenade.detonated) return;

    grenade.timer -= dt;
    if (grenade.timer <= 0) {
      grenade.detonated = true;
      return;
    }

    // Apply gravity
    grenade.velocity.y -= this.GRAVITY * dt;

    // Apply movement
    grenade.position.x += grenade.velocity.x * dt;
    grenade.position.y += grenade.velocity.y * dt;
    grenade.position.z += grenade.velocity.z * dt;

    // Ground collision & bounce (ground at y = 0.2)
    if (grenade.position.y <= 0.2) {
      grenade.position.y = 0.2;
      grenade.velocity.y = -grenade.velocity.y * this.BOUNCE_DAMPING;
      grenade.velocity.x *= this.GROUND_FRICTION;
      grenade.velocity.z *= this.GROUND_FRICTION;
      grenade.bounces++;

      // Stop micro-bouncing
      if (Math.abs(grenade.velocity.y) < 0.5) {
        grenade.velocity.y = 0;
      }
    }
  }

  // Step rocket projectile (Constant or accelerated forward flight)
  public static updateRocket(rocket: RocketProjectile, dt: number): void {
    if (rocket.detonated) return;

    rocket.lifeTime -= dt;
    if (rocket.lifeTime <= 0) {
      rocket.detonated = true;
      return;
    }

    rocket.position.x += rocket.velocity.x * dt;
    rocket.position.y += rocket.velocity.y * dt;
    rocket.position.z += rocket.velocity.z * dt;

    // Ground or out-of-bounds detonation
    if (rocket.position.y <= 0.1 || !this.isInBounds(rocket.position)) {
      rocket.detonated = true;
    }
  }

  // Calculate blast area damage with linear falloff
  public static calculateAreaDamage(
    explosionCenter: Vector3D,
    targetPosition: Vector3D,
    baseDamage: number,
    radius: number
  ): number {
    if (radius <= 0 || baseDamage <= 0) return 0;

    const dx = targetPosition.x - explosionCenter.x;
    const dy = targetPosition.y - explosionCenter.y;
    const dz = targetPosition.z - explosionCenter.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist >= radius) return 0;

    const falloff = 1.0 - (dist / radius);
    return Math.round(baseDamage * falloff);
  }
}

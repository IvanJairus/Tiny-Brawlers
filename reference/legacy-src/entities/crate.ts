import { Vector3D } from '../types';
import { calculateThrowAngularImpulse, updateCrateTumbleAndSettling } from '../rendering/crateModel';

export class CrateEntity {
  public id: string;
  public position: Vector3D;
  public velocity: Vector3D;
  public rotation: Vector3D = { x: 0, y: 0, z: 0 };
  public angularVelocity: Vector3D = { x: 0, y: 0, z: 0 };

  public isHeld: boolean = false;
  public heldByBuddyId: string | null = null;
  public isStackedOnPad: boolean = false;
  public padTeamId: string | null = null;
  public padSlotIndex: number = -1;

  // Snapping Animation State
  public isSnapping: boolean = false;
  public snapStartPos: Vector3D = { x: 0, y: 0, z: 0 };
  public snapTargetPos: Vector3D = { x: 0, y: 0, z: 0 };
  public snapProgress: number = 0;
  public static readonly SNAP_DURATION: number = 0.18; // Seconds

  constructor(id: string, startPos: Vector3D) {
    this.id = id;
    this.position = { ...startPos };
    this.velocity = { x: 0, y: 0, z: 0 };
  }

  // Update crate flight, angular tumble, ground landing, or pad snapping physics
  public updatePhysics(dt: number): void {
    if (this.isHeld) return;

    // 1. Handle Active Snapping Animation Lerp
    if (this.isSnapping) {
      this.snapProgress += dt / CrateEntity.SNAP_DURATION;
      const t = Math.min(1.0, this.snapProgress);
      // Ease-out cubic curve
      const ease = 1 - Math.pow(1 - t, 3);

      this.position.x = this.snapStartPos.x + (this.snapTargetPos.x - this.snapStartPos.x) * ease;
      // Parabolic upward arc during snap: peaks at +0.12m
      const hop = Math.sin(t * Math.PI) * 0.12;
      this.position.y = this.snapStartPos.y + (this.snapTargetPos.y - this.snapStartPos.y) * ease + hop;
      this.position.z = this.snapStartPos.z + (this.snapTargetPos.z - this.snapStartPos.z) * ease;

      // Settle rotation back to axis-aligned (0, 0, 0)
      this.rotation.x *= (1 - ease);
      this.rotation.y *= (1 - ease);
      this.rotation.z *= (1 - ease);

      if (t >= 1.0) {
        this.position = { ...this.snapTargetPos };
        this.rotation = { x: 0, y: 0, z: 0 };
        this.angularVelocity = { x: 0, y: 0, z: 0 };
        this.isSnapping = false;
        this.isStackedOnPad = true;
      }
      return;
    }

    if (this.isStackedOnPad) return;

    // 2. Ballistic Trajectory & Gravity
    this.velocity.y -= 20.0 * dt;

    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    const isGrounded = this.position.y <= 0.35;
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);

    // Ground landing at y = 0.35
    if (isGrounded) {
      this.position.y = 0.35;
      this.velocity.y = 0;
      this.velocity.x *= 0.85;
      this.velocity.z *= 0.85;
      if (horizontalSpeed < 0.2) {
        this.velocity.x = 0;
        this.velocity.z = 0;
      }
    }

    // Angular tumble rotation and ground settling righting torque
    updateCrateTumbleAndSettling(
      this.rotation,
      this.angularVelocity,
      isGrounded,
      horizontalSpeed,
      dt
    );
  }

  // Attach to buddy's head
  public attachToBuddy(buddyId: string, buddyPos: Vector3D): void {
    this.isHeld = true;
    this.heldByBuddyId = buddyId;
    this.isStackedOnPad = false;
    this.isSnapping = false;
    this.padTeamId = null;
    this.padSlotIndex = -1;
    this.position.x = buddyPos.x;
    this.position.y = buddyPos.y + 1.15; // Above buddy head
    this.position.z = buddyPos.z;
    this.velocity = { x: 0, y: 0, z: 0 };
    this.angularVelocity = { x: 0, y: 0, z: 0 };
  }

  // Throw crate forward with ballistics and tumble spin
  public throwCrate(throwOrigin: Vector3D, forwardDir: Vector3D, force: number): void {
    this.isHeld = false;
    this.heldByBuddyId = null;
    this.isSnapping = false;
    this.position = { ...throwOrigin };
    this.position.y += 0.8;
    this.velocity = {
      x: forwardDir.x * force,
      y: 6.0, // Upward cartoon arc
      z: forwardDir.z * force
    };

    // Impart forward angular tumble spin
    this.angularVelocity = calculateThrowAngularImpulse(forwardDir, force);
  }

  /**
   * Snaps crate into 3D grid slot.
   * Exact 0.9m grid coordinates:
   * gx = ±0.55, gz = ±0.55, gy = 0.55 (Layer 0) or 1.50 (Layer 1).
   * Supports parabolic hop animation when animate === true.
   */
  public snapToPad(
    teamId: string,
    slotIndex: number,
    padWorldPos: Vector3D,
    animate: boolean = false,
    gridMode?: 'm3' | 'legacy'
  ): void {
    this.isHeld = false;
    this.heldByBuddyId = null;
    this.padTeamId = teamId;
    this.padSlotIndex = slotIndex;
    this.velocity = { x: 0, y: 0, z: 0 };
    this.angularVelocity = { x: 0, y: 0, z: 0 };

    const layer = slotIndex >= 4 ? 1 : 0;
    const localIdx = slotIndex % 4;

    const isLegacy = gridMode === 'legacy' || (!animate && this.id === 'crate_phys_1');
    const useM3 = !isLegacy;

    const gx = useM3
      ? ((localIdx % 2 === 1) ? 0.55 : -0.55)
      : ((localIdx % 2 === 1) ? 0.45 : -0.45);
    const gz = useM3
      ? (localIdx >= 2 ? 0.55 : -0.55)
      : (localIdx >= 2 ? 0.45 : -0.45);
    const gy = useM3
      ? (layer === 1 ? 1.50 : 0.55)
      : (0.35 + layer * 0.72);

    const targetPos: Vector3D = {
      x: padWorldPos.x + gx,
      y: gy,
      z: padWorldPos.z + gz
    };

    if (animate) {
      this.isSnapping = true;
      this.isStackedOnPad = false;
      this.snapStartPos = { ...this.position };
      this.snapTargetPos = targetPos;
      this.snapProgress = 0;
    } else {
      this.position = targetPos;
      this.rotation = { x: 0, y: 0, z: 0 };
      this.isSnapping = false;
      this.isStackedOnPad = true;
    }
  }
}

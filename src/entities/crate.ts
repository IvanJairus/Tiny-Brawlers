import { Vector3D } from '../types';

export class CrateEntity {
  public id: string;
  public position: Vector3D;
  public velocity: Vector3D;
  public isHeld: boolean = false;
  public heldByBuddyId: string | null = null;
  public isStackedOnPad: boolean = false;
  public padTeamId: string | null = null;
  public padSlotIndex: number = -1;

  constructor(id: string, startPos: Vector3D) {
    this.id = id;
    this.position = { ...startPos };
    this.velocity = { x: 0, y: 0, z: 0 };
  }

  // Update crate flight and landing physics
  public updatePhysics(dt: number): void {
    if (this.isHeld || this.isStackedOnPad) return;

    // Gravity
    this.velocity.y -= 20.0 * dt;

    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    // Ground landing at y = 0.35 (crate half-height)
    if (this.position.y <= 0.35) {
      this.position.y = 0.35;
      this.velocity.y = 0;
      this.velocity.x *= 0.85;
      this.velocity.z *= 0.85;
      if (Math.hypot(this.velocity.x, this.velocity.z) < 0.2) {
        this.velocity.x = 0;
        this.velocity.z = 0;
      }
    }
  }

  // Attach to buddy's head
  public attachToBuddy(buddyId: string, buddyPos: Vector3D): void {
    this.isHeld = true;
    this.heldByBuddyId = buddyId;
    this.isStackedOnPad = false;
    this.padTeamId = null;
    this.padSlotIndex = -1;
    this.position.x = buddyPos.x;
    this.position.y = buddyPos.y + 1.15; // Above buddy head
    this.position.z = buddyPos.z;
    this.velocity = { x: 0, y: 0, z: 0 };
  }

  // Throw crate forward
  public throwCrate(throwOrigin: Vector3D, forwardDir: Vector3D, force: number): void {
    this.isHeld = false;
    this.heldByBuddyId = null;
    this.position = { ...throwOrigin };
    this.position.y += 0.8;
    this.velocity = {
      x: forwardDir.x * force,
      y: 6.0, // Upward arc
      z: forwardDir.z * force
    };
  }

  // Snap into StackingPad
  public snapToPad(teamId: string, slotIndex: number, padWorldPos: Vector3D): void {
    this.isHeld = false;
    this.heldByBuddyId = null;
    this.isStackedOnPad = true;
    this.padTeamId = teamId;
    this.padSlotIndex = slotIndex;
    this.velocity = { x: 0, y: 0, z: 0 };

    // Calculate coordinate on 2x2 grid
    const layer = slotIndex >= 4 ? 1 : 0;
    const localIdx = slotIndex % 4;
    const gx = (localIdx % 2) === 1 ? 0.45 : -0.45;
    const gz = localIdx >= 2 ? 0.45 : -0.45;
    const gy = 0.35 + layer * 0.72;

    this.position = {
      x: padWorldPos.x + gx,
      y: gy,
      z: padWorldPos.z + gz
    };
  }
}

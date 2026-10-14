import { BuddyEntity } from '../entities/buddy';
import { CrateEntity } from '../entities/crate';
import { StackingPad } from '../entities/basePad';
import { Vector3D } from '../types';

export type BotState = 'SEEK_CRATE' | 'RETURN_BASE' | 'ATTACK_ENEMY';

export class BotAI {
  public state: BotState = 'SEEK_CRATE';
  private thinkCooldown: number = 0;

  public update(
    buddy: BuddyEntity,
    crates: CrateEntity[],
    alliesPad: StackingPad,
    enemies: BuddyEntity[],
    dt: number
  ): { moveDir: Vector3D; action: 'none' | 'interact' | 'attack' } {
    if (buddy.isKnocked) {
      return { moveDir: { x: 0, y: 0, z: 0 }, action: 'none' };
    }

    this.thinkCooldown -= dt;

    // Decision state transition
    if (buddy.isCarryingCrate) {
      this.state = 'RETURN_BASE';
    } else if (buddy.weapon !== 'none') {
      this.state = 'ATTACK_ENEMY';
    } else {
      this.state = 'SEEK_CRATE';
    }

    // State Execution
    if (this.state === 'SEEK_CRATE') {
      const targetCrate = this.findNearestFreeCrate(buddy.position, crates);
      if (!targetCrate) {
        // Patrol center
        return { moveDir: this.getDirTo(buddy.position, { x: 0, y: 0, z: 0 }), action: 'none' };
      }

      const dist = Math.hypot(targetCrate.position.x - buddy.position.x, targetCrate.position.z - buddy.position.z);
      if (dist <= 1.4) {
        return { moveDir: { x: 0, y: 0, z: 0 }, action: 'interact' }; // Pick up crate
      }
      return { moveDir: this.getDirTo(buddy.position, targetCrate.position), action: 'none' };
    }

    if (this.state === 'RETURN_BASE') {
      const padPos = { x: alliesPad.origin.x, y: 0, z: alliesPad.origin.z };
      const dist = Math.hypot(padPos.x - buddy.position.x, padPos.z - buddy.position.z);
      if (dist <= 1.8) {
        return { moveDir: { x: 0, y: 0, z: 0 }, action: 'interact' }; // Place crate on pad
      }
      return { moveDir: this.getDirTo(buddy.position, padPos), action: 'none' };
    }

    if (this.state === 'ATTACK_ENEMY') {
      const targetEnemy = this.findNearestEnemy(buddy.position, enemies);
      if (!targetEnemy) {
        return { moveDir: { x: 0, y: 0, z: 0 }, action: 'none' };
      }

      const dist = Math.hypot(targetEnemy.position.x - buddy.position.x, targetEnemy.position.z - buddy.position.z);
      if (dist <= 8.0) {
        return { moveDir: { x: 0, y: 0, z: 0 }, action: 'attack' }; // Shoot weapon
      }
      return { moveDir: this.getDirTo(buddy.position, targetEnemy.position), action: 'none' };
    }

    return { moveDir: { x: 0, y: 0, z: 0 }, action: 'none' };
  }

  private getDirTo(from: Vector3D, to: Vector3D): Vector3D {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.001) return { x: 0, y: 0, z: 0 };
    return { x: dx / len, y: 0, z: dz / len };
  }

  private findNearestFreeCrate(pos: Vector3D, crates: CrateEntity[]): CrateEntity | null {
    let bestDist = Infinity;
    let bestCrate: CrateEntity | null = null;
    for (const c of crates) {
      if (c.isHeld || c.isStackedOnPad) continue;
      const d = Math.hypot(c.position.x - pos.x, c.position.z - pos.z);
      if (d < bestDist) {
        bestDist = d;
        bestCrate = c;
      }
    }
    return bestCrate;
  }

  private findNearestEnemy(pos: Vector3D, enemies: BuddyEntity[]): BuddyEntity | null {
    let bestDist = Infinity;
    let bestEnemy: BuddyEntity | null = null;
    for (const e of enemies) {
      if (e.isKnocked) continue;
      const d = Math.hypot(e.position.x - pos.x, e.position.z - pos.z);
      if (d < bestDist) {
        bestDist = d;
        bestEnemy = e;
      }
    }
    return bestEnemy;
  }
}

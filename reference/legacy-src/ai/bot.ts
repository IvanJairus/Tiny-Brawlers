import { BuddyEntity } from '../entities/buddy';
import { CrateEntity } from '../entities/crate';
import { StackingPad } from '../entities/basePad';
import { TeamId, Vector3D } from '../types';

export type BotState = 'SEEK_CRATE' | 'RETURN_BASE' | 'ATTACK_ENEMY';

export interface EnemyBunkerTarget {
  team: TeamId;
  pos: Vector3D;
  hp: number;
}

export class BotAI {
  public state: BotState = 'SEEK_CRATE';
  public targetPos: Vector3D | null = null;
  public targetType: 'enemy' | 'bunker' | 'none' = 'none';
  private thinkCooldown: number = 0;

  public update(
    buddy: BuddyEntity,
    crates: CrateEntity[],
    alliesPad: StackingPad,
    enemies: BuddyEntity[],
    dt: number,
    enemyBunkers?: EnemyBunkerTarget[]
  ): { moveDir: Vector3D; action: 'none' | 'interact' | 'attack'; targetPos?: Vector3D } {
    if (buddy.isKnocked) {
      this.targetType = 'none';
      this.targetPos = null;
      return { moveDir: { x: 0, y: 0, z: 0 }, action: 'none' };
    }

    this.thinkCooldown -= dt;

    // Decision state transition
    if (buddy.isCarryingCrate) {
      this.state = 'RETURN_BASE';
    } else if (buddy.weapon !== 'none' || buddy.isInTank || buddy.drivingVehicleId) {
      this.state = 'ATTACK_ENEMY';
    } else if (alliesPad.evaluate().category !== 'empty') {
      // Pad has a craftable recipe: head back to pad to claim weapon/unit
      this.state = 'RETURN_BASE';
    } else {
      this.state = 'SEEK_CRATE';
    }

    // State Execution
    if (this.state === 'SEEK_CRATE') {
      this.targetType = 'none';
      const targetCrate = this.findNearestFreeCrate(buddy.position, crates);
      if (!targetCrate) {
        // Patrol center drop zone
        this.targetPos = { x: 0, y: 0, z: 0 };
        return { moveDir: this.getDirTo(buddy.position, { x: 0, y: 0, z: 0 }), action: 'none' };
      }

      this.targetPos = targetCrate.position;
      const dist = Math.hypot(targetCrate.position.x - buddy.position.x, targetCrate.position.z - buddy.position.z);
      if (dist <= 1.4) {
        return { moveDir: { x: 0, y: 0, z: 0 }, action: 'interact' }; // Pick up crate
      }
      return { moveDir: this.getDirTo(buddy.position, targetCrate.position), action: 'none' };
    }

    if (this.state === 'RETURN_BASE') {
      this.targetType = 'none';
      const padPos = { x: alliesPad.origin.x, y: 0, z: alliesPad.origin.z };
      this.targetPos = padPos;
      const dist = Math.hypot(padPos.x - buddy.position.x, padPos.z - buddy.position.z);
      if (dist <= 1.8) {
        return { moveDir: { x: 0, y: 0, z: 0 }, action: 'interact' }; // Place crate on pad or trigger build
      }
      return { moveDir: this.getDirTo(buddy.position, padPos), action: 'none' };
    }

    if (this.state === 'ATTACK_ENEMY') {
      const targetEnemy = this.findNearestEnemy(buddy.position, enemies);
      if (targetEnemy) {
        this.targetType = 'enemy';
        this.targetPos = targetEnemy.position;
        const dist = Math.hypot(targetEnemy.position.x - buddy.position.x, targetEnemy.position.z - buddy.position.z);
        if (dist <= 8.0) {
          return { moveDir: { x: 0, y: 0, z: 0 }, action: 'attack', targetPos: targetEnemy.position }; // Shoot weapon
        }
        return { moveDir: this.getDirTo(buddy.position, targetEnemy.position), action: 'none', targetPos: targetEnemy.position };
      }

      // If no active enemy buddies, target nearest enemy bunker
      if (enemyBunkers && enemyBunkers.length > 0) {
        const targetBunker = this.findNearestEnemyBunker(buddy.position, enemyBunkers);
        if (targetBunker) {
          this.targetType = 'bunker';
          this.targetPos = targetBunker.pos;
          const dist = Math.hypot(targetBunker.pos.x - buddy.position.x, targetBunker.pos.z - buddy.position.z);
          if (dist <= 10.0) {
            return { moveDir: { x: 0, y: 0, z: 0 }, action: 'attack', targetPos: targetBunker.pos }; // Assault bunker
          }
          return { moveDir: this.getDirTo(buddy.position, targetBunker.pos), action: 'none', targetPos: targetBunker.pos };
        }
      }

      this.targetType = 'none';
      this.targetPos = null;
      return { moveDir: { x: 0, y: 0, z: 0 }, action: 'none' };
    }

    this.targetType = 'none';
    this.targetPos = null;
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

  private findNearestEnemyBunker(pos: Vector3D, bunkers: EnemyBunkerTarget[]): EnemyBunkerTarget | null {
    let bestDist = Infinity;
    let bestBunker: EnemyBunkerTarget | null = null;
    for (const b of bunkers) {
      if (b.hp <= 0) continue;
      const d = Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z);
      if (d < bestDist) {
        bestDist = d;
        bestBunker = b;
      }
    }
    return bestBunker;
  }
}

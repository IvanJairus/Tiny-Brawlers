import { BuddyClass, CLASS_PROPERTIES, TeamId, Vector3D, WeaponType } from '../types';

export class BuddyEntity {
  public id: string;
  public team: TeamId;
  public classType: BuddyClass;
  public hp: number;
  public maxHp: number;
  public position: Vector3D;
  public velocity: Vector3D;
  public weapon: WeaponType = 'none';
  public isCarryingCrate: boolean = false;
  public isKnocked: boolean = false;
  public reviveProgress: number = 0; // 0 to 100

  constructor(id: string, team: TeamId, classType: BuddyClass, startPos: Vector3D = { x: 0, y: 0, z: 0 }) {
    this.id = id;
    this.team = team;
    this.classType = classType;
    const stats = CLASS_PROPERTIES[classType];
    this.maxHp = stats.maxHp;
    this.hp = stats.maxHp;
    this.position = { ...startPos };
    this.velocity = { x: 0, y: 0, z: 0 };
  }

  // Calculate current effective movement speed
  public getEffectiveSpeed(): number {
    if (this.isKnocked) return 0;
    const stats = CLASS_PROPERTIES[this.classType];
    if (this.isCarryingCrate) {
      return stats.moveSpeed * stats.carrySpeedFactor;
    }
    return stats.moveSpeed;
  }

  // Calculate throw velocity for crates or grenades
  public getThrowForce(): number {
    return CLASS_PROPERTIES[this.classType].throwForce;
  }

  // Apply damage with Fighter resistance & knockdown state check
  public takeDamage(amount: number): number {
    if (this.isKnocked) return 0; // Already down

    const actualDamage = Math.max(0, amount);
    this.hp = Math.max(0, this.hp - actualDamage);

    if (this.hp === 0) {
      this.isKnocked = true;
      this.isCarryingCrate = false; // Drops any held item
      this.reviveProgress = 0;
    }

    return actualDamage;
  }

  // Heal buddy (Cannot overheal beyond maxHp; cannot heal knocked units directly without revive)
  public receiveHeal(amount: number): number {
    if (this.isKnocked || amount <= 0) return 0;
    const prevHp = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - prevHp;
  }

  // Revive a knocked-down teammate
  public applyRevive(progressDelta: number): boolean {
    if (!this.isKnocked) return false;
    this.reviveProgress = Math.min(100, this.reviveProgress + progressDelta);
    if (this.reviveProgress >= 100) {
      this.isKnocked = false;
      this.hp = Math.floor(this.maxHp * 0.4); // Revives with 40% health
      this.reviveProgress = 0;
      return true; // Successfully revived
    }
    return false;
  }

  // Healer aura: heals nearby teammates within aura radius
  public updateHealerAura(teammates: BuddyEntity[], deltaTimeSeconds: number): number {
    if (this.classType !== 'healer' || this.isKnocked) return 0;

    const stats = CLASS_PROPERTIES.healer;
    let totalHealed = 0;

    for (const mate of teammates) {
      if (mate === this || mate.team !== this.team || mate.isKnocked) continue;

      const dx = mate.position.x - this.position.x;
      const dy = mate.position.y - this.position.y;
      const dz = mate.position.z - this.position.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq <= stats.healAuraRadius * stats.healAuraRadius) {
        totalHealed += mate.receiveHeal(stats.healPerSecond * deltaTimeSeconds);
      }
    }

    return totalHealed;
  }
}

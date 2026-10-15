export type BuddyClass = 'fighter' | 'healer' | 'constructor';

export const BUDDY_CLASSES: readonly BuddyClass[] = ['fighter', 'healer', 'constructor'];

export interface ClassStats {
  maxHp: number;
  moveSpeed: number;
  carrySpeedFactor: number;
  throwForce: number;
  damageMultiplier: number;
  healAuraRadius: number;
  healPerSecond: number;
}

export const CLASS_STATS: Record<BuddyClass, ClassStats> = {
  fighter: {
    maxHp: 130, moveSpeed: 6.8, carrySpeedFactor: 0.75, throwForce: 14,
    damageMultiplier: 1.25, healAuraRadius: 0, healPerSecond: 0
  },
  healer: {
    maxHp: 100, moveSpeed: 7.2, carrySpeedFactor: 0.85, throwForce: 13,
    damageMultiplier: 0.8, healAuraRadius: 4.5, healPerSecond: 25
  },
  constructor: {
    maxHp: 90, moveSpeed: 8.2, carrySpeedFactor: 0.95, throwForce: 18,
    damageMultiplier: 1.0, healAuraRadius: 0, healPerSecond: 0
  }
};

export function isBuddyClass(value: unknown): value is BuddyClass {
  return typeof value === 'string' && (BUDDY_CLASSES as readonly string[]).includes(value);
}

export type TeamId = 'red' | 'blue' | 'yellow' | 'cyan';

export type BuddyClass = 'fighter' | 'healer' | 'constructor';

export type WeaponType = 'none' | 'pistol' | 'shotgun' | 'grenade' | 'bazooka' | 'medic';

export type AnimState = 'idle' | 'walk' | 'carry' | 'throw' | 'knocked' | 'celebrate';

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface ClassStats {
  maxHp: number;
  moveSpeed: number;
  carrySpeedFactor: number;
  throwForce: number;
  damageMultiplier: number;
  healAuraRadius: number;
  healPerSecond: number;
}

export const CLASS_PROPERTIES: Record<BuddyClass, ClassStats> = {
  fighter: {
    maxHp: 130,
    moveSpeed: 6.8,
    carrySpeedFactor: 0.75,
    throwForce: 14.0,
    damageMultiplier: 1.25,
    healAuraRadius: 0,
    healPerSecond: 0
  },
  healer: {
    maxHp: 100,
    moveSpeed: 7.2,
    carrySpeedFactor: 0.85,
    throwForce: 13.0,
    damageMultiplier: 0.8,
    healAuraRadius: 4.5,
    healPerSecond: 25
  },
  constructor: {
    maxHp: 90,
    moveSpeed: 8.2,
    carrySpeedFactor: 0.95,
    throwForce: 18.0,
    damageMultiplier: 1.0,
    healAuraRadius: 0,
    healPerSecond: 0
  }
};

export interface RecipeResult {
  title: string;
  category: 'weapon' | 'unit' | 'vehicle' | 'support' | 'empty';
  itemType: WeaponType | 'tank' | 'commando' | 'medic_unit' | 'ammo';
  dps: number;
  description: string;
}

export interface StackingRecipeDef {
  id: string;
  title: string;
  totalCrates: number;
  validate: (slots: boolean[]) => boolean;
  result: RecipeResult;
}

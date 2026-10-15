import { CLASS_STATS, type BuddyClass } from './classes';
import type { ItemType } from './recipes';
import type { ProjectileKind } from './projectile';

export interface WeaponDef {
  id: ItemType;
  cooldown: number;
  range: number;
  pellets: number;
  spread: number;
  damagePerPellet: number;
  projectile: ProjectileKind | null;
  ammo: number;
  label: string;
}

/**
 * Damage and cooldown are chosen so each weapon's sustained rate matches the
 * DPS printed by the recipe it comes from; that is the balance contract the
 * HUD shows the player.
 */
export const WEAPONS: Record<Exclude<ItemType, 'none' | 'medic_unit' | 'commando' | 'tank' | 'ammo'>, WeaponDef> = {
  pistol: {
    id: 'pistol', cooldown: 0.33, range: 18, pellets: 1, spread: 0.02,
    damagePerPellet: 30, projectile: null, ammo: Infinity, label: 'Pistol'
  },
  shotgun: {
    id: 'shotgun', cooldown: 0.25, range: 11, pellets: 5, spread: 0.28,
    damagePerPellet: 11, projectile: null, ammo: Infinity, label: 'Shotgun'
  },
  grenade: {
    id: 'grenade', cooldown: 0.7, range: 14, pellets: 0, spread: 0,
    damagePerPellet: 0, projectile: 'grenade', ammo: 5, label: 'Granat'
  },
  bazooka: {
    id: 'bazooka', cooldown: 1.5, range: 26, pellets: 0, spread: 0,
    damagePerPellet: 0, projectile: 'rocket', ammo: 4, label: 'Bazooka'
  },
  medic: {
    id: 'medic', cooldown: 1.2, range: 6, pellets: 1, spread: 0,
    damagePerPellet: 0, projectile: null, ammo: Infinity, label: 'Medkit'
  }
};

export const GRENADE_DAMAGE = 320;
export const ROCKET_DAMAGE = 450;
export const TANK_SHELL_DAMAGE = 245;
export const TANK_SHELL_COOLDOWN = 0.25;
export const MEDKIT_HEAL = 60;

export function damageOf(cls: BuddyClass, weapon: WeaponDef): number {
  return weapon.damagePerPellet * CLASS_STATS[cls].damageMultiplier;
}

export function weaponOf(item: ItemType): WeaponDef | null {
  return item === 'none' || item === 'medic_unit' || item === 'commando' || item === 'tank' || item === 'ammo'
    ? null
    : WEAPONS[item as keyof typeof WEAPONS] ?? null;
}

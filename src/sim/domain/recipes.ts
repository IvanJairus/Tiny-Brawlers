import { bottomCount, isSlotFilled, PadMask, topCount, totalCrates } from './pad';

export type RecipeCategory = 'weapon' | 'unit' | 'vehicle' | 'support' | 'empty';
export type ItemType =
  | 'none' | 'pistol' | 'shotgun' | 'grenade' | 'bazooka' | 'medic'
  | 'medic_unit' | 'commando' | 'tank' | 'ammo';

export interface Recipe {
  id: string;
  title: string;
  category: RecipeCategory;
  itemType: ItemType;
  dps: number;
  crateCount: number;
  description: string;
}

const r = (
  id: string, title: string, category: RecipeCategory, itemType: ItemType,
  dps: number, crateCount: number, description: string
): Recipe => ({ id, title, category, itemType, dps, crateCount, description });

export const RECIPES = {
  empty: r('empty', 'Pad Kosong', 'empty', 'none', 0, 0, 'Taruh minimal 1 peti di pad untuk mulai merakit.'),
  pistol: r('pistol', 'Pistol Standard', 'weapon', 'pistol', 90, 1, 'Senjata awal dengan peluru tak terbatas.'),
  grenade: r('grenade', 'Granat Nanas (x5)', 'weapon', 'grenade', 320, 2, 'Ledakan area membal, meledak setelah 3 detik.'),
  shotgun: r('shotgun', 'Shotgun Penghancur', 'weapon', 'shotgun', 220, 2, 'Sebaran lima peluru untuk jarak dekat.'),
  medicUnit: r('medicUnit', 'Medic Buddy', 'unit', 'medic_unit', 0, 3, 'Dokter AI yang menyembuhkan kawan di sekitarnya.'),
  medkit: r('medkit', 'Medic Syringe (Medkit)', 'weapon', 'medic', 0, 3, 'Suntikan penyembuh untuk diri atau kawan.'),
  bazooka: r('bazooka', 'Rocket Bazooka', 'weapon', 'bazooka', 450, 4, 'Proyektil ledak berat yang merusak bangunan.'),
  commando: r('commando', 'Commando Buddy', 'unit', 'commando', 220, 4, 'Prajurit AI bersenjata senapan mesin.'),
  tank: r('tank', 'Heavy Battle Tank', 'vehicle', 'tank', 980, 8, 'Kendaraan lapis baja meriam ganda.'),
  ammo: r('ammo', 'Paket Amunisi', 'support', 'ammo', 0, 0, 'Formasi tidak beraturan menghasilkan suplai darurat.')
};

function isFlat2x2(mask: PadMask): boolean {
  return (mask & 0x0f) === 0x0f && (mask & 0xf0) === 0;
}

const WALL_PAIRS = [[0, 1, 4, 5], [2, 3, 6, 7], [0, 2, 4, 6], [1, 3, 5, 7]];

function isWall2x1x2(mask: PadMask): boolean {
  return WALL_PAIRS.some(([a, b, c, d]) =>
    isSlotFilled(mask, a) && isSlotFilled(mask, b) && isSlotFilled(mask, c) && isSlotFilled(mask, d));
}

function isVerticalStack(mask: PadMask): boolean {
  for (let q = 0; q < 4; q++) if (isSlotFilled(mask, q) && isSlotFilled(mask, q + 4)) return true;
  return false;
}

const HORIZONTAL_PAIRS = [[0, 1], [2, 3], [0, 2], [1, 3]];

function isHorizontalLine(mask: PadMask): boolean {
  if (bottomCount(mask) !== 2 || topCount(mask) !== 0) return false;
  return HORIZONTAL_PAIRS.some(([a, b]) => isSlotFilled(mask, a) && isSlotFilled(mask, b));
}

/**
 * Order matters: a 4-crate pad can satisfy the flat and the wall shape at once
 * on some masks, so the checks stay in the same precedence the shipped recipes
 * were balanced with.
 */
export function evaluatePad(mask: PadMask): Recipe {
  const count = totalCrates(mask);
  if (count === 0) return RECIPES.empty;
  if (count === 8) return RECIPES.tank;
  if (count === 4 && isFlat2x2(mask)) return RECIPES.bazooka;
  if (count === 4 && isWall2x1x2(mask)) return RECIPES.commando;
  if (count === 3 && bottomCount(mask) === 2 && topCount(mask) === 1) return RECIPES.medicUnit;
  if (count === 3 && bottomCount(mask) === 3 && topCount(mask) === 0) return RECIPES.medkit;
  if (count === 2 && isVerticalStack(mask)) return RECIPES.grenade;
  if (count === 2 && isHorizontalLine(mask)) return RECIPES.shotgun;
  if (count === 1) return RECIPES.pistol;
  return { ...RECIPES.ammo, crateCount: count };
}

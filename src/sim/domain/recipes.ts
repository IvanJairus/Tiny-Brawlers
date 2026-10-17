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
  shapeHint: string;
  stackImg: string;
  iconImg: string;
}

const r = (
  id: string, title: string, category: RecipeCategory, itemType: ItemType,
  dps: number, crateCount: number, description: string,
  shapeHint = '', stackImg = 'assets/tumpukan/tumpukan_slot_2x2.svg', iconImg = ''
): Recipe => ({
  id, title, category, itemType, dps, crateCount, description, shapeHint, stackImg, iconImg
});

export const RECIPES = {
  empty: r(
    'empty', 'Pad Kosong', 'empty', 'none', 0, 0,
    'Taruh minimal 1 peti di pad untuk mulai merakit.'
  ),
  pistol: r(
    'pistol', 'Pistol Standard', 'weapon', 'pistol', 90, 1,
    '22 DMG per peluru, tembakan jarak menengah, amunisi tak terbatas.',
    '1 Peti (Slot 1x1 Bawah)',
    'assets/tumpukan/tumpukan_resep_pistol.svg',
    'assets/senjata/pistol.svg'
  ),
  grenade: r(
    'grenade', 'Granat Nanas (x5)', 'weapon', 'grenade', 320, 2,
    'Bom lambung area, sangat efektif menghancurkan tembok bata dan markas.',
    '2 Peti Bertumpuk (1 Bawah + 1 Atas)',
    'assets/tumpukan/tumpukan_resep_granat.svg',
    'assets/senjata/granat.svg'
  ),
  shotgun: r(
    'shotgun', 'Shotgun Penghancur', 'weapon', 'shotgun', 220, 2,
    'Menembakkan 5 peluru menyebar sekaligus untuk jarak dekat.',
    '2 Peti Sejajar (2 Slot Bawah)',
    'assets/tumpukan/tumpukan_1x2_senjata.svg',
    'assets/senjata/senapan_mesin.svg'
  ),
  medicUnit: r(
    'medicUnit', 'Medic Buddy', 'unit', 'medic_unit', 0, 3,
    'Menambah 1 anggota tim baru dengan aura penyembuh otomatis di sekitarnya.',
    '3 Peti Tumpuk L (2 Bawah + 1 Atas)',
    'assets/tumpukan/tumpukan_resep_buddy_baru_merah.svg',
    'assets/karakter/biskuit_karamel_depan.svg'
  ),
  medkit: r(
    'medkit', 'Medic Syringe (Medkit)', 'weapon', 'medic', 0, 3,
    'Memulihkan HP rekan tim atau membangkitkan rekan KO kembali ke 100% HP.',
    '3 Peti Lapis Bawah (3 Slot Bawah)',
    'assets/tumpukan/tumpukan_resep_kotak_medis.svg',
    'assets/senjata/kotak_medis.svg'
  ),
  bazooka: r(
    'bazooka', 'Rocket Bazooka', 'weapon', 'bazooka', 450, 4,
    'Roket ledak berat berdaya hancur tinggi terhadap markas lawan dan Tank.',
    '4 Peti Datar (2x2 Lapis Bawah)',
    'assets/tumpukan/tumpukan_resep_bazoka.svg',
    'assets/senjata/bazoka.svg'
  ),
  commando: r(
    'commando', 'Commando Buddy', 'unit', 'commando', 220, 4,
    'Merekrut prajurit elit (Kacang Radar) bersenjata jarak jauh.',
    '4 Peti Tegak (2 Bawah + 2 Atas)',
    'assets/tumpukan/tumpukan_resep_sniper.svg',
    'assets/senjata/sniper.svg'
  ),
  tank: r(
    'tank', 'Tank Lapis Baja', 'vehicle', 'tank', 980, 8,
    'Kendaraan tempur lapis baja meriam berat. Dekati Tank dan tekan E untuk naik atau turun!',
    '8 Peti Penuh (2x2x2 Dua Lapis)',
    'assets/tumpukan/tumpukan_resep_tank.svg',
    'assets/kendaraan/tank_merah_samping.svg'
  ),
  ammo: r(
    'ammo', 'Paket Amunisi', 'support', 'ammo', 0, 0,
    'Formasi tidak beraturan menghasilkan suplai darurat.'
  )
};

export const CRAFTABLE_RECIPES: readonly Recipe[] = [
  RECIPES.pistol,
  RECIPES.shotgun,
  RECIPES.grenade,
  RECIPES.medicUnit,
  RECIPES.medkit,
  RECIPES.bazooka,
  RECIPES.commando,
  RECIPES.tank
];

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

import { RecipeResult, StackingRecipeDef, TeamId } from '../types';

export class StackingPad {
  public teamId: TeamId;
  public slots: boolean[] = new Array(8).fill(false);
  public origin: { x: number; z: number };

  constructor(teamId: TeamId, originX: number = 0, originZ: number = 0) {
    this.teamId = teamId;
    this.origin = { x: originX, z: originZ };
  }

  // Set slot with gravity and structural validation
  public setSlot(slotIndex: number, filled: boolean): boolean {
    if (slotIndex < 0 || slotIndex >= 8) {
      throw new Error(`Invalid slot index: ${slotIndex}. Must be 0 to 7.`);
    }

    // Top layer rule: cannot place on top layer if bottom slot is empty
    if (slotIndex >= 4 && filled) {
      const bottomSlot = slotIndex - 4;
      if (!this.slots[bottomSlot]) {
        return false; // Rejected: floating crate violation
      }
    }

    this.slots[slotIndex] = filled;

    // Gravity falloff: if bottom slot is removed, top slot must drop
    if (slotIndex < 4 && !filled) {
      const topSlot = slotIndex + 4;
      this.slots[topSlot] = false;
    }

    return true;
  }

  public get totalCrates(): number {
    return this.slots.filter(Boolean).length;
  }

  public clear(): void {
    this.slots.fill(false);
  }

  // Evaluate the current 2x2x2 formation
  public evaluate(): RecipeResult {
    const count = this.totalCrates;

    if (count === 0) {
      return {
        title: 'Pad Kosong',
        category: 'empty',
        itemType: 'none',
        dps: 0,
        description: 'Taruh minimal 1 peti di dalam kotak untuk mulai merakit perlengkapan.'
      };
    }

    // 8 Crates: Full Cube
    if (count === 8) {
      return {
        title: 'Heavy Battle Tank',
        category: 'vehicle',
        itemType: 'tank',
        dps: 980,
        description: 'Kendaraan lapis baja bersenjata meriam kanon ganda.'
      };
    }

    // 4 Crates Flat (All Layer 0 filled)
    if (count === 4 && this.isFlat2x2()) {
      return {
        title: 'Rocket Bazooka',
        category: 'weapon',
        itemType: 'bazooka',
        dps: 450,
        description: 'Senjata berat proyektil ledakan area yang merusak bangunan.'
      };
    }

    // 4 Crates Wall (2x1x2 vertical plane)
    if (count === 4 && this.isWall2x1x2()) {
      return {
        title: 'Commando Buddy',
        category: 'unit',
        itemType: 'commando',
        dps: 220,
        description: 'Prajurit bot penyerang agresif bersenjatakan senapan mesin.'
      };
    }

    // 3 Crates (2 on bottom + 1 on top)
    if (count === 3 && this.isMedicFormula()) {
      return {
        title: 'Medic Buddy',
        category: 'unit',
        itemType: 'medic_unit',
        dps: 0,
        description: 'Prajurit dokter tim yang menyembuhkan kawan di sekitarnya.'
      };
    }

    // 2 Crates Vertical Stack (1x1x2)
    if (count === 2 && this.isVerticalStack()) {
      return {
        title: 'Granat Nanas (x5)',
        category: 'weapon',
        itemType: 'grenade',
        dps: 320,
        description: 'Peledak lempar membal yang meledak setelah hitungan 3 detik.'
      };
    }

    // 2 Crates Horizontal Line (2x1x1)
    if (count === 2 && this.isHorizontalLine()) {
      return {
        title: 'Shotgun Penghancur',
        category: 'weapon',
        itemType: 'shotgun',
        dps: 220,
        description: 'Sebaran 5 peluru mematikan untuk jarak dekat.'
      };
    }

    // 1 Crate (Any single slot)
    if (count === 1) {
      return {
        title: 'Pistol Standard',
        category: 'weapon',
        itemType: 'pistol',
        dps: 90,
        description: 'Senjata pertahanan awal dengan peluru tak terbatas.'
      };
    }

    // Fallback: Mixed Tactical Pack
    return {
      title: `Paket Amunisi (${count} Peti)`,
      category: 'support',
      itemType: 'ammo',
      dps: 0,
      description: 'Formasi tidak beraturan menghasilkan pasokan medkit dan amunisi darurat.'
    };
  }

  public isFlat2x2(): boolean {
    return this.slots[0] && this.slots[1] && this.slots[2] && this.slots[3] &&
           !this.slots[4] && !this.slots[5] && !this.slots[6] && !this.slots[7];
  }

  public isWall2x1x2(): boolean {
    return (this.slots[0] && this.slots[1] && this.slots[4] && this.slots[5]) ||
           (this.slots[2] && this.slots[3] && this.slots[6] && this.slots[7]) ||
           (this.slots[0] && this.slots[2] && this.slots[4] && this.slots[6]) ||
           (this.slots[1] && this.slots[3] && this.slots[5] && this.slots[7]);
  }

  public isMedicFormula(): boolean {
    const bottomCount = [this.slots[0], this.slots[1], this.slots[2], this.slots[3]].filter(Boolean).length;
    const topCount = [this.slots[4], this.slots[5], this.slots[6], this.slots[7]].filter(Boolean).length;
    return bottomCount === 2 && topCount === 1;
  }

  public isVerticalStack(): boolean {
    return (this.slots[0] && this.slots[4]) ||
           (this.slots[1] && this.slots[5]) ||
           (this.slots[2] && this.slots[6]) ||
           (this.slots[3] && this.slots[7]);
  }

  public isHorizontalLine(): boolean {
    const bottomCount = [this.slots[0], this.slots[1], this.slots[2], this.slots[3]].filter(Boolean).length;
    const topCount = [this.slots[4], this.slots[5], this.slots[6], this.slots[7]].filter(Boolean).length;
    if (bottomCount !== 2 || topCount !== 0) return false;
    return (this.slots[0] && this.slots[1]) ||
           (this.slots[2] && this.slots[3]) ||
           (this.slots[0] && this.slots[2]) ||
           (this.slots[1] && this.slots[3]);
  }
}

import { RecipeResult, StackingRecipeDef, TeamId, Vector3D } from '../types';

export interface PadSlotCoordinate {
  slotIndex: number;
  quadrant: number; // 0: NW, 1: NE, 2: SW, 3: SE
  layer: number;    // 0: Bottom (y=0.55), 1: Top (y=1.50)
  local: Vector3D;
  world: Vector3D;
}

export class StackingPad {
  public teamId: TeamId;
  public slots: boolean[] = new Array(8).fill(false);
  public origin: { x: number; z: number };

  // Pad Physical Geometry Constants
  public static readonly PAD_SURFACE_Y = 0.10;
  public static readonly LAYER_0_Y = 0.55;
  public static readonly LAYER_1_Y = 1.50;
  public static readonly QUADRANT_OFFSET = 0.55;
  public static readonly PAD_HALF_WIDTH = 2.10;

  constructor(teamId: TeamId, originX: number = 0, originZ: number = 0) {
    this.teamId = teamId;
    this.origin = { x: originX, z: originZ };
  }

  /**
   * Calculates exact local and world 3D coordinates for any slot index (0..7).
   */
  public getSlotCoordinates(slotIndex: number): PadSlotCoordinate {
    if (slotIndex < 0 || slotIndex >= 8) {
      throw new Error(`Invalid slot index: ${slotIndex}. Must be 0 to 7.`);
    }

    const layer = slotIndex >= 4 ? 1 : 0;
    const quadrant = slotIndex % 4;

    const localX = (quadrant % 2 === 1) ? StackingPad.QUADRANT_OFFSET : -StackingPad.QUADRANT_OFFSET;
    const localZ = quadrant >= 2 ? StackingPad.QUADRANT_OFFSET : -StackingPad.QUADRANT_OFFSET;
    const localY = layer === 1 ? StackingPad.LAYER_1_Y : StackingPad.LAYER_0_Y;

    return {
      slotIndex,
      quadrant,
      layer,
      local: { x: localX, y: localY, z: localZ },
      world: {
        x: this.origin.x + localX,
        y: localY,
        z: this.origin.z + localZ
      }
    };
  }

  /**
   * Intelligently resolves the nearest valid slot for an incoming position (player or thrown crate).
   * Sorts quadrants by proximity, checks Layer 0 first, then Layer 1 if bottom is occupied.
   * Returns -1 if pad is full (8/8).
   */
  public findBestSlotForPosition(worldX: number, worldZ: number): number {
    const dx = worldX - this.origin.x;
    const dz = worldZ - this.origin.z;

    const quadrants = [
      { index: 0, x: -StackingPad.QUADRANT_OFFSET, z: -StackingPad.QUADRANT_OFFSET }, // NW
      { index: 1, x:  StackingPad.QUADRANT_OFFSET, z: -StackingPad.QUADRANT_OFFSET }, // NE
      { index: 2, x: -StackingPad.QUADRANT_OFFSET, z:  StackingPad.QUADRANT_OFFSET }, // SW
      { index: 3, x:  StackingPad.QUADRANT_OFFSET, z:  StackingPad.QUADRANT_OFFSET }  // SE
    ];

    // Sort quadrants by ascending Euclidean distance
    quadrants.sort((a, b) => {
      const distA = (dx - a.x) * (dx - a.x) + (dz - a.z) * (dz - a.z);
      const distB = (dx - b.x) * (dx - b.x) + (dz - b.z) * (dz - b.z);
      return distA - distB;
    });

    // For nearest quadrant: check bottom slot first; if occupied, check top slot
    for (const q of quadrants) {
      const bottomSlot = q.index;
      const topSlot = q.index + 4;
      if (!this.slots[bottomSlot]) {
        return bottomSlot;
      }
      if (!this.slots[topSlot]) {
        return topSlot;
      }
    }

    return -1; // Pad is completely filled
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

  /**
   * Official Recipe Evaluator mapping all 7 Team Buddies configurations.
   */
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

    // Recipe 7: 8 Crates (Full 2x2x2 Solid Cube) -> Heavy Battle Tank
    if (count === 8) {
      return {
        title: 'Heavy Battle Tank',
        category: 'vehicle',
        itemType: 'tank',
        dps: 980,
        description: 'Kendaraan lapis baja bersenjata meriam kanon ganda.'
      };
    }

    // Recipe 5: 4 Crates Flat (All Layer 0 filled, Layer 1 empty) -> Rocket Bazooka
    if (count === 4 && this.isFlat2x2()) {
      return {
        title: 'Rocket Bazooka',
        category: 'weapon',
        itemType: 'bazooka',
        dps: 450,
        description: 'Senjata berat proyektil ledakan area yang merusak bangunan.'
      };
    }

    // Recipe 6: 4 Crates Wall (2x1x2 vertical plane) -> Commando Buddy
    if (count === 4 && this.isWall2x1x2()) {
      return {
        title: 'Commando Buddy',
        category: 'unit',
        itemType: 'commando',
        dps: 220,
        description: 'Prajurit bot penyerang agresif bersenjatakan senapan mesin.'
      };
    }

    // Recipe 4A: 3 Crates (2 on bottom + 1 on top) -> Medic Buddy unit
    if (count === 3 && this.isMedicFormula()) {
      return {
        title: 'Medic Buddy',
        category: 'unit',
        itemType: 'medic_unit',
        dps: 0,
        description: 'Prajurit dokter tim yang menyembuhkan kawan di sekitarnya.'
      };
    }

    // Recipe 4B: 3 Crates Flat (3 on Layer 0) -> Medic Syringe (Medkit)
    if (count === 3 && this.isMedicFlat()) {
      return {
        title: 'Medic Syringe (Medkit)',
        category: 'weapon',
        itemType: 'medic',
        dps: 0,
        description: 'Suntikan penyembuh instan untuk memulihkan HP diri atau kawan.'
      };
    }

    // Recipe 3: 2 Crates Vertical Stack (1x1x2) -> Pineapple Grenades
    if (count === 2 && this.isVerticalStack()) {
      return {
        title: 'Granat Nanas (x5)',
        category: 'weapon',
        itemType: 'grenade',
        dps: 320,
        description: 'Peledak lempar membal yang meledak setelah hitungan 3 detik.'
      };
    }

    // Recipe 2: 2 Crates Horizontal Line (2x1x1) -> Shotgun
    if (count === 2 && this.isHorizontalLine()) {
      return {
        title: 'Shotgun Penghancur',
        category: 'weapon',
        itemType: 'shotgun',
        dps: 220,
        description: 'Sebaran 5 peluru mematikan untuk jarak dekat.'
      };
    }

    // Recipe 1: 1 Crate (Any single slot) -> Pistol
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

  /**
   * Alias for evaluate() to guarantee contract interoperability.
   */
  public evaluateRecipe(): RecipeResult {
    return this.evaluate();
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

  public isMedicFlat(): boolean {
    const bottomCount = [this.slots[0], this.slots[1], this.slots[2], this.slots[3]].filter(Boolean).length;
    const topCount = [this.slots[4], this.slots[5], this.slots[6], this.slots[7]].filter(Boolean).length;
    return bottomCount === 3 && topCount === 0;
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

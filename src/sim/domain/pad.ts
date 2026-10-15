import { BASE_COORDINATES, PAD } from './constants';
import type { TeamId } from './teams';

export type PadMask = number;

export const EMPTY_PAD: PadMask = 0;
export const FULL_PAD: PadMask = 0xff;

export function slotLayer(slot: number): number {
  return slot >= 4 ? 1 : 0;
}

export function slotQuadrant(slot: number): number {
  return slot % 4;
}

export function assertSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < 0 || slot > 7) {
    throw new Error(`slot ${slot} out of range: expected an integer between 0 and 7`);
  }
}

export function isSlotFilled(mask: PadMask, slot: number): boolean {
  return (mask & (1 << slot)) !== 0;
}

export function totalCrates(mask: PadMask): number {
  let n = 0;
  for (let i = 0; i < 8; i++) if (mask & (1 << i)) n++;
  return n;
}

export function bottomCount(mask: PadMask): number {
  return totalCrates(mask & 0x0f);
}

export function topCount(mask: PadMask): number {
  return totalCrates((mask >> 4) & 0x0f);
}

/** A top-layer crate needs the crate underneath it, otherwise it would float. */
export function canOccupy(mask: PadMask, slot: number): boolean {
  assertSlot(slot);
  if (isSlotFilled(mask, slot)) return false;
  if (slot >= 4) return isSlotFilled(mask, slot - 4);
  return true;
}

/**
 * Setting a slot returns a new mask. Clearing a bottom slot also clears the one
 * above it so a stack never hangs in the air.
 */
export function setSlot(mask: PadMask, slot: number, filled: boolean): PadMask {
  assertSlot(slot);
  if (filled) {
    if (!canOccupy(mask, slot)) return mask;
    return mask | (1 << slot);
  }
  const cleared = mask & ~(1 << slot);
  return slot < 4 ? cleared & ~(1 << (slot + 4)) : cleared;
}

export function padOrigin(team: TeamId): { x: number; z: number } {
  const base = BASE_COORDINATES[team];
  return { x: base.x * 0.82, z: base.z * 0.82 };
}

export function slotPosition(team: TeamId, slot: number): { x: number; y: number; z: number } {
  assertSlot(slot);
  const origin = padOrigin(team);
  const quadrant = slotQuadrant(slot);
  const off = PAD.quadrantOffset;
  return {
    x: origin.x + (quadrant % 2 === 1 ? off : -off),
    y: PAD.layerY[slotLayer(slot)],
    z: origin.z + (quadrant >= 2 ? off : -off)
  };
}

const QUADRANT_SIGNS = [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const;

/** Nearest free slot, bottom layer preferred; -1 when the pad is full. */
export function findBestSlot(mask: PadMask, team: TeamId, worldX: number, worldZ: number): number {
  const origin = padOrigin(team);
  const dx = worldX - origin.x;
  const dz = worldZ - origin.z;
  const order = QUADRANT_SIGNS.map(([sx, sz], index) => ({
    index,
    d: (dx - sx * PAD.quadrantOffset) ** 2 + (dz - sz * PAD.quadrantOffset) ** 2
  })).sort((a, b) => a.d - b.d);

  for (const q of order) {
    if (!isSlotFilled(mask, q.index)) return q.index;
    if (!isSlotFilled(mask, q.index + 4)) return q.index + 4;
  }
  return -1;
}

export function maskOf(slots: Iterable<number>): PadMask {
  let mask = 0;
  for (const s of slots) {
    assertSlot(s);
    mask |= 1 << s;
  }
  return mask;
}

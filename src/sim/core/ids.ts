export type EntityId = number;
export const NO_ENTITY: EntityId = 0;

const GEN_BITS = 8;
const GEN_MASK = (1 << GEN_BITS) - 1;
export const MAX_SLOTS = 1024;

export interface IdAllocator {
  alloc(): EntityId;
  free(id: EntityId): void;
  slotOf(id: EntityId): number;
  genOf(id: EntityId): number;
  liveCount(): number;
}

export function createIdAllocator(): IdAllocator {
  const generations = new Uint8Array(MAX_SLOTS);
  const taken = new Uint8Array(MAX_SLOTS);
  const freeSlots: number[] = [];
  for (let s = MAX_SLOTS - 1; s >= 1; s--) freeSlots.push(s);
  let live = 0;

  return {
    alloc(): EntityId {
      const slot = freeSlots.pop();
      if (slot === undefined) throw new Error('entity slot exhausted');
      taken[slot] = 1;
      generations[slot] = (generations[slot] + 1) & GEN_MASK;
      live++;
      return (slot << GEN_BITS) | generations[slot];
    },
    free(id: EntityId): void {
      const slot = id >> GEN_BITS;
      if (slot < 1 || slot >= MAX_SLOTS || !taken[slot]) return;
      taken[slot] = 0;
      live--;
      freeSlots.push(slot);
    },
    slotOf: (id) => id >> GEN_BITS,
    genOf: (id) => id & GEN_MASK,
    liveCount: () => live
  };
}

/**
 * A handle is only valid while the slot keeps the same generation, which is how
 * a stale `heldBy` reference is detected instead of silently pointing at a
 * recycled entity.
 */
export function isSameEntity(a: EntityId, b: EntityId): boolean {
  return a !== NO_ENTITY && a === b;
}

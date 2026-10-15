import { describe, expect, it } from 'vitest';
import { createIdAllocator, MAX_SLOTS } from '../../src/sim/core/ids';

describe('entity ids', () => {
  it('never repeats an id while slots are live', () => {
    const ids = createIdAllocator();
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const id = ids.alloc();
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  it('reuses a slot but changes its generation', () => {
    const ids = createIdAllocator();
    const first = ids.alloc();
    ids.free(first);
    const second = ids.alloc();
    expect(ids.slotOf(second)).toBe(ids.slotOf(first));
    expect(second).not.toBe(first);
    expect(ids.genOf(second)).not.toBe(ids.genOf(first));
  });

  it('survives 10000 alloc and free cycles without collision or leak', () => {
    const ids = createIdAllocator();
    const live = new Set<number>();
    for (let i = 0; i < 10000; i++) {
      const id = ids.alloc();
      expect(live.has(id)).toBe(false);
      live.add(id);
      if (live.size > 40) {
        const [oldest] = live;
        live.delete(oldest);
        ids.free(oldest);
      }
    }
    expect(ids.liveCount()).toBe(live.size);
  });

  it('throws instead of silently returning a duplicate when exhausted', () => {
    const ids = createIdAllocator();
    for (let i = 0; i < MAX_SLOTS - 1; i++) ids.alloc();
    expect(() => ids.alloc()).toThrow(/exhausted/);
  });

  it('ignores freeing an unknown slot', () => {
    const ids = createIdAllocator();
    expect(() => ids.free(0)).not.toThrow();
    expect(ids.liveCount()).toBe(0);
  });
});

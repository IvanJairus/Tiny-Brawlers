import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/sim/core/rng';

describe('rng', () => {
  it('is reproducible from the same seed', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('differs across seeds', () => {
    const a = Array.from({ length: 8 }, createRng(1).next);
    const b = Array.from({ length: 8 }, createRng(2).next);
    expect(a).not.toEqual(b);
  });

  it('keeps its state resumable, which snapshots depend on', () => {
    const a = createRng(99);
    a.next(); a.next();
    const saved = a.state();
    const expected = [a.next(), a.next()];
    const b = createRng(0);
    b.setState(saved);
    expect([b.next(), b.next()]).toEqual(expected);
  });

  it('stays inside its declared ranges', () => {
    const r = createRng(7);
    for (let i = 0; i < 2000; i++) {
      const f = r.float(-3, 5);
      expect(f).toBeGreaterThanOrEqual(-3);
      expect(f).toBeLessThan(5);
      const n = r.int(6);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(6);
    }
  });

  it('has a roughly uniform spread', () => {
    const r = createRng(4242);
    const buckets = [0, 0, 0, 0];
    for (let i = 0; i < 40000; i++) buckets[Math.floor(r.next() * 4)]++;
    for (const bucket of buckets) expect(bucket).toBeGreaterThan(9000);
  });
});

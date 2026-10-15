import { describe, expect, it } from 'vitest';
import {
  assertSlot, canOccupy, findBestSlot, isSlotFilled, maskOf, padOrigin, setSlot,
  slotLayer, slotPosition, slotQuadrant, totalCrates
} from '../../src/sim/domain/pad';
import { EMPTY_PAD } from '../../src/sim/domain/pad';

describe('pad slots', () => {
  it('maps slot index to layer and quadrant', () => {
    for (let s = 0; s < 4; s++) expect(slotLayer(s)).toBe(0);
    for (let s = 4; s < 8; s++) expect(slotLayer(s)).toBe(1);
    expect(slotQuadrant(5)).toBe(1);
  });

  it('rejects slot indices outside 0..7', () => {
    expect(() => assertSlot(-1)).toThrow(/out of range/);
    expect(() => assertSlot(8)).toThrow(/out of range/);
    expect(() => assertSlot(1.5)).toThrow(/out of range/);
  });

  it('refuses a top crate with nothing under it', () => {
    expect(canOccupy(EMPTY_PAD, 6)).toBe(false);
    expect(canOccupy(maskOf([2]), 6)).toBe(true);
  });

  it('cascades when a supporting crate is removed', () => {
    let mask = maskOf([1]);
    mask = setSlot(mask, 5, true);
    expect(isSlotFilled(mask, 5)).toBe(true);
    mask = setSlot(mask, 1, false);
    expect(isSlotFilled(mask, 1)).toBe(false);
    expect(isSlotFilled(mask, 5)).toBe(false);
  });

  it('keeps an unrelated top crate when its support is intact', () => {
    let mask = maskOf([0, 1, 4, 5]);
    mask = setSlot(mask, 0, false);
    expect(isSlotFilled(mask, 4)).toBe(false);
    expect(isSlotFilled(mask, 5)).toBe(true);
  });

  it('counts crates', () => {
    expect(totalCrates(EMPTY_PAD)).toBe(0);
    expect(totalCrates(maskOf([0, 3, 7]))).toBe(3);
    expect(totalCrates(0xff)).toBe(8);
  });

  it('prefers the nearest free bottom slot', () => {
    const origin = padOrigin('red');
    const target = slotPosition('red', 3);
    expect(findBestSlot(EMPTY_PAD, 'red', target.x, target.z)).toBe(3);
    expect(findBestSlot(maskOf([3]), 'red', target.x, target.z)).toBe(7);
    expect(findBestSlot(0xff, 'red', origin.x, origin.z)).toBe(-1);
  });

  it('stacks upward before moving to another quadrant', () => {
    const bottom = slotPosition('blue', 1);
    expect(findBestSlot(maskOf([1]), 'blue', bottom.x, bottom.z)).toBe(5);
  });

  it('places slots on a 2x2 grid at two heights', () => {
    const a = slotPosition('cyan', 0);
    const b = slotPosition('cyan', 1);
    const c = slotPosition('cyan', 4);
    expect(a.x).not.toBe(b.x);
    expect(a.z).toBe(b.z);
    expect(c.y).toBeGreaterThan(a.y);
  });
});

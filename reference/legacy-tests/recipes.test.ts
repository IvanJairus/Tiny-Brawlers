import { describe, it, expect } from 'vitest';
import { StackingPad } from '../src/entities/basePad';

describe('StackingPad Recipe Engine (Normal Flow)', () => {
  it('identifies 1 crate anywhere as Pistol Standard', () => {
    const pad = new StackingPad('red');
    pad.setSlot(0, true);
    const res = pad.evaluate();
    expect(res.itemType).toBe('pistol');
    expect(res.category).toBe('weapon');
    expect(res.dps).toBe(90);
  });

  it('identifies 2 crates stacked vertically (1x1x2) as Pineapple Grenades', () => {
    const pad = new StackingPad('blue');
    pad.setSlot(1, true); // bottom
    pad.setSlot(5, true); // top directly above 1
    const res = pad.evaluate();
    expect(res.itemType).toBe('grenade');
    expect(res.title).toContain('Granat Nanas');
    expect(res.category).toBe('weapon');
    expect(res.dps).toBe(320);
  });

  it('identifies 2 crates in a horizontal line as Shotgun', () => {
    const pad = new StackingPad('yellow');
    pad.setSlot(2, true);
    pad.setSlot(3, true);
    const res = pad.evaluate();
    expect(res.itemType).toBe('shotgun');
    expect(res.category).toBe('weapon');
    expect(res.dps).toBe(220);
  });

  it('identifies 3 crates (2 bottom + 1 top) as Medic Buddy unit', () => {
    const pad = new StackingPad('cyan');
    pad.setSlot(0, true); // bottom 0
    pad.setSlot(1, true); // bottom 1
    pad.setSlot(4, true); // top 4 above 0
    const res = pad.evaluate();
    expect(res.itemType).toBe('medic_unit');
    expect(res.category).toBe('unit');
    expect(res.title).toBe('Medic Buddy');
  });

  it('identifies 4 crates flat on bottom layer as Rocket Bazooka', () => {
    const pad = new StackingPad('red');
    pad.setSlot(0, true);
    pad.setSlot(1, true);
    pad.setSlot(2, true);
    pad.setSlot(3, true);
    const res = pad.evaluate();
    expect(res.itemType).toBe('bazooka');
    expect(res.category).toBe('weapon');
    expect(res.dps).toBe(450);
  });

  it('identifies 4 crates arranged in a vertical wall (2x1x2) as Commando Buddy unit', () => {
    const pad = new StackingPad('blue');
    pad.setSlot(0, true); // bottom front
    pad.setSlot(1, true); // bottom front
    pad.setSlot(4, true); // top front
    pad.setSlot(5, true); // top front
    const res = pad.evaluate();
    expect(res.itemType).toBe('commando');
    expect(res.category).toBe('unit');
    expect(res.title).toContain('Commando Buddy');
  });

  it('identifies 8 crates (full 2x2x2 cube) as Heavy Battle Tank', () => {
    const pad = new StackingPad('red');
    for (let i = 0; i < 8; i++) {
      // Must fill bottom first to satisfy gravity
      if (i >= 4) {
        expect(pad.setSlot(i, true)).toBe(true);
      } else {
        pad.setSlot(i, true);
      }
    }
    const res = pad.evaluate();
    expect(res.itemType).toBe('tank');
    expect(res.category).toBe('vehicle');
    expect(res.dps).toBe(980);
  });
});

describe('StackingPad Recipe Engine (Abnormal & Edge-Case Flow)', () => {
  it('rejects floating crates on layer 2 if slot beneath is empty', () => {
    const pad = new StackingPad('red');
    // Slot 5 is above slot 1. Slot 1 is currently empty.
    const success = pad.setSlot(5, true);
    expect(success).toBe(false);
    expect(pad.slots[5]).toBe(false);
    expect(pad.totalCrates).toBe(0);
  });

  it('automatically clears top crate if bottom crate is removed (gravity cascade)', () => {
    const pad = new StackingPad('blue');
    pad.setSlot(2, true); // bottom
    pad.setSlot(6, true); // top above 2
    expect(pad.totalCrates).toBe(2);

    // Remove bottom crate
    pad.setSlot(2, false);
    // Both 2 and 6 should now be false
    expect(pad.slots[2]).toBe(false);
    expect(pad.slots[6]).toBe(false);
    expect(pad.totalCrates).toBe(0);
  });

  it('throws an error when setting out-of-bounds slot index', () => {
    const pad = new StackingPad('yellow');
    expect(() => pad.setSlot(-1, true)).toThrowError(/Invalid slot index/);
    expect(() => pad.setSlot(8, true)).toThrowError(/Invalid slot index/);
    expect(() => pad.setSlot(99, true)).toThrowError(/Invalid slot index/);
  });

  it('returns empty status for 0 crates', () => {
    const pad = new StackingPad('cyan');
    const res = pad.evaluate();
    expect(res.category).toBe('empty');
    expect(res.itemType).toBe('none');
    expect(res.dps).toBe(0);
  });

  it('properly resets all slots when pad.clear() is invoked', () => {
    const pad = new StackingPad('red');
    pad.setSlot(0, true);
    pad.setSlot(1, true);
    expect(pad.totalCrates).toBe(2);
    pad.clear();
    expect(pad.totalCrates).toBe(0);
    expect(pad.evaluate().category).toBe('empty');
  });
});

import { describe, expect, it } from 'vitest';
import { createStepper } from '../../src/sim/core/tick';
import { MAX_ACCUMULATOR_MS, TICK_MS } from '../../src/sim/domain/constants';

describe('fixed tick stepper', () => {
  it('runs one step per tick of elapsed time', () => {
    let steps = 0;
    const stepper = createStepper(() => steps++);
    expect(stepper.push(TICK_MS)).toBe(1);
    expect(steps).toBe(1);
  });

  it('absorbs a sub-tick frame without stepping', () => {
    let steps = 0;
    const stepper = createStepper(() => steps++);
    expect(stepper.push(TICK_MS / 3)).toBe(0);
    expect(stepper.pending()).toBeCloseTo(TICK_MS / 3, 5);
  });

  it('exposes interpolation alpha for the renderer', () => {
    const stepper = createStepper(() => {});
    stepper.push(TICK_MS * 1.5);
    expect(stepper.alpha()).toBeCloseTo(0.5, 5);
  });

  it('ignores nonsense elapsed time', () => {
    let steps = 0;
    const stepper = createStepper(() => steps++);
    expect(stepper.push(0)).toBe(0);
    expect(stepper.push(-500)).toBe(0);
    expect(stepper.push(Number.NaN)).toBe(0);
    expect(stepper.push(Number.POSITIVE_INFINITY)).toBe(0);
    expect(steps).toBe(0);
  });

  it('catches up but drops the backlog instead of spiralling', () => {
    let steps = 0;
    const stepper = createStepper(() => steps++);
    const taken = stepper.push(60_000);
    expect(taken).toBeLessThanOrEqual(5);
    expect(stepper.pending()).toBe(0);
    stepper.push(TICK_MS);
    expect(steps).toBe(taken + 1);
  });

  it('never accumulates more than the clamp', () => {
    const stepper = createStepper(() => {});
    stepper.push(5000);
    expect(stepper.pending()).toBeLessThanOrEqual(MAX_ACCUMULATOR_MS);
  });

  it('produces the same step count for shuffled frame pacing of equal total time', () => {
    const even = { steps: 0 };
    const jittery = { steps: 0 };
    const a = createStepper(() => even.steps++);
    const b = createStepper(() => jittery.steps++);
    for (let i = 0; i < 60; i++) {
      a.push(TICK_MS);
      b.push(i % 2 === 0 ? TICK_MS * 0.4 : TICK_MS * 1.6);
    }
    expect(jittery.steps).toBe(even.steps);
  });
});

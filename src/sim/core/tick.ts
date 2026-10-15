import { MAX_ACCUMULATOR_MS, MAX_CATCHUP_STEPS, TICK_MS, TICK_S } from '../domain/constants';

export interface Stepper {
  push(elapsedMs: number): number;
  pending(): number;
  alpha(): number;
  reset(): void;
}

/**
 * The sim owns no clock: the caller feeds elapsed milliseconds in, so the same
 * stepper runs under Vitest with synthetic time and in the browser with rAF time.
 */
export function createStepper(step: (dtSeconds: number) => void): Stepper {
  let acc = 0;

  return {
    push(elapsedMs: number): number {
      if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
      acc = Math.min(acc + elapsedMs, MAX_ACCUMULATOR_MS);
      let steps = 0;
      while (acc + 1e-6 >= TICK_MS && steps < MAX_CATCHUP_STEPS) {
        step(TICK_S);
        acc -= TICK_MS;
        steps++;
      }
      if (steps >= MAX_CATCHUP_STEPS) acc = 0;
      return steps;
    },
    pending: () => acc,
    alpha: () => acc / TICK_MS,
    reset() {
      acc = 0;
    }
  };
}

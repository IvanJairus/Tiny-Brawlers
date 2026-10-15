export interface Rng {
  next(): number;
  float(min?: number, max?: number): number;
  int(bound: number): number;
  sign(): number;
  state(): number;
  setState(state: number): void;
}

/**
 * splitmix32 keeps its whole state in one uint32 so an Rng can be serialised
 * into a snapshot and resumed identically on another machine.
 */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    z = (z ^ (z >>> 15)) >>> 0;
    return z / 4294967296;
  };
  return {
    next,
    float(min = 0, max = 1) { return min + next() * (max - min); },
    int(bound) { return Math.floor(next() * bound); },
    sign() { return next() < 0.5 ? -1 : 1; },
    state: () => s,
    setState(state) { s = state >>> 0; }
  };
}

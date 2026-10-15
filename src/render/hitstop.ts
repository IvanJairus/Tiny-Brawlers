import { SLOW_FRAME_MS } from './adaptation';

export const HIT_STOP_S = 0.04;
export const BLAST_STRENGTH = 0.15;

export interface BlastCheck {
  strength: number;
  coarsePointer: boolean;
  reducedMotion: boolean;
  frameMs: number;
}

/**
 * A four-frame freeze is readability on a monitor and judder on a phone, and it
 * only helps when the frame already arrived on time.
 */
export function blastWorthFreezing(blast: BlastCheck): boolean {
  return !blast.coarsePointer
    && !blast.reducedMotion
    && blast.frameMs <= SLOW_FRAME_MS
    && blast.strength >= BLAST_STRENGTH;
}

export interface HitStop {
  trigger(time: number): void;
  frozen(time: number): boolean;
}

export function createHitStop(): HitStop {
  let until = -1;
  return {
    trigger(time: number): void { until = time + HIT_STOP_S; },
    frozen(time: number): boolean { return time < until; }
  };
}

import type { Patch } from './graph';

/**
 * Every sound is one data row, so adding a cue never means adding code. Waveforms
 * and envelopes only: the build ships no audio files.
 */
export const SFX: Record<string, Patch> = {
  shoot: { type: 'square', frequency: 620, endFrequency: 140, duration: 0.09, volume: 0.16, attack: 0.004 },
  shotgun: { type: 'sawtooth', frequency: 320, endFrequency: 70, duration: 0.16, volume: 0.2, attack: 0.005 },
  explosion: { type: 'triangle', frequency: 180, endFrequency: 34, duration: 0.42, volume: 0.28, attack: 0.008 },
  pickup: { type: 'sine', frequency: 480, endFrequency: 900, duration: 0.11, volume: 0.14, attack: 0.006 },
  place: { type: 'square', frequency: 240, endFrequency: 360, duration: 0.1, volume: 0.13, attack: 0.005 },
  throw: { type: 'sine', frequency: 700, endFrequency: 220, duration: 0.14, volume: 0.12, attack: 0.005 },
  build: { type: 'square', frequency: 300, endFrequency: 1250, duration: 0.3, volume: 0.18, attack: 0.01 },
  heal: { type: 'sine', frequency: 880, endFrequency: 1320, duration: 0.18, volume: 0.12, attack: 0.02 },
  hit: { type: 'square', frequency: 420, endFrequency: 120, duration: 0.07, volume: 0.12, attack: 0.003 },
  knockout: { type: 'sawtooth', frequency: 300, endFrequency: 60, duration: 0.3, volume: 0.2, attack: 0.006 },
  victory: { type: 'square', frequency: 523, endFrequency: 1046, duration: 0.6, volume: 0.2, attack: 0.02 },
  defeat: { type: 'triangle', frequency: 392, endFrequency: 98, duration: 0.8, volume: 0.2, attack: 0.02 }
};

export const MELODY: number[] = [523, 0, 659, 784, 0, 659, 523, 0, 587, 698, 0, 587, 523, 0, 440, 523];
export const BASSLINE: number[] = [131, 131, 196, 196, 175, 175, 98, 98, 131, 131, 196, 196, 220, 220, 98, 98];
export const STEP_SECONDS = 0.16;

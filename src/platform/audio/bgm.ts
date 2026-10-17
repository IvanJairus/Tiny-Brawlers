import type { AudioGraph } from './graph';
import { BASSLINE, MELODY, STEP_SECONDS } from './patches';

export interface Bgm {
  start(): void;
  stop(): void;
  running(): boolean;
  setVolume(volume: number): void;
}

const LOOKAHEAD_SECONDS = 0.2;

/**
 * The sequencer is scheduled against the audio clock, not requestAnimationFrame,
 * so a dropped video frame cannot make the music limp.
 */
export function createBgm(audio: AudioGraph): Bgm {
  let timer: number | null = null;
  let step = 0;
  let origin = 0;
  let bgmVolume = 0.8;

  const tick = (): void => {
    const context = audio.context;
    if (!context) return;
    while (origin + step * STEP_SECONDS < context.currentTime + LOOKAHEAD_SECONDS) {
      const at = origin + step * STEP_SECONDS;
      const note = MELODY[step % MELODY.length];
      const bass = BASSLINE[step % BASSLINE.length];
      if (note > 0 && bgmVolume > 0.001) {
        audio.play({ type: 'square', frequency: note, endFrequency: note, duration: 0.13, volume: 0.06 * bgmVolume, attack: 0.01 }, at);
      }
      if (step % 2 === 0 && bass > 0 && bgmVolume > 0.001) {
        audio.play({ type: 'triangle', frequency: bass, endFrequency: bass * 0.98, duration: 0.22, volume: 0.08 * bgmVolume, attack: 0.01 }, at);
      }
      step++;
    }
  };

  return {
    start() {
      if (timer !== null) return;
      audio.resume();
      origin = audio.context?.currentTime ?? 0;
      step = 0;
      timer = window.setInterval(tick, 40);
    },
    stop() {
      if (timer === null) return;
      window.clearInterval(timer);
      timer = null;
    },
    running: () => timer !== null,
    setVolume(value: number) {
      bgmVolume = Math.max(0, Math.min(1, value));
    }
  };
}

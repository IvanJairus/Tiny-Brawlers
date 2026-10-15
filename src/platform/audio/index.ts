import { createAudioGraph, type AudioGraph } from './graph';
import { SFX } from './patches';
import { createBgm, type Bgm } from './bgm';
import type { SimEvent } from '../../sim/core/events';

export interface GameAudio {
  graph: AudioGraph;
  bgm: Bgm;
  cue(event: SimEvent): void;
  setEnabled(enabled: boolean): void;
  setMusic(enabled: boolean): void;
  dispose(): void;
}

const EVENT_TO_PATCH: Record<string, keyof typeof SFX> = {
  shot: 'shoot',
  explosion: 'explosion',
  pickup: 'pickup',
  place: 'place',
  throw: 'throw',
  build: 'build',
  heal: 'heal',
  damage: 'hit',
  knockout: 'knockout',
  revive: 'heal'
};

export function createGameAudio(): GameAudio {
  const graph = createAudioGraph();
  const bgm = createBgm(graph);
  let enabled = true;
  let musicEnabled = true;

  return {
    graph,
    bgm,
    cue(event: SimEvent): void {
      if (!enabled) return;
      const patchName = EVENT_TO_PATCH[event.kind];
      if (!patchName) return;
      const patch = patchName === 'shoot' && event.kind === 'shot' && event.weapon === 'shotgun' ? SFX.shotgun : SFX[patchName];
      graph.play(patch);
    },
    setEnabled(value: boolean): void {
      enabled = value;
      graph.setMaster(value ? 0.7 : 0);
      if (!value) bgm.stop();
    },
    setMusic(value: boolean): void {
      musicEnabled = value;
      if (!value) bgm.stop();
      else if (enabled) bgm.start();
    },
    dispose(): void {
      bgm.stop();
      graph.dispose();
    }
  };
}

export type { Bgm, AudioGraph };

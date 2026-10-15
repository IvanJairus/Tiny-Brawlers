import { createAudioGraph, type AudioGraph } from './graph';
import { SFX } from './patches';
import { createBgm, type Bgm } from './bgm';
import type { SimEvent } from '../../sim/core/events';

export interface GameAudio {
  graph: AudioGraph;
  bgm: Bgm;
  beginPlayback(): void;
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

export function createGameAudio(injected?: AudioGraph): GameAudio {
  const graph = injected ?? createAudioGraph();
  const bgm = createBgm(graph);
  let enabled = true;
  let musicEnabled = true;
  const recent = new Map<string, number>();

  return {
    graph,
    bgm,
    cue(event: SimEvent): void {
      if (!enabled) return;
      const patchName = EVENT_TO_PATCH[event.kind];
      if (!patchName) return;
      const at = 'at' in event ? event.at : null;
      if (at) {
        // One blast damages several buddies on the same tick; without this the
        // first hit would stack five identical cues in the same millisecond.
        const key = `${event.kind}:${Math.round(at.x)}:${Math.round(at.z)}`;
        const now = performance.now();
        const last = recent.get(key);
        if (last !== undefined && now - last < 40) return;
        recent.set(key, now);
        if (recent.size > 64) recent.clear();
      }
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
    },
    beginPlayback(): void {
      graph.resume();
      if (enabled && musicEnabled) bgm.start();
    },
    dispose(): void {
      bgm.stop();
      graph.dispose();
    }
  };
}

export type { Bgm, AudioGraph };

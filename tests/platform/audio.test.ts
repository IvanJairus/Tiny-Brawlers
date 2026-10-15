// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createGameAudio } from '../../src/platform/audio';
import { createAudioGraph, type ContextFactory } from '../../src/platform/audio/graph';
import { detectCapabilities, canPlayOffline, canPlayOnline } from '../../src/platform/browsercheck';
import { SFX } from '../../src/platform/audio/patches';
import type { SimEvent } from '../../src/sim/core/events';

interface FakeVoice {
  type: string;
  started: number;
  stopped: number;
  connect: () => void;
  disconnect: () => void;
  start: () => void;
  stop: () => void;
  frequency: { value: number; cancelScheduledValues: () => void; setValueAtTime: () => void; exponentialRampToValueAtTime: () => void };
}

function fakeContext(clock = { now: 0 }) {
  const voices: FakeVoice[] = [];
  const gain = () => ({
    gain: { value: 1, cancelScheduledValues() {}, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 },
    connect() { return this; }
  });
  const context = {
    currentTime: clock.now,
    state: 'running',
    destination: {},
    createGain: gain,
    createDynamicsCompressor: gain,
    createOscillator(): FakeVoice {
      const voice: FakeVoice = {
        type: 'sine', started: 0, stopped: 0,
        connect() {}, disconnect() {},
        start() { this.started++; }, stop() { this.stopped++; },
        frequency: { value: 0, cancelScheduledValues() {}, setValueAtTime() {}, exponentialRampToValueAtTime() {} }
      };
      voices.push(voice);
      return voice;
    },
    resume() {}, suspend() {}, close() {}
  };
  return { context, voices };
}

describe('audio graph', () => {
  it('creates no AudioContext until a gesture resumes it', () => {
    const factory = vi.fn<[], AudioContext | null>(() => null);
    const graph = createAudioGraph(factory as unknown as ContextFactory);
    graph.play(SFX.shoot);
    expect(graph.startedCues()).toBe(0);
  });

  it('pools voices instead of creating one per cue', () => {
    const { context, voices } = fakeContext();
    const graph = createAudioGraph((() => context) as unknown as ContextFactory);
    for (let i = 0; i < 60; i++) graph.play(SFX.hit, i * 0.5);
    expect(voices.length).toBeLessThanOrEqual(12);
    expect(graph.activeVoices()).toBeLessThanOrEqual(12);
  });

  it('drops cues beyond eight per second', () => {
    const { context, voices } = fakeContext();
    const graph = createAudioGraph((() => context) as unknown as ContextFactory);
    for (let i = 0; i < 40; i++) graph.play(SFX.hit, 0);
    expect(voices.length).toBeLessThanOrEqual(9);
  });

  it('ignores volume outside the usable range', () => {
    const { context } = fakeContext();
    const graph = createAudioGraph((() => context) as unknown as ContextFactory);
    graph.setMaster(5);
    graph.setMaster(-1);
    expect(() => graph.play(SFX.hit)).not.toThrow();
  });
});

describe('cue mapping', () => {
  it('deduplicates identical hits from one blast', () => {
    const { context, voices } = fakeContext();
    const graph = createAudioGraph((() => context) as unknown as ContextFactory);
    const audio = createGameAudio(graph);
    const event: SimEvent = { kind: 'damage', entity: 1, amount: 10, fromTeam: 'red', at: { x: 3.2, z: 4.1 } };
    for (let i = 0; i < 5; i++) audio.cue(event);
    expect(voices.length).toBe(1);

    audio.cue({ kind: 'damage', entity: 2, amount: 10, fromTeam: 'red', at: { x: 19.4, z: -7.9 } });
    expect(voices.length).toBe(2);
    audio.dispose();
  });

  it('maps known simulation events and ignores the rest', () => {
    const audio = createGameAudio();
    const playSpy = vi.spyOn(audio.graph, 'play');
    audio.cue({ kind: 'explosion', entity: 1, radius: 3, at: { x: 0, z: 0 } });
    expect(playSpy).toHaveBeenCalled();
    playSpy.mockClear();
    audio.cue({ kind: 'despawn', entity: 1 });
    expect(playSpy).not.toHaveBeenCalled();
    audio.dispose();
  });

  it('goes silent when sound is off', () => {
    const audio = createGameAudio();
    audio.setEnabled(false);
    const playSpy = vi.spyOn(audio.graph, 'play');
    audio.cue({ kind: 'explosion', entity: 1, radius: 3, at: { x: 1, z: 1 } });
    expect(playSpy).not.toHaveBeenCalled();
    audio.dispose();
  });
});

describe('capability detection', () => {
  function fakeWindow(overrides: Record<string, unknown>) {
    return {
      document: { createElement: () => ({ getContext: () => ({}) }) },
      matchMedia: () => ({ matches: false }),
      innerWidth: 800,
      innerHeight: 400,
      ...overrides
    } as unknown as Window;
  }

  it('reports a device that can play both modes', () => {
    const capabilities = detectCapabilities(fakeWindow({
      RTCPeerConnection: function RTCPeerConnection() {},
      RTCDataChannel: function RTCDataChannel() {}
    }));
    expect(capabilities.webgl).toBe(true);
    expect(capabilities.webrtc).toBe(true);
    expect(canPlayOffline(capabilities)).toBe(true);
    expect(canPlayOnline(capabilities)).toBe(true);
    expect(capabilities.missing).toEqual([]);
  });

  it('names what is missing when WebRTC is unavailable', () => {
    const capabilities = detectCapabilities(fakeWindow({}));
    expect(capabilities.webrtc).toBe(false);
    expect(canPlayOffline(capabilities)).toBe(true);
    expect(canPlayOnline(capabilities)).toBe(false);
    expect(capabilities.missing).toEqual(['webrtc']);
  });

  it('flags a device that cannot render at all', () => {
    const capabilities = detectCapabilities({
      document: { createElement: () => ({ getContext: () => null }) },
      matchMedia: () => ({ matches: false }),
      innerWidth: 400,
      innerHeight: 800
    } as unknown as Window);
    expect(capabilities.webgl).toBe(false);
    expect(canPlayOffline(capabilities)).toBe(false);
    expect(capabilities.portrait).toBe(true);
  });

  it('treats a throwing canvas as no WebGL', () => {
    const capabilities = detectCapabilities({
      document: { createElement: () => { throw new Error('blocked'); } },
      matchMedia: () => ({ matches: true }),
      innerWidth: 800,
      innerHeight: 400
    } as unknown as Window);
    expect(capabilities.webgl).toBe(false);
    expect(capabilities.coarsePointer).toBe(true);
  });
});

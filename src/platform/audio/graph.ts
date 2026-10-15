export interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  endsAt: number;
}

export interface AudioGraph {
  context: AudioContext | null;
  resume(): void;
  suspend(): void;
  setMaster(volume: number): void;
  play(patch: Patch, at?: number): void;
  dispose(): void;
}

export interface Patch {
  type: OscillatorType;
  frequency: number;
  endFrequency: number;
  duration: number;
  volume: number;
  attack: number;
  noise?: boolean;
  filter?: number;
}

const VOICE_LIMIT = 12;
const CUES_PER_SECOND = 8;

/**
 * Voices are pooled and reused. Creating an oscillator per hit is what turned the
 * previous audio module into a 580-line file that could stall the audio thread
 * during a firefight.
 */
export function createAudioGraph(): AudioGraph {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let limiter: DynamicsCompressorNode | null = null;
  const pool: Voice[] = [];
  let recent: number[] = [];
  let volume = 0.7;

  const ensure = (): AudioContext | null => {
    if (context) return context;
    try {
      context = new AudioContext({ latencyHint: 'interactive' });
      master = context.createGain();
      master.gain.value = volume;
      limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 8;
      limiter.ratio.value = 8;
      master.connect(limiter).connect(context.destination);
    } catch {
      context = null;
    }
    return context;
  };

  const steal = (now: number): Voice | null => {
    for (const voice of pool) if (voice.endsAt <= now) return voice;
    if (pool.length < VOICE_LIMIT) return null;
    const oldest = pool.reduce((a, b) => (a.endsAt < b.endsAt ? a : b));
    return oldest;
  };

  return {
    get context() { return context; },
    resume() {
      const ctx = ensure();
      if (ctx && ctx.state === 'suspended') void ctx.resume();
    },
    suspend() {
      if (context && context.state === 'running') void context.suspend();
    },
    setMaster(value: number) {
      volume = Math.max(0, Math.min(1, value));
      if (master) master.gain.value = volume;
    },
    play(patch: Patch, at?: number) {
      const ctx = ensure();
      if (!ctx || !master) return;
      const now = at ?? ctx.currentTime;
      recent = recent.filter((time) => now - time < 1);
      if (recent.length >= CUES_PER_SECOND) return;
      recent.push(now);

      const voice = steal(now);
      const osc = voice?.osc ?? ctx.createOscillator();
      const gain = voice?.gain ?? ctx.createGain();
      if (!voice) {
        gain.connect(master);
        pool.push({ osc, gain, endsAt: 0 });
      } else {
        try {
          osc.disconnect();
          osc.connect(gain);
        } catch {
          // A stopped oscillator cannot be reconnected; fall through to a new one.
        }
      }

      osc.type = patch.type;
      osc.frequency.cancelScheduledValues(now);
      osc.frequency.setValueAtTime(patch.frequency, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, patch.endFrequency), now + patch.duration);

      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001, patch.volume), now + patch.attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + patch.duration);

      try {
        osc.start(now);
        osc.stop(now + patch.duration + 0.02);
      } catch {
        // Already scheduled in this context; the pooled voice is reused next time.
      }
      const slot = pool[pool.length - 1];
      if (slot) slot.endsAt = now + patch.duration;
    },
    dispose() {
      for (const voice of pool) {
        try {
          voice.osc.stop();
        } catch {
          // Already finished.
        }
      }
      pool.length = 0;
      void context?.close();
      context = null;
    }
  };
}

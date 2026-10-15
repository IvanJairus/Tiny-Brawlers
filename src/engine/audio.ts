// Procedural Web Audio API sound synthesis & Chiptune BGM sequencer (0 external audio files)

export class SoundFx {
  private static ctx: AudioContext | null = null;
  private static masterGain: GainNode | null = null;
  private static bgmGain: GainNode | null = null;
  private static sfxGain: GainNode | null = null;

  private static _enabled: boolean = true;
  private static masterVolume: number = 1.0;
  private static bgmVolume: number = 0.35;
  private static sfxVolume: number = 0.8;

  // BGM Sequencer State
  private static bgmActive: boolean = false;
  private static schedulerTimer: number | null = null;
  private static nextNoteTime: number = 0;
  private static currentStep: number = 0;
  private static autoplayUnlocked: boolean = false;

  // Cached Audio Assets
  private static noiseBuffer: AudioBuffer | null = null;
  private static pulseWave25: PeriodicWave | null = null;
  private static activeVoices: { osc: OscillatorNode | AudioBufferSourceNode; gain: GainNode }[] = [];

  // Sequencer Constants
  private static readonly BPM = 136;
  private static readonly LOOKAHEAD_INTERVAL_MS = 25;
  private static readonly SCHEDULE_AHEAD_TIME = 0.12;
  private static readonly TOTAL_STEPS = 32;

  // Note Frequency Table (Hz)
  private static readonly NOTE_FREQS: Record<string, number> = {
    'C2': 65.41, 'D2': 73.42, 'Eb2': 77.78, 'F2': 87.31, 'G2': 98.00, 'Ab2': 103.83, 'Bb2': 116.54, 'B2': 123.47,
    'C3': 130.81, 'D3': 146.83, 'Eb3': 155.56, 'F3': 174.61, 'G3': 196.00, 'Ab3': 207.65, 'Bb3': 233.08,
    'C4': 261.63, 'D4': 293.66, 'Eb4': 311.13, 'F4': 349.23, 'G4': 392.00, 'Ab4': 415.30, 'Bb4': 466.16,
    'C5': 523.25, 'D5': 587.33, 'Eb5': 622.25, 'F5': 698.46, 'G5': 783.99, 'Ab5': 830.61, 'Bb5': 932.33,
    'C6': 1046.50, 'Eb6': 1244.51
  };

  // 32-Step Score: Voice 1 (Melodic Lead - 25% Pulse / Square)
  private static readonly LEAD_SCORE: (string | null)[] = [
    // Phrase A (0-15)
    'C5', null, 'Eb5', 'G5', 'Bb5', 'G5', 'Eb5', 'F5',
    'G5', null, 'F5', 'Eb5', 'D5', 'Eb5', 'D5', 'C5',
    // Phrase B (16-31)
    'C5', null, 'G5', 'C6', 'Bb5', 'G5', 'F5', 'G5',
    'Ab5', 'G5', 'F5', 'Eb5', 'D5', 'Bb4', 'D5', 'C5'
  ];

  // 32-Step Score: Voice 2 (Chiptune Walking Bassline - Triangle)
  private static readonly BASS_SCORE: (string | null)[] = [
    // Bar 1 (Cm)
    'C2', null, 'C3', null, 'C2', null, 'Eb2', 'G2',
    // Bar 2 (Fm / G)
    'F2', null, 'F2', null, 'G2', null, 'Bb2', null,
    // Bar 3 (Ab -> Bb)
    'Ab2', null, 'Ab2', null, 'Bb2', null, 'Bb2', null,
    // Bar 4 (G -> C turnaround)
    'G2', null, 'G2', null, 'D3', 'Eb3', 'D3', 'B2'
  ];

  // 32-Step Score: Voice 3 (Percussion: K=Kick, S=Snare, H=HiHat, O=OpenHat, F=SnareFill)
  private static readonly PERC_SCORE: (string | null)[] = [
    'K', null, 'H', null, 'S', null, 'H', null,
    'K', null, 'H', 'K', 'S', null, 'H', 'O',
    'K', null, 'H', null, 'S', null, 'H', null,
    'K', null, 'H', 'K', 'S', 'S', 'F', 'F'
  ];

  // ==========================================
  // Public Properties & Lifecycle
  // ==========================================

  public static get enabled(): boolean {
    return this._enabled;
  }

  public static set enabled(val: boolean) {
    this._enabled = val;
    this.updateGains();
  }

  public static toggleMute(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  public static setMasterVolume(vol: number): void {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    this.updateGains();
  }

  public static getMasterVolume(): number {
    return this.masterVolume;
  }

  public static setBGMVolume(vol: number): void {
    this.bgmVolume = Math.max(0, Math.min(1, vol));
    this.updateGains();
  }

  public static getBGMVolume(): number {
    return this.bgmVolume;
  }

  public static setSFXVolume(vol: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
    this.updateGains();
  }

  public static getSFXVolume(): number {
    return this.sfxVolume;
  }

  public static isBGMPlaying(): boolean {
    return this.bgmActive;
  }

  // ==========================================
  // Internal Context & Node Routing
  // ==========================================

  private static isSupported(): boolean {
    return typeof window !== 'undefined' && Boolean((window as any).AudioContext || (window as any).webkitAudioContext);
  }

  private static getContext(): AudioContext | null {
    if (!this.isSupported()) return null;

    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (AC) {
        this.ctx = new AC();
        this.initGainGraph(this.ctx);
        this.setupAutoplayUnlock();
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  private static initGainGraph(ctx: AudioContext): void {
    if (this.masterGain) return;

    // Master Gain
    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(this._enabled ? this.masterVolume : 0, ctx.currentTime);
    this.masterGain.connect(ctx.destination);

    // BGM Sub-gain
    this.bgmGain = ctx.createGain();
    this.bgmGain.gain.setValueAtTime(this.bgmVolume, ctx.currentTime);
    this.bgmGain.connect(this.masterGain);

    // SFX Sub-gain
    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.setValueAtTime(this.sfxVolume, ctx.currentTime);
    this.sfxGain.connect(this.masterGain);
  }

  private static updateGains(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.masterGain) {
      const targetMaster = this._enabled ? this.masterVolume : 0;
      this.masterGain.gain.setTargetAtTime(targetMaster, now, 0.02);
    }
    if (this.bgmGain) {
      this.bgmGain.gain.setTargetAtTime(this.bgmVolume, now, 0.02);
    }
    if (this.sfxGain) {
      this.sfxGain.gain.setTargetAtTime(this.sfxVolume, now, 0.02);
    }
  }

  private static setupAutoplayUnlock(): void {
    if (typeof window === 'undefined' || this.autoplayUnlocked) return;
    this.autoplayUnlocked = true;

    const unlock = () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => {
          if (this.bgmActive && this.schedulerTimer === null) {
            this.startChiptuneBGM();
          }
        }).catch(() => {});
      }
    };

    const opts = { once: true, passive: true };
    window.addEventListener('click', unlock, opts);
    window.addEventListener('keydown', unlock, opts);
    window.addEventListener('touchstart', unlock, opts);
    window.addEventListener('pointerdown', unlock, opts);
  }

  private static getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer || this.noiseBuffer.sampleRate !== ctx.sampleRate) {
      const bufferSize = ctx.sampleRate * 1.0; // 1 second loopable buffer
      this.noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    return this.noiseBuffer;
  }

  private static getPulseWave25(ctx: AudioContext): PeriodicWave | null {
    if (!this.pulseWave25 && typeof ctx.createPeriodicWave === 'function') {
      const harmonics = 64;
      const real = new Float32Array(harmonics);
      const imag = new Float32Array(harmonics);
      // 25% duty cycle pulse wave Fourier series
      for (let n = 1; n < harmonics; n++) {
        imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * 0.25);
      }
      try {
        this.pulseWave25 = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
      } catch {
        this.pulseWave25 = null;
      }
    }
    return this.pulseWave25;
  }

  // ==========================================
  // Procedural Chiptune Sequencer
  // ==========================================

  public static startChiptuneBGM(): void {
    if (!this.isSupported()) return;
    this.bgmActive = true;

    const ctx = this.getContext();
    if (!ctx) return;
    if (this.schedulerTimer !== null) return; // Already running

    this.nextNoteTime = ctx.currentTime + 0.05;
    this.currentStep = 0;

    this.schedulerTimer = window.setInterval(() => {
      this.schedulerTick();
    }, this.LOOKAHEAD_INTERVAL_MS);
  }

  public static stopChiptuneBGM(): void {
    this.bgmActive = false;
    if (this.schedulerTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this.stopActiveVoices();
    this.currentStep = 0;
  }

  private static stopActiveVoices(): void {
    for (const voice of this.activeVoices) {
      try {
        voice.osc.stop();
        voice.osc.disconnect();
        voice.gain.disconnect();
      } catch {}
    }
    this.activeVoices = [];
  }

  private static schedulerTick(): void {
    const ctx = this.ctx;
    if (!ctx || !this.bgmActive) return;

    // Wait until browser user gesture resumes audio context
    if (ctx.state === 'suspended') return;

    // Guard against desync if context resumed after delay
    if (this.nextNoteTime < ctx.currentTime) {
      this.nextNoteTime = ctx.currentTime + 0.02;
    }

    const secondsPer16th = (60.0 / this.BPM) / 4;

    while (this.nextNoteTime < ctx.currentTime + this.SCHEDULE_AHEAD_TIME) {
      this.scheduleStep(this.currentStep, this.nextNoteTime, secondsPer16th);
      this.nextNoteTime += secondsPer16th;
      this.currentStep = (this.currentStep + 1) % this.TOTAL_STEPS;
    }

    // Cleanup stopped voices
    this.activeVoices = this.activeVoices.filter((v) => {
      try {
        return true;
      } catch {
        return false;
      }
    });
  }

  private static scheduleStep(step: number, time: number, stepDuration: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.bgmGain) return;

    // 1. Voice 1: Melodic Lead (25% Pulse / Square)
    const leadNote = this.LEAD_SCORE[step];
    if (leadNote && this.NOTE_FREQS[leadNote]) {
      this.playChiptuneLead(leadNote, time, stepDuration * 0.85);
    }

    // 2. Voice 2: Bassline (Triangle)
    const bassNote = this.BASS_SCORE[step];
    if (bassNote && this.NOTE_FREQS[bassNote]) {
      this.playChiptuneBass(bassNote, time, stepDuration * 1.2);
    }

    // 3. Voice 3: Chiptune Percussion
    const percHit = this.PERC_SCORE[step];
    if (percHit) {
      this.playChiptunePerc(percHit, time);
    }
  }

  private static playChiptuneLead(note: string, time: number, duration: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const pulseWave = this.getPulseWave25(ctx);
    if (pulseWave) {
      osc.setPeriodicWave(pulseWave);
    } else {
      osc.type = 'square';
    }

    osc.frequency.setValueAtTime(this.NOTE_FREQS[note], time);

    // Tone shaping: lowpass filter for 8-bit warmth
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2800, time);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.10, time + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain!);

    osc.start(time);
    osc.stop(time + duration);

    const voiceEntry = { osc, gain };
    this.activeVoices.push(voiceEntry);
    osc.onended = () => {
      osc.disconnect();
      filter.disconnect();
      gain.disconnect();
      const idx = this.activeVoices.indexOf(voiceEntry);
      if (idx !== -1) this.activeVoices.splice(idx, 1);
    };
  }

  private static playChiptuneBass(note: string, time: number, duration: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(this.NOTE_FREQS[note], time);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.28, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

    osc.connect(gain);
    gain.connect(this.bgmGain!);

    osc.start(time);
    osc.stop(time + duration);

    const voiceEntry = { osc, gain };
    this.activeVoices.push(voiceEntry);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      const idx = this.activeVoices.indexOf(voiceEntry);
      if (idx !== -1) this.activeVoices.splice(idx, 1);
    };
  }

  private static playChiptunePerc(hit: string, time: number): void {
    const ctx = this.ctx!;
    const noiseBuffer = this.getNoiseBuffer(ctx);

    if (hit === 'K') {
      // Chiptune Kick: fast sine pitch drop
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, time);
      osc.frequency.exponentialRampToValueAtTime(38, time + 0.08);

      gain.gain.setValueAtTime(0.35, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

      osc.connect(gain);
      gain.connect(this.bgmGain!);
      osc.start(time);
      osc.stop(time + 0.08);

      const entry = { osc, gain };
      this.activeVoices.push(entry);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
        const idx = this.activeVoices.indexOf(entry);
        if (idx !== -1) this.activeVoices.splice(idx, 1);
      };
    } else if (hit === 'S' || hit === 'F') {
      // Chiptune Snare / Fill: Bandpass filtered noise burst + punch body
      const duration = hit === 'F' ? 0.06 : 0.10;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(hit === 'F' ? 2200 : 1800, time);
      filter.Q.setValueAtTime(1.8, time);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.24, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.bgmGain!);

      noise.start(time);
      noise.stop(time + duration);

      const entry = { osc: noise, gain };
      this.activeVoices.push(entry);
      noise.onended = () => {
        noise.disconnect();
        filter.disconnect();
        gain.disconnect();
        const idx = this.activeVoices.indexOf(entry);
        if (idx !== -1) this.activeVoices.splice(idx, 1);
      };
    } else if (hit === 'H' || hit === 'O') {
      // Chiptune Hi-Hat: Highpass filtered noise click
      const duration = hit === 'O' ? 0.12 : 0.035;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(hit === 'O' ? 6500 : 7500, time);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(hit === 'O' ? 0.15 : 0.12, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.bgmGain!);

      noise.start(time);
      noise.stop(time + duration);

      const entry = { osc: noise, gain };
      this.activeVoices.push(entry);
      noise.onended = () => {
        noise.disconnect();
        filter.disconnect();
        gain.disconnect();
        const idx = this.activeVoices.indexOf(entry);
        if (idx !== -1) this.activeVoices.splice(idx, 1);
      };
    }
  }

  // ==========================================
  // Preserved Combat & Interaction SFX
  // ==========================================

  // Cartoon pop when picking or dropping crate
  public static playPop(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(450, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
    osc.connect(gain);
    gain.connect(this.sfxGain ?? ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  // Gunshot (Pistol / Shotgun)
  public static playShoot(heavy: boolean = false): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const bufferSize = ctx.sampleRate * 0.12;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = heavy ? 'lowpass' : 'bandpass';
    filter.frequency.setValueAtTime(heavy ? 600 : 1800, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(heavy ? 0.45 : 0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain ?? ctx.destination);
    noise.start(now);
  }

  // Massive explosion (Bazooka / Grenade)
  public static playExplosion(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const duration = 0.6;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufferSize; i++) {
      last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04;
      data[i] = last * 4.0 * Math.exp(-i / (bufferSize * 0.4));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(260, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain ?? ctx.destination);
    noise.start(now);
  }

  // Healing chime
  public static playHeal(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
    osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
    osc.connect(gain);
    gain.connect(this.sfxGain ?? ctx.destination);
    osc.start(now);
    osc.stop(now + 0.28);
  }
}

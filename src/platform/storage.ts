import type { BuddyClass } from '../sim/domain/classes';
import type { BiomeKind } from '../sim/domain/obstacles';

export interface Settings {
  startClass: BuddyClass;
  sound: boolean;
  music: boolean;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  quality: 'high' | 'low';
  reducedMotion: boolean;
  biome: BiomeKind;
}

const KEY = 'tiny-brawlers:settings:v2';

const DEFAULTS: Settings = {
  startClass: 'fighter',
  sound: true,
  music: true,
  masterVolume: 0.7,
  musicVolume: 0.8,
  sfxVolume: 1.0,
  quality: 'high',
  reducedMotion: false,
  biome: 'rumput'
};

function clampVol(val: unknown, fallback: number): number {
  return typeof val === 'number' && Number.isFinite(val) ? Math.max(0, Math.min(1, val)) : fallback;
}

export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      startClass: parsed.startClass === 'healer' || parsed.startClass === 'constructor' ? parsed.startClass : 'fighter',
      sound: parsed.sound !== false,
      music: parsed.music !== false,
      masterVolume: clampVol(parsed.masterVolume, DEFAULTS.masterVolume),
      musicVolume: clampVol(parsed.musicVolume, DEFAULTS.musicVolume),
      sfxVolume: clampVol(parsed.sfxVolume, DEFAULTS.sfxVolume),
      quality: parsed.quality === 'low' ? 'low' : 'high',
      reducedMotion: parsed.reducedMotion === true,
      biome: parsed.biome === 'gurun' || parsed.biome === 'salju' ? parsed.biome : 'rumput'
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private mode or a full quota: the game keeps its defaults for this session.
  }
}

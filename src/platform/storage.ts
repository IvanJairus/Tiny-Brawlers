import type { BuddyClass } from '../sim/domain/classes';

export interface Settings {
  startClass: BuddyClass;
  sound: boolean;
  music: boolean;
  quality: 'high' | 'low';
  reducedMotion: boolean;
}

const KEY = 'tiny-brawlers:settings:v2';

const DEFAULTS: Settings = {
  startClass: 'fighter',
  sound: true,
  music: true,
  quality: 'high',
  reducedMotion: false
};

export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      startClass: parsed.startClass === 'healer' || parsed.startClass === 'constructor' ? parsed.startClass : 'fighter',
      sound: parsed.sound !== false,
      music: parsed.music !== false,
      quality: parsed.quality === 'low' ? 'low' : 'high',
      reducedMotion: parsed.reducedMotion === true
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

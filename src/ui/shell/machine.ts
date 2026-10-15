export type Screen =
  | 'booting' | 'unsupported' | 'title' | 'select' | 'lobby'
  | 'loading' | 'playing' | 'paused' | 'confirming' | 'results' | 'disconnected';

export type MachineEvent =
  | 'supported' | 'unsupported' | 'play' | 'confirmed' | 'lobbyReady' | 'netplay'
  | 'loaded' | 'pause' | 'resume' | 'leave' | 'stay' | 'finished' | 'quit' | 'again'
  | 'dropped' | 'recover';

const TRANSITIONS: Record<Screen, Partial<Record<MachineEvent, Screen>>> = {
  booting: { supported: 'title', unsupported: 'unsupported' },
  unsupported: {},
  title: { play: 'select', netplay: 'lobby' },
  select: { confirmed: 'loading', quit: 'title', lobbyReady: 'lobby', netplay: 'lobby' },
  lobby: { loaded: 'playing', quit: 'title', lobbyReady: 'lobby' },
  loading: { loaded: 'playing', dropped: 'disconnected' },
  playing: { pause: 'paused', leave: 'confirming', finished: 'results', dropped: 'disconnected' },
  paused: { resume: 'playing', quit: 'title' },
  confirming: { stay: 'playing', quit: 'title' },
  results: { again: 'select', quit: 'title' },
  disconnected: { recover: 'title', again: 'title' }
};

/** Only these screens let the simulation advance a tick. */
export const TICKING_SCREENS: ReadonlySet<Screen> = new Set<Screen>(['playing']);

export interface Machine {
  readonly screen: Screen;
  send(event: MachineEvent): Screen;
  can(event: MachineEvent): boolean;
  onChange(listener: (next: Screen, previous: Screen) => void): () => void;
}

export function createMachine(initial: Screen = 'booting'): Machine {
  let current = initial;
  document.body.dataset.screen = current;
  const listeners = new Set<(next: Screen, previous: Screen) => void>();

  return {
    get screen() { return current; },
    can(event) { return TRANSITIONS[current][event] !== undefined; },
    send(event) {
      const next = TRANSITIONS[current][event];
      if (!next) throw new Error(`screen "${current}" has no transition for "${event}"`);
      const previous = current;
      current = next;
      document.body.dataset.screen = next;
      for (const listener of listeners) listener(next, previous);
      return next;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

export function isTicking(screen: Screen): boolean {
  return TICKING_SCREENS.has(screen);
}

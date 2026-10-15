export type Screen =
  | 'booting' | 'unsupported' | 'title' | 'select' | 'lobby'
  | 'loading' | 'playing' | 'paused' | 'results' | 'disconnected';

export type MachineEvent =
  | 'supported' | 'unsupported' | 'play' | 'confirmed' | 'lobbyReady'
  | 'loaded' | 'pause' | 'resume' | 'finished' | 'quit' | 'again' | 'dropped' | 'recover';

const TRANSITIONS: Record<Screen, Partial<Record<MachineEvent, Screen>>> = {
  booting: { supported: 'title', unsupported: 'unsupported' },
  unsupported: {},
  title: { play: 'select' },
  select: { confirmed: 'loading', quit: 'title', lobbyReady: 'lobby' },
  lobby: { loaded: 'playing', quit: 'title' },
  loading: { loaded: 'playing', dropped: 'disconnected' },
  playing: { pause: 'paused', finished: 'results', dropped: 'disconnected' },
  paused: { resume: 'playing', quit: 'title' },
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

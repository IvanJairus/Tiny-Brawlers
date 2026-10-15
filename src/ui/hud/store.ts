import type { ViewState } from '../../sim/core/view';

export interface HudStore {
  set(view: ViewState): void;
  get(): ViewState | null;
  subscribe(listener: (view: ViewState) => void): () => void;
}

export function createHudStore(): HudStore {
  let current: ViewState | null = null;
  const listeners = new Set<(view: ViewState) => void>();

  return {
    set(view: ViewState) {
      current = view;
      for (const listener of listeners) listener(view);
    },
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      if (current) listener(current);
      return () => listeners.delete(listener);
    }
  };
}

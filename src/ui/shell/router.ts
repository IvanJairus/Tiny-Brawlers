import type { Screen } from './machine';
import type { MountedScreen, ScreenContext } from './screens';
import { mountNotice, mountPause, mountResults, mountSelect, mountTitle } from './screens';
import { mountLobby, type LobbyView } from './lobby';
import { T } from '../i18n/id';
import type { ViewState } from '../../sim/core/view';

export interface Router {
  show(screen: Screen, view: ViewState | null): void;
  update(view: ViewState): void;
  lobby(): LobbyView | null;
  dispose(): void;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function createRouter(host: HTMLElement, ctx: ScreenContext): Router {
  let mounted: { screen: Screen; instance: MountedScreen } | null = null;
  let lobbyView: LobbyView | null = null;
  let lastView: ViewState | null = null;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !mounted) return;
    if (mounted.screen === 'playing' && ctx.canPause()) ctx.send('pause');
    else if (mounted.screen === 'paused') ctx.send('resume');
  };

  const focusFirst = (root: HTMLElement): void => {
    const preferred = root.querySelector<HTMLElement>('[data-autofocus]');
    (preferred ?? root.querySelector<HTMLElement>(FOCUSABLE))?.focus();
  };

  const trapFocus = (root: HTMLElement): void => {
    const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  };

  window.addEventListener('keydown', onKeyDown);

  return {
    show(screen, view) {
      lastView = view ?? lastView;
      mounted?.instance.dispose();
      host.setAttribute('aria-hidden', screen === 'playing' ? 'true' : 'false');

      let instance: MountedScreen;
      switch (screen) {
        case 'title':
          instance = mountTitle(host, ctx);
          break;
        case 'select':
          instance = mountSelect(host, ctx);
          break;
        case 'paused':
          instance = mountPause(host, ctx);
          break;
        case 'results':
          instance = mountResults(host, ctx, lastView);
          break;
        case 'unsupported':
          instance = mountNotice(host, screen, T.unsupportedTitle, T.unsupportedBody, T.unsupportedHint, () => ctx.send('recover'));
          break;
        case 'disconnected':
          instance = mountNotice(host, screen, T.disconnectedTitle, T.disconnectedBody, '', () => ctx.send('recover'));
          break;
        case 'lobby':
          lobbyView = mountLobby(host, ctx, ctx.lobby);
          instance = { dispose: () => lobbyView?.dispose() };
          break;
        case 'playing':
        case 'loading':
        default:
          instance = { dispose: () => undefined };
          break;
      }

      mounted = { screen, instance };
      const root = host.lastElementChild as HTMLElement | null;
      if (root && screen !== 'playing') {
        focusFirst(root);
        trapFocus(root);
      }
    },
    update(view) {
      lastView = view;
      mounted?.instance.update?.(view);
    },
    lobby: () => lobbyView,
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      mounted?.instance.dispose();
    }
  };
}

export { FOCUSABLE };

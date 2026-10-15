// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRouter } from '../../src/ui/shell/router';
import type { ScreenContext } from '../../src/ui/shell/screens';
import type { LobbyActions } from '../../src/ui/shell/lobby';

function context(overrides: Partial<ScreenContext> = {}): ScreenContext {
  const lobby: LobbyActions = { host: vi.fn(), join: vi.fn(), start: vi.fn(), leave: vi.fn() };
  return {
    send: vi.fn(),
    startWith: vi.fn(),
    netplay: false,
    canPause: () => true,
    lobby,
    settings: { sound: true, music: true, quality: 'high', reducedMotion: false },
    setSetting: vi.fn(),
    ...overrides
  };
}

describe('router pause policy', () => {
  let host: HTMLElement;

  beforeEach(() => {
    document.body.dataset.screen = 'playing';
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('lets a solo player pause with Escape', () => {
    const ctx = context();
    const router = createRouter(host, ctx);
    router.show('playing', null);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ctx.send).toHaveBeenCalledWith('pause');
    router.dispose();
  });

  it('asks a networked player to leave instead of pausing, because the host cannot freeze others', () => {
    const ctx = context({ canPause: () => false });
    const router = createRouter(host, ctx);
    router.show('playing', null);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ctx.send).toHaveBeenCalledWith('leave');
    router.dispose();
  });

  it('always lets a paused player resume', () => {
    const ctx = context({ canPause: () => false });
    const router = createRouter(host, ctx);
    router.show('paused', null);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ctx.send).toHaveBeenCalledWith('resume');
    router.dispose();
  });

  it('offers staying as the safe answer and closes the leave dialog with Escape', () => {
    const ctx = context({ canPause: () => false });
    const router = createRouter(host, ctx);
    router.show('confirming', null);

    const labels = Array.from(host.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).toEqual(['Lanjut Main', 'Ya, Keluar']);
    expect(document.activeElement?.textContent).toBe('Lanjut Main');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ctx.send).toHaveBeenCalledWith('stay');
    router.dispose();
  });
});

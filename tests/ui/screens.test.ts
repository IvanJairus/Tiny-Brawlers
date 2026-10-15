// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { createRouter, type Router } from '../../src/ui/shell/router';
import type { ScreenContext } from '../../src/ui/shell/screens';
import type { LobbyActions } from '../../src/ui/shell/lobby';
import type { Screen } from '../../src/ui/shell/machine';

type Sent = string[];

function harness(): { host: HTMLElement; sent: Sent; router: Router } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const sent: Sent = [];
  const lobby: LobbyActions = { host: () => undefined, join: () => undefined, start: () => undefined, leave: () => undefined };
  const ctx: ScreenContext = {
    send: (event) => sent.push(event),
    startWith: () => undefined,
    netplay: false,
    canPause: () => true,
    lobby,
    settings: { sound: true, music: false, quality: 'high', reducedMotion: false },
    setSetting: () => undefined
  };
  return { host, sent, router: createRouter(host, ctx) };
}

function noticeTexts(host: HTMLElement) {
  const root = host.querySelector('.screen-modal') as HTMLElement;
  return {
    title: root?.querySelector('.screen-title, h1, h2')?.textContent?.trim() ?? '',
    body: root?.querySelector('.screen-body')?.textContent?.trim() ?? '',
    hint: root?.querySelector('.screen-hint')?.textContent?.trim() ?? '',
    button: root?.querySelector('button')?.textContent?.trim() ?? ''
  };
}

describe('notice screens', () => {
  let h: ReturnType<typeof harness>;

  beforeEach(() => {
    document.body.innerHTML = '';
    h = harness();
  });

  for (const screen of ['unsupported', 'disconnected'] as Screen[]) {
    it(`${screen} names the cause and the next action`, () => {
      h.router.show(screen, null);
      const copy = noticeTexts(h.host);
      expect(copy.title.length).toBeGreaterThan(2);
      expect(copy.body.length, `${screen} must explain what happened`).toBeGreaterThan(25);
      expect(copy.hint, `${screen} must say what to do next`).not.toBe('');
      expect(copy.button).not.toBe('');

      h.host.querySelector('button')!.click();
      expect(h.sent).toEqual(['recover']);
    });
  }

  it('leaves no previous screen behind when it replaces it', () => {
    h.router.show('unsupported', null);
    h.router.show('disconnected', null);
    expect(h.host.querySelectorAll('.screen-modal')).toHaveLength(1);
    expect(noticeTexts(h.host).title).toMatch(/Terputus/i);
  });
});

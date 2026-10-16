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

describe('title screen and arcade UI upgrade', () => {
  let h: ReturnType<typeof harness>;

  beforeEach(() => {
    document.body.innerHTML = '';
    h = harness();
  });

  it('renders title screen with hero banner mascots and tutorial button', () => {
    h.router.show('title', null);
    const mascots = h.host.querySelectorAll('.hero-mascot');
    expect(mascots.length).toBe(4);
    expect(mascots[0].getAttribute('src')).toBe('assets/karakter/bola_luncur_depan.svg');
    expect(mascots[1].getAttribute('src')).toBe('assets/karakter/tupai_gudang_depan.svg');
    expect(mascots[2].getAttribute('src')).toBe('assets/karakter/kacang_radar_depan.svg');
    expect(mascots[3].getAttribute('src')).toBe('assets/karakter/biskuit_karamel_depan.svg');

    const tutBtn = h.host.querySelector('.btn-tutorial') as HTMLButtonElement;
    expect(tutBtn).toBeTruthy();
    expect(tutBtn.getAttribute('tabindex')).toBe('-1');
    expect(tutBtn.textContent).toContain('Panduan');

    tutBtn.click();
    const overlay = document.querySelector('.tutorial-overlay');
    expect(overlay).toBeTruthy();
    expect(overlay?.querySelector('.tutorial-title')?.textContent).toContain('Panduan Main');
    (overlay?.querySelector('.btn-close-tutorial') as HTMLButtonElement)?.click();
    expect(document.querySelector('.tutorial-overlay')).toBeNull();
  });

  it('renders select screen with mascot portraits, biome thumbnails, and tutorial button', () => {
    h.router.show('select', null);
    const classCards = h.host.querySelectorAll('.class-card');
    expect(classCards.length).toBe(3);

    const firstMascot = classCards[0].querySelector('.class-mascot');
    expect(firstMascot?.getAttribute('src')).toBe('assets/karakter/bola_luncur_depan.svg');

    const biomeThumbs = h.host.querySelectorAll('.biome-thumb');
    expect(biomeThumbs.length).toBe(3);
    expect(biomeThumbs[0].getAttribute('src')).toBe('assets/peta-contoh-rumput.png');
    expect(biomeThumbs[1].getAttribute('src')).toBe('assets/png/gurun_3.png');
    expect(biomeThumbs[2].getAttribute('src')).toBe('assets/peta-contoh-salju.png');

    const tutBtn = h.host.querySelector('.btn-tutorial') as HTMLButtonElement;
    expect(tutBtn).toBeTruthy();
    expect(tutBtn.getAttribute('tabindex')).toBe('-1');
  });

  it('renders results ribbon according to match outcome', () => {
    const mockViewWon = {
      tick: 1, clock: 3, over: true, winner: 'red' as const, localPlayer: 1,
      hp: 100, maxHp: 130, weapon: 'pistol' as const, carrying: false, team: 'red' as const,
      cls: 'fighter' as const, ammo: { grenades: 0, rockets: 0, medkits: 0 },
      bunkerHp: { red: 1000, blue: 0, yellow: 0, cyan: 0 },
      alive: { red: 3, blue: 0, yellow: 0, cyan: 0 },
      eliminated: { red: false, blue: true, yellow: true, cyan: true },
      pad: { title: 'Pad', category: 'weapon' as const, dps: 0, description: '', total: 0, slots: [false,false,false,false,false,false,false,false], buildable: false, nearPad: false },
      cratesOnField: 0, tanks: 0, stats: { built: 1, knockouts: 2, cratesDelivered: 3, survived: 40 }
    };

    h.router.show('results', mockViewWon);
    const winRibbon = h.host.querySelector('.results-ribbon') as HTMLImageElement;
    expect(winRibbon).toBeTruthy();
    expect(winRibbon.getAttribute('src')).toBe('assets/ui/pita_menang.svg');

    const mockViewLost = { ...mockViewWon, winner: 'blue' as const };
    h.router.show('results', mockViewLost);
    const loseRibbon = h.host.querySelector('.results-ribbon') as HTMLImageElement;
    expect(loseRibbon).toBeTruthy();
    expect(loseRibbon.getAttribute('src')).toBe('assets/ui/pita_kalah.svg');
  });
});

describe('tutorial modal and recipe book', () => {
  let h: ReturnType<typeof harness>;

  beforeEach(() => {
    document.body.innerHTML = '';
    h = harness();
  });

  it('renders 3 tabs and 8 recipes in recipe book', async () => {
    const { openTutorialModal } = await import('../../src/ui/shell/screens');
    const modal = openTutorialModal(h.host);
    expect(modal).toBeTruthy();

    const tabs = modal.querySelectorAll('.tutorial-tab');
    expect(tabs.length).toBe(3);

    const recipeCards = modal.querySelectorAll('.recipe-card');
    expect(recipeCards.length).toBe(8);

    const firstRecipe = recipeCards[0];
    expect(firstRecipe.querySelector('.recipe-stack-img')?.getAttribute('src')).toBe('assets/tumpukan/tumpukan_resep_pistol.svg');
    expect(firstRecipe.querySelector('.recipe-icon-img')?.getAttribute('src')).toBe('assets/senjata/pistol.svg');
    expect(firstRecipe.textContent).toContain('Pistol Standard');

    const tankRecipe = recipeCards[7];
    expect(tankRecipe.querySelector('.recipe-stack-img')?.getAttribute('src')).toBe('assets/tumpukan/tumpukan_resep_tank.svg');
    expect(tankRecipe.querySelector('.recipe-icon-img')?.getAttribute('src')).toBe('assets/kendaraan/tank_merah_samping.svg');
    expect(tankRecipe.textContent).toContain('Tank Lapis Baja');

    // Tab switching test
    const tabRecipesBtn = tabs[1] as HTMLButtonElement;
    tabRecipesBtn.click();
    expect(tabRecipesBtn.classList.contains('is-active')).toBe(true);
    expect(modal.querySelector('.panel-recipes')?.classList.contains('is-active')).toBe(true);
    expect(modal.querySelector('.panel-controls')?.classList.contains('is-active')).toBe(false);

    // Arena tab test
    const tabArenaBtn = tabs[2] as HTMLButtonElement;
    tabArenaBtn.click();
    expect(modal.querySelector('.panel-arena')?.classList.contains('is-active')).toBe(true);
    const arenaCards = modal.querySelectorAll('.arena-card');
    expect(arenaCards.length).toBe(7); // 2 obstacles + 5 powerups

    // Toggle close test
    openTutorialModal(h.host);
    expect(document.querySelector('.tutorial-overlay')).toBeNull();
  });
});


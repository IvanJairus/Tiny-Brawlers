// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { buildHud } from '../../src/ui/hud/bind';
import { createHudStore } from '../../src/ui/hud/store';
import type { ViewState } from '../../src/sim/core/view';

function view(overrides: Partial<ViewState> = {}): ViewState {
  return {
    tick: 1,
    clock: 3,
    over: false,
    winner: null,
    localPlayer: 1,
    hp: 100,
    maxHp: 130,
    weapon: 'pistol',
    carrying: false,
    team: 'red',
    cls: 'fighter',
    ammo: { grenades: 0, rockets: 0, medkits: 0 },
    bunkerHp: { red: 1000, blue: 780, yellow: 40, cyan: 0 },
    alive: { red: 3, blue: 2, yellow: 1, cyan: 0 },
    eliminated: { red: false, blue: false, yellow: false, cyan: true },
    pad: {
      title: 'Shotgun Penghancur',
      category: 'weapon',
      dps: 220,
      description: 'Sebaran lima peluru',
      total: 2,
      slots: [true, true, false, false, false, false, false, false],
      buildable: true,
      nearPad: true
    },
    cratesOnField: 4,
    tanks: 0,
    stats: { built: 2, knockouts: 1, cratesDelivered: 5, survived: 3 },
    ...overrides
  };
}

describe('hud bindings', () => {
  it('shows hp, weapon, bunker line and pad state', () => {
    const hud = buildHud(document);
    document.body.appendChild(hud.root);
    hud.update(view());

    const text = hud.root.textContent ?? '';
    expect(text).toContain('100 / 130');
    expect(text).toContain('pistol');
    expect(text).toContain('Merah');
    expect(text).toContain('780');
    expect(text).toContain('Shotgun Penghancur');

    const fill = hud.root.querySelector('[data-part="hpFill"]') as HTMLElement;
    expect(fill.style.width).toBe('76.9%');
    hud.dispose();
  });

  it('hides the pad card until the player is near it', () => {
    const hud = buildHud(document);
    hud.update(view({ pad: { ...view().pad, nearPad: false } }));
    const card = hud.root.querySelector('[data-part="padCard"]') as HTMLElement;
    expect(card.classList.contains('is-hidden')).toBe(true);
    hud.update(view({ pad: { ...view().pad, nearPad: true } }));
    expect(card.classList.contains('is-hidden')).toBe(false);
    hud.dispose();
  });

  it('never queries the DOM while updating', () => {
    const hud = buildHud(document);
    const spy = vi.spyOn(Element.prototype, 'querySelector');
    const allSpy = vi.spyOn(Element.prototype, 'querySelectorAll');
    hud.update(view());
    hud.update(view({ hp: 99 }));
    hud.update(view({ hp: 98 }));
    expect(spy).not.toHaveBeenCalled();
    expect(allSpy).not.toHaveBeenCalled();
    spy.mockRestore();
    allSpy.mockRestore();
    hud.dispose();
  });

  it('skips writes when the value did not change', () => {
    const hud = buildHud(document);
    hud.update(view({ hp: 80 }));
    const afterFirst = hud.writes();
    hud.update(view({ hp: 80 }));
    hud.update(view({ hp: 80 }));
    expect(hud.writes()).toBe(afterFirst);
    hud.update(view({ hp: 79 }));
    expect(hud.writes()).toBe(afterFirst + 1);
    hud.dispose();
  });

  it('routes button presses to actions', () => {
    const hud = buildHud(document);
    document.body.appendChild(hud.root);
    const calls: string[] = [];
    hud.onAction('grab', () => calls.push('grab'));
    hud.onAction('shoot', () => calls.push('shoot'));
    const button = hud.root.querySelector('[data-action="grab"]') as HTMLElement;
    button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(calls).toEqual(['grab']);
    hud.dispose();
  });

  it('routes zoom taps and names them for assistive tech', () => {
    const hud = buildHud(document);
    document.body.appendChild(hud.root);
    const calls: string[] = [];
    hud.onAction('zoomIn', () => calls.push('in'));
    hud.onAction('zoomOut', () => calls.push('out'));
    (hud.root.querySelector('[data-action="zoomIn"]') as HTMLElement)
      .dispatchEvent(new Event('pointerdown', { bubbles: true }));
    (hud.root.querySelector('[data-action="zoomOut"]') as HTMLElement)
      .dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(calls).toEqual(['in', 'out']);
    expect(hud.root.querySelector('[data-action="zoomIn"]')?.getAttribute('aria-label')).toBe('Dekatkan kamera');
    expect(hud.root.querySelector('[data-action="zoomOut"]')?.getAttribute('aria-label')).toBe('Jauhkan kamera');
    hud.dispose();
  });

  it('publishes a view through the store to subscribers', () => {
    const store = createHudStore();
    const seen: number[] = [];
    const off = store.subscribe((v) => seen.push(v.hp));
    store.set(view({ hp: 70 }));
    store.set(view({ hp: 60 }));
    off();
    store.set(view({ hp: 50 }));
    expect(seen).toEqual([70, 60]);
  });
});

describe('screen reader announcements', () => {
  const announceText = (hud: ReturnType<typeof buildHud>): string =>
    hud.root.querySelector('[data-part="announce"]')!.textContent ?? '';

  function mounted(): { hud: ReturnType<typeof buildHud>; announce: (v: Partial<ViewState>) => void } {
    const doc = window.document;
    const hud = buildHud(doc);
    hud.update(view());
    return {
      hud,
      announce: (overrides) => hud.update(view(overrides))
    };
  }

  it('mounts as a quiet polite region and says nothing on the first frame', () => {
    const doc = window.document;
    const hud = buildHud(doc);
    const region = hud.root.querySelector('[data-part="announce"]') as HTMLElement;
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-atomic')).toBe('true');
    hud.update(view());
    expect(region.textContent).toBe('');
    hud.dispose();
  });

  it('announces only when health crosses a quarter', () => {
    const { hud, announce } = mounted();
    announce({ hp: 98 });
    expect(announceText(hud)).toBe('');
    announce({ hp: 60 });
    expect(announceText(hud)).toBe('HP tinggal 46 persen');
    announce({ hp: 55 });
    expect(announceText(hud)).toBe('HP tinggal 46 persen');
    hud.dispose();
  });

  it('announces picking up a crate and the squad going under', () => {
    const { hud, announce } = mounted();
    announce({ carrying: true });
    expect(announceText(hud)).toBe('Membawa peti');
    announce({ carrying: false, alive: { red: 0, blue: 2, yellow: 1, cyan: 0 } });
    expect(announceText(hud)).toBe('Semua kawan tumbang');
    hud.dispose();
  });

  it('names the winner once the match is over', () => {
    const { hud, announce } = mounted();
    announce({ over: true, winner: 'cyan' });
    expect(announceText(hud)).toBe('Pemenang: Sian');
    announce({ over: true, winner: 'cyan', hp: 100 });
    expect(announceText(hud)).toBe('Pemenang: Sian');
    hud.dispose();
  });
});

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

import type { ViewState } from '../../sim/core/view';
import { TEAM_COLORS, TEAM_IDS, type TeamId } from '../../sim/domain/teams';
import { T } from '../i18n/id';

export type HudAction = 'grab' | 'shoot' | 'build' | 'pause' | 'restart' | 'menu';

export interface HudBindings {
  root: HTMLElement;
  update(view: ViewState): void;
  onAction(action: HudAction, handler: () => void): () => void;
  setVisible(visible: boolean): void;
  writes(): number;
  dispose(): void;
}

const HUD_TEMPLATE = `
<div class="hud-top">
  <section class="card card-player" data-part="playerCard">
    <header><span data-part="teamName" class="team-name"></span><span data-part="clsName" class="cls-name"></span></header>
    <div class="bar"><div class="bar-fill" data-part="hpFill"></div></div>
    <footer><span data-part="hpText"></span><span data-part="weaponText"></span></footer>
  </section>
  <section class="card card-scoreboard" data-part="scoreboard"></section>
  <section class="card card-pad" data-part="padCard">
    <div class="pad-head"><span data-part="padTitle"></span><span class="pill" data-part="padCategory"></span></div>
    <div class="pad-slots" data-part="padSlots"></div>
    <div class="pad-foot"><span data-part="padDps"></span><span data-part="padTotal"></span></div>
    <button class="btn btn-build" data-action="build" type="button"></button>
  </section>
</div>
<div class="hud-bottom">
  <div class="stick-zone" data-part="stickZone"><div class="stick-ring" data-part="stickRing"><div class="stick-knob" data-part="stickKnob"></div></div></div>
  <div class="action-cluster">
    <button class="btn btn-round btn-grab" data-action="grab" type="button"><span data-part="grabLabel"></span></button>
    <button class="btn btn-round btn-shoot" data-action="shoot" type="button"><span data-part="shootLabel"></span></button>
    <button class="btn btn-icon" data-action="pause" type="button" aria-label="Jeda">II</button>
  </div>
</div>
<p class="sr-only" data-part="announce" aria-live="polite" aria-atomic="true"></p>
`;

interface Nodes {
  [key: string]: HTMLElement;
}

function resolve(root: HTMLElement): Nodes {
  const nodes: Nodes = {};
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-part]'))) {
    const key = el.dataset.part;
    if (key) nodes[key] = el;
  }
  return nodes;
}

export function buildHud(doc: Document): HudBindings {
  const root = doc.createElement('div');
  root.className = 'hud';
  root.innerHTML = HUD_TEMPLATE;

  const nodes = resolve(root);
  const scoreboard = nodes.scoreboard;
  const pills: Record<TeamId, { value: HTMLElement; fill: HTMLElement; bar: HTMLElement }> = {} as never;
  for (const team of TEAM_IDS) {
    const el = doc.createElement('div');
    el.className = 'pill-team';
    el.style.setProperty('--team', TEAM_COLORS[team].css);
    el.innerHTML = `<span class="pill-name"></span><div class="bar bar-thin"><div class="bar-fill"></div></div><span class="pill-value"></span>`;
    scoreboard.appendChild(el);
    const value = el.querySelector('.pill-value') as HTMLElement;
    const fill = el.querySelector('.bar-fill') as HTMLElement;
    pills[team] = { value, fill, bar: el };
    el.querySelector('.pill-name')!.textContent = TEAM_COLORS[team].label;
  }

  const buildButton = root.querySelector<HTMLElement>('[data-action="build"]') as HTMLButtonElement;
  const slotEls: HTMLElement[] = [];
  for (let i = 0; i < 8; i++) {
    const slot = doc.createElement('span');
    slot.className = 'slot';
    nodes.padSlots.appendChild(slot);
    slotEls.push(slot);
  }

  const cache: Record<string, string | number | boolean> = {};
  let writeCount = 0;
  const write = (key: string, value: string | number | boolean, apply: () => void): void => {
    if (cache[key] === value) return;
    cache[key] = value;
    writeCount++;
    apply();
  };

  let band = 0;
  let carried = false;
  let squadAlive = 0;
  let primed = false;
  let announcedResult = false;
  const announce = (text: string): void => { nodes.announce.textContent = text; };

  nodes.grabLabel.textContent = T.grab;
  nodes.shootLabel.textContent = T.shoot;
  nodes.padCard.classList.add('is-hidden');

  const listeners = new Map<HudAction, Set<() => void>>();
  const onClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLElement>('[data-action]');
    const action = button?.dataset.action as HudAction | undefined;
    if (!action) return;
    event.preventDefault();
    for (const handler of listeners.get(action) ?? []) handler();
  };
  root.addEventListener('pointerdown', onClick);

  return {
    root,
    writes: () => writeCount,
    setVisible(visible: boolean) {
      root.classList.toggle('is-hidden', !visible);
    },
    onAction(action: HudAction, handler: () => void) {
      if (!listeners.has(action)) listeners.set(action, new Set());
      listeners.get(action)!.add(handler);
      return () => listeners.get(action)?.delete(handler);
    },
    update(view: ViewState) {
      const hpRatio = view.maxHp > 0 ? Math.max(0, Math.min(1, view.hp / view.maxHp)) : 0;
      write('team', view.team, () => {
        nodes.teamName.textContent = `${T.teamLabel} ${TEAM_COLORS[view.team].label}`;
        nodes.teamName.style.setProperty('--team', TEAM_COLORS[view.team].css);
      });
      write('cls', view.cls, () => {
        nodes.clsName.textContent = T.classNames[view.cls as keyof typeof T.classNames] ?? view.cls;
      });
      write('hp', Math.round(view.hp), () => {
        nodes.hpText.textContent = `${Math.round(view.hp)} / ${view.maxHp} ${T.hpLabel}`;
        nodes.hpFill.style.width = `${(hpRatio * 100).toFixed(1)}%`;
        nodes.hpFill.classList.toggle('is-low', hpRatio < 0.3);
      });
      write('weapon', `${view.weapon}${view.carrying ? ':peti' : ''}`, () => {
        if (view.carrying) {
          nodes.weaponText.textContent = 'Membawa peti';
        } else if (view.weapon === 'none') {
          nodes.weaponText.textContent = 'Tangan kosong';
        } else {
          const ammo =
            view.weapon === 'grenade' ? ` x${view.ammo.grenades}`
              : view.weapon === 'bazooka' ? ` x${view.ammo.rockets}`
                : view.weapon === 'medic' ? ` x${view.ammo.medkits}` : '';
          nodes.weaponText.textContent = `${view.weapon}${ammo}`;
        }
      });

      for (const team of TEAM_IDS) {
        const hp = Math.round(view.bunkerHp[team]);
        write(`bunker-${team}`, hp, () => {
          pills[team].value.textContent = String(hp);
          pills[team].fill.style.width = `${(Math.max(0, hp) / 1000) * 100}%`;
          pills[team].bar.classList.toggle('is-out', view.eliminated[team]);
        });
      }

      const showPad = view.pad.nearPad;
      write('padVisible', showPad, () => nodes.padCard.classList.toggle('is-hidden', !showPad));
      if (showPad) {
        write('padTitle', view.pad.title, () => { nodes.padTitle.textContent = view.pad.title; });
        write('padCategory', view.pad.category, () => { nodes.padCategory.textContent = view.pad.category; });
        write('padDps', view.pad.dps, () => { nodes.padDps.textContent = `${view.pad.dps} DPS`; });
        write('padTotal', view.pad.total, () => { nodes.padTotal.textContent = `${view.pad.total}/8 ${T.cratesLabel}`; });
        write('padBuild', view.pad.buildable, () => {
          buildButton.disabled = !view.pad.buildable;
          buildButton.textContent = view.pad.buildable ? T.build : T.buildNeedPad;
        });
        for (let i = 0; i < 8; i++) {
          write(`slot${i}`, view.pad.slots[i], () => slotEls[i].classList.toggle('is-filled', view.pad.slots[i]));
        }
      }

      const nextBand = Math.ceil(hpRatio * 4);
      const nextAlive = view.alive[view.team];
      if (!primed) {
        primed = true;
        band = nextBand;
        carried = view.carrying;
        squadAlive = nextAlive;
      } else {
        if (nextBand < band) announce(`${T.sayHpPrefix} ${Math.round(hpRatio * 100)} ${T.sayPercent}`);
        if (view.carrying !== carried) announce(view.carrying ? T.sayCarrying : T.sayEmptyHanded);
        if (nextAlive === 0 && squadAlive > 0) announce(T.sayTeamWiped);
        if (view.over && !announcedResult) {
          announcedResult = true;
          announce(view.winner ? `${T.sayWinner}: ${TEAM_COLORS[view.winner].label}` : T.sayDraw);
        }
        band = nextBand;
        carried = view.carrying;
        squadAlive = nextAlive;
      }
    },
    dispose() {
      root.removeEventListener('pointerdown', onClick);
      root.remove();
    }
  };
}

import { T } from '../i18n/id';
import type { BuddyClass } from '../../sim/domain/classes';
import { TEAM_COLORS } from '../../sim/domain/teams';
import type { ViewState } from '../../sim/core/view';
import type { Screen } from './machine';
import type { LobbyActions } from './lobby';
import type { BiomeKind } from '../../sim/domain/obstacles';

export interface ScreenContext {
  send: (event: Parameters<import('./machine').Machine['send']>[0]) => void;
  startWith: (cls: BuddyClass, biome?: BiomeKind) => void;
  netplay: boolean;
  canPause(): boolean;
  lobby: LobbyActions;
  settings: { sound: boolean; music: boolean; quality: 'high' | 'low'; reducedMotion: boolean; biome?: BiomeKind };
  setSetting: (key: 'sound' | 'music' | 'quality' | 'reducedMotion' | 'biome', value: boolean | string) => void;
}

export interface MountedScreen {
  update?(view: ViewState): void;
  dispose(): void;
}

function shell(className: string, heading: string | null, body: string): HTMLElement {
  const root = document.createElement('div');
  root.className = `screen ${className}`;
  if (heading) {
    const title = document.createElement('h1');
    title.className = 'screen-title';
    title.textContent = heading;
    root.appendChild(title);
  }
  if (body) {
    const text = document.createElement('p');
    text.className = 'screen-body';
    text.textContent = body;
    root.appendChild(text);
  }
  return root;
}

function button(label: string, kind: string, onClick: () => void, autofocus = false): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `btn btn-${kind}`;
  el.textContent = label;
  el.addEventListener('click', onClick);
  if (autofocus) el.dataset.autofocus = '1';
  return el;
}

export function mountTitle(host: HTMLElement, ctx: ScreenContext): MountedScreen {
  const root = shell('screen-title-page', T.appTitle, T.tagline);
  const actions = document.createElement('div');
  actions.className = 'screen-actions';
  actions.appendChild(button(T.play, 'primary', () => ctx.send('play'), true));
  if (ctx.netplay) actions.appendChild(button(T.netTitle, 'ghost', () => ctx.send('netplay')));
  root.appendChild(actions);
  host.appendChild(root);
  return { dispose: () => root.remove() };
}

export function mountSelect(host: HTMLElement, ctx: ScreenContext): MountedScreen {
  const root = shell('screen-select', T.pickClass, '');
  const list = document.createElement('div');
  list.className = 'class-list';
  const classes: BuddyClass[] = ['fighter', 'healer', 'constructor'];
  let chosen: BuddyClass = 'fighter';
  let chosenBiome: BiomeKind = ctx.settings.biome ?? 'rumput';

  const buttons = classes.map((cls, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'class-card';
    card.dataset.class = cls;
    card.innerHTML =
      `<span class="class-name"></span><span class="class-blurb"></span><span class="class-stats"></span>`;
    card.querySelector('.class-name')!.textContent = `${index + 1}. ${T.classNames[cls]}`;
    card.querySelector('.class-blurb')!.textContent = T.classBlurb[cls];
    card.querySelector('.class-stats')!.textContent = T.classStatsLine[cls];
    card.addEventListener('click', () => {
      chosen = cls;
      for (const other of buttons) other.classList.toggle('is-chosen', other === card);
    });
    if (index === 0) card.classList.add('is-chosen');
    list.appendChild(card);
    return card;
  });
  root.appendChild(list);

  const biomeBar = document.createElement('div');
  biomeBar.className = 'biome-bar';
  const biomes: BiomeKind[] = ['rumput', 'gurun', 'salju'];
  const biomeChips = biomes.map((b) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'biome-chip';
    chip.setAttribute('tabindex', '-1');
    if (b === chosenBiome) chip.classList.add('is-chosen');
    chip.innerHTML = `<img src="assets/arena/png/${b}_3.png" alt="" class="biome-thumb" /><span>${T.biomeNames[b]}</span>`;
    chip.addEventListener('click', () => {
      chosenBiome = b;
      for (const other of biomeChips) other.classList.toggle('is-chosen', other === chip);
    });
    biomeBar.appendChild(chip);
    return chip;
  });
  root.appendChild(biomeBar);

  const actions = document.createElement('div');
  actions.className = 'screen-actions';
  actions.appendChild(button(T.back, 'ghost', () => ctx.send('quit')));
  actions.appendChild(button(T.play, 'primary', () => ctx.startWith(chosen, chosenBiome), true));
  if (ctx.netplay) actions.appendChild(button(T.netTitle, 'ghost', () => ctx.send('netplay')));
  root.appendChild(actions);
  host.appendChild(root);
  return { dispose: () => root.remove() };
}

export function mountPause(host: HTMLElement, ctx: ScreenContext): MountedScreen {
  const root = shell('screen-modal screen-pause', T.pause, '');
  const actions = document.createElement('div');
  actions.className = 'screen-actions';
  actions.appendChild(button(T.resume, 'primary', () => ctx.send('resume'), true));
  actions.appendChild(button(T.settings, 'ghost', () => settingsHost.replaceChildren(settingsPanel(ctx))));
  actions.appendChild(button(T.quit, 'ghost', () => ctx.send('quit')));
  root.appendChild(actions);
  const settingsHost = document.createElement('div');
  settingsHost.className = 'settings-host';
  root.appendChild(settingsHost);
  host.appendChild(root);
  return { dispose: () => root.remove() };
}

/** Netplay has no pause, so leaving needs an explicit confirmation instead. */
export function mountConfirm(host: HTMLElement, ctx: ScreenContext): MountedScreen {
  const root = shell('screen-modal screen-confirming', T.leaveTitle, T.leaveBody);
  const actions = document.createElement('div');
  actions.className = 'screen-actions';
  actions.appendChild(button(T.leaveNo, 'primary', () => ctx.send('stay'), true));
  actions.appendChild(button(T.leaveYes, 'ghost', () => ctx.send('quit')));
  root.appendChild(actions);
  host.appendChild(root);
  return { dispose: () => root.remove() };
}

function settingsPanel(ctx: ScreenContext): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'settings-panel';

  const row = (label: string, value: string, onToggle: () => void): void => {
    const line = document.createElement('div');
    line.className = 'setting-row';
    const name = document.createElement('span');
    name.textContent = label;
    const btn = button(value, 'ghost', () => {
      onToggle();
      name.textContent = label;
    });
    btn.dataset.role = 'setting';
    line.append(name, btn);
    wrap.appendChild(line);
  };

  row(T.sound, ctx.settings.sound ? T.soundOn : T.soundOff, () => ctx.setSetting('sound', !ctx.settings.sound));
  row(T.music, ctx.settings.music ? T.on : T.off, () => ctx.setSetting('music', !ctx.settings.music));
  row(T.quality, ctx.settings.quality === 'high' ? T.qualityHigh : T.qualityLow,
    () => ctx.setSetting('quality', ctx.settings.quality === 'high' ? 'low' : 'high'));
  row(T.reducedMotion, ctx.settings.reducedMotion ? T.on : T.off,
    () => ctx.setSetting('reducedMotion', !ctx.settings.reducedMotion));
  return wrap;
}

export function mountResults(host: HTMLElement, ctx: ScreenContext, view: ViewState | null): MountedScreen {
  const won = view?.winner === view?.team;
  const root = shell('screen-modal screen-results', view?.winner === null ? T.draw : won ? T.victory : T.defeat, '');
  const stats = document.createElement('dl');
  stats.className = 'stat-list';
  const add = (label: string, value: string): void => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    stats.append(dt, dd);
  };
  if (view) {
    add(T.statBuilt, String(view.stats.built));
    add(T.statKnockouts, String(view.stats.knockouts));
    add(T.statCrates, String(view.stats.cratesDelivered));
    add(T.statTime, `${view.stats.survived} ${T.secondsSuffix}`);
    const teams = Object.keys(view.bunkerHp) as Array<keyof typeof view.bunkerHp>;
    for (const team of teams) {
      add(`${T.teamLabel} ${TEAM_COLORS[team].label}`, view.eliminated[team] ? 'x' : `${Math.max(0, Math.round(view.bunkerHp[team]))}`);
    }
  }
  root.appendChild(stats);

  const actions = document.createElement('div');
  actions.className = 'screen-actions';
  actions.appendChild(button(T.restart, 'primary', () => ctx.send('again'), true));
  actions.appendChild(button(T.quit, 'ghost', () => ctx.send('quit')));
  root.appendChild(actions);
  host.appendChild(root);
  return { dispose: () => root.remove() };
}

export function mountNotice(host: HTMLElement, screen: Screen, title: string, body: string, hint: string, onOk: () => void): MountedScreen {
  const root = shell(`screen-modal screen-${screen}`, title, body);
  if (hint) {
    const small = document.createElement('p');
    small.className = 'screen-hint';
    small.textContent = hint;
    root.appendChild(small);
  }
  const actions = document.createElement('div');
  actions.className = 'screen-actions';
  actions.appendChild(button(T.back, 'primary', onOk, true));
  root.appendChild(actions);
  host.appendChild(root);
  return { dispose: () => root.remove() };
}

export function mountHowTo(host: HTMLElement, ctx: ScreenContext): MountedScreen {
  const root = shell('screen-howto', T.howTo, T.objectiveBody);
  const keys = document.createElement('p');
  keys.className = 'screen-body';
  keys.textContent = T.controlsDesktop;
  const touch = document.createElement('p');
  touch.className = 'screen-body';
  touch.textContent = T.controlsTouch;
  root.append(keys, touch);
  const actions = document.createElement('div');
  actions.className = 'screen-actions';
  actions.appendChild(button(T.back, 'primary', () => ctx.send('quit'), true));
  root.appendChild(actions);
  host.appendChild(root);
  return { dispose: () => root.remove() };
}

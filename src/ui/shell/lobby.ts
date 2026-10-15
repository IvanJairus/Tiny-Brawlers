import { T } from '../i18n/id';
import type { ScreenContext } from './screens';
import type { RosterEntry } from '../../sim/net/session';

export interface LobbyActions {
  host(): void;
  join(code: string): void;
  start(): void;
  leave(): void;
}

export interface LobbyView {
  root: HTMLElement;
  setPhase(phase: string, detail?: string): void;
  setCode(code: string | null): void;
  setRoster(entries: RosterEntry[]): void;
  dispose(): void;
}

export function mountLobby(host: HTMLElement, ctx: ScreenContext, actions: LobbyActions): LobbyView {
  const root = document.createElement('div');
  root.className = 'screen screen-lobby';

  const title = document.createElement('h1');
  title.className = 'screen-title';
  title.textContent = T.netTitle;
  root.appendChild(title);

  const codeBox = document.createElement('p');
  codeBox.className = 'lobby-code';
  codeBox.dataset.role = 'code';
  root.appendChild(codeBox);

  const phase = document.createElement('p');
  phase.className = 'screen-hint';
  phase.dataset.role = 'phase';
  root.appendChild(phase);

  const roster = document.createElement('ul');
  roster.className = 'lobby-roster';
  roster.dataset.role = 'roster';
  root.appendChild(roster);

  const entry = document.createElement('input');
  entry.className = 'lobby-input';
  entry.type = 'text';
  entry.inputMode = 'text';
  entry.autocapitalize = 'characters';
  entry.maxLength = 6;
  entry.placeholder = T.netCodeLabel;
  entry.dataset.role = 'codeInput';
  root.appendChild(entry);

  const actions_row = document.createElement('div');
  actions_row.className = 'screen-actions';
  const button = (label: string, kind: string, onClick: () => void): HTMLButtonElement => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `btn btn-${kind}`;
    el.textContent = label;
    el.addEventListener('click', onClick);
    actions_row.appendChild(el);
    return el;
  };
  const hostButton = button(T.netHost, 'primary', () => actions.host());
  const joinButton = button(T.netJoin, 'primary', () => actions.join(entry.value.trim().toUpperCase()));
  const startButton = button(T.netStart, 'ghost', () => actions.start());
  const leaveButton = button(T.quit, 'ghost', () => {
    ctx.send('quit');
    actions.leave();
  });
  startButton.hidden = true;
  root.appendChild(actions_row);
  host.appendChild(root);

  return {
    root,
    setPhase(value, detail) {
      phase.textContent = detail ? `${value}: ${detail}` : value;
    },
    setCode(code) {
      codeBox.textContent = code ? `${T.netCodeLabel}: ${code}` : '';
      hostButton.hidden = Boolean(code);
      joinButton.hidden = Boolean(code);
      startButton.hidden = !code;
      entry.hidden = Boolean(code);
    },
    setRoster(entries) {
      roster.replaceChildren(...entries.map((item) => {
        const li = document.createElement('li');
        li.className = 'lobby-slot';
        li.style.setProperty('--team', item.team);
        li.textContent = item.human ? item.name : `${item.name} (AI)`;
        return li;
      }));
    },
    dispose() {
      root.remove();
    }
  };
}

import { encodeInput, type RawAxes } from '../../sim/input/actions';

export interface KeyboardSource {
  attach(): void;
  detach(): void;
  read(): RawAxes;
  nudgeZoom(delta: number): void;
  zoom(): number;
}

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);

export function createKeyboard(target: EventTarget = window): KeyboardSource {
  const down = new Set<string>();
  let zoom = 0;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (MOVE_KEYS.has(event.code)) down.add(event.code);
    if (event.code === 'Space' || event.code === 'KeyF' || event.code === 'KeyE' || event.code === 'KeyR' || event.code === 'KeyQ') {
      event.preventDefault();
    }
    if (event.code === 'Equal' || event.code === 'NumpadAdd') zoom = Math.min(1, zoom + 0.12);
    if (event.code === 'Minus' || event.code === 'NumpadSubtract') zoom = Math.max(0, zoom - 0.12);
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    down.delete(event.code);
  };
  const onBlur = () => down.clear();

  return {
    attach() {
      target.addEventListener('keydown', onKeyDown as EventListener);
      target.addEventListener('keyup', onKeyUp as EventListener);
      target.addEventListener('blur', onBlur as EventListener);
    },
    detach() {
      target.removeEventListener('keydown', onKeyDown as EventListener);
      target.removeEventListener('keyup', onKeyUp as EventListener);
      target.removeEventListener('blur', onBlur as EventListener);
    },
    read(): RawAxes {
      let x = 0;
      let y = 0;
      if (down.has('KeyW') || down.has('ArrowUp')) y -= 1;
      if (down.has('KeyS') || down.has('ArrowDown')) y += 1;
      if (down.has('KeyA') || down.has('ArrowLeft')) x -= 1;
      if (down.has('KeyD') || down.has('ArrowRight')) x += 1;
      const len = Math.hypot(x, y) || 1;
      return {
        moveX: x / (x && y ? Math.SQRT2 : 1),
        moveY: y / (x && y ? Math.SQRT2 : 1),
        aimX: len > 0 ? x / len : 0,
        aimY: len > 0 ? y / len : 0,
        attack: down.has('Space') || down.has('KeyF'),
        grab: down.has('KeyE'),
        build: down.has('KeyR') || down.has('KeyQ'),
        zoom: 0
      };
    },
    nudgeZoom(delta: number) {
      zoom = Math.max(0, Math.min(1, zoom + delta));
    },
    zoom: () => zoom
  };
}

export { encodeInput };

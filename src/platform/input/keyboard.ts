import { encodeInput, type RawAxes } from '../../sim/input/actions';

export interface KeyboardSource {
  attach(): void;
  detach(): void;
  read(): RawAxes;
}

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
const ZOOM_STEP = 0.12;

/**
 * The camera owns the zoom level, so every input path only asks for a delta.
 * A keyboard-local zoom used to sit here with nothing reading it, which made the
 * plus and minus keys do nothing.
 */
export function createKeyboard(
  target: EventTarget = window,
  onZoom: (delta: number) => void = () => undefined
): KeyboardSource {
  const down = new Set<string>();

  const onKeyDown = (event: KeyboardEvent): void => {
    if (MOVE_KEYS.has(event.code)) down.add(event.code);
    if (event.code === 'Space' || event.code === 'KeyF' || event.code === 'KeyE' || event.code === 'KeyR' || event.code === 'KeyQ') {
      event.preventDefault();
    }
    if (event.code === 'Equal' || event.code === 'NumpadAdd') onZoom(-ZOOM_STEP);
    if (event.code === 'Minus' || event.code === 'NumpadSubtract') onZoom(ZOOM_STEP);
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
    }
  };
}

export { encodeInput };

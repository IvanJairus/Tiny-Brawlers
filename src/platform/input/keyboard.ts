import { encodeInput, type RawAxes } from '../../sim/input/actions';

export interface KeyboardSource {
  attach(): void;
  detach(): void;
  read(): RawAxes;
  /** Last mouse position in client pixels, or null on touch-only devices. */
  cursor(): { x: number; y: number } | null;
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
  let mouseAttack = false;
  let mouseGrab = false;
  // A tap shorter than one 33 ms tick must still be seen by the next sim step,
  // so first presses are latched until the following read().
  const latched = { attack: false, grab: false, build: false };
  let cursorX = 0;
  let cursorY = 0;
  let hasCursor = false;

  const onKeyDown = (event: KeyboardEvent): void => {
    const fresh = !down.has(event.code) && !(event.key && down.has(event.key.toLowerCase()));
    down.add(event.code);
    if (event.key) down.add(event.key.toLowerCase());
    if (fresh) {
      if (event.code === 'Space' || event.code === 'KeyF' || event.key === ' ' || event.key === 'f') latched.attack = true;
      if (event.code === 'KeyE' || event.key === 'e') latched.grab = true;
      if (event.code === 'KeyR' || event.code === 'KeyQ' || event.key === 'r' || event.key === 'q') latched.build = true;
    }
    if (
      event.code === 'Space' || event.code === 'KeyF' || event.code === 'KeyE' ||
      event.code === 'KeyR' || event.code === 'KeyQ' ||
      event.key === ' ' || event.key === 'f' || event.key === 'e' || event.key === 'r' || event.key === 'q'
    ) {
      event.preventDefault();
    }
    if (event.code === 'Equal' || event.code === 'NumpadAdd') onZoom(-ZOOM_STEP);
    if (event.code === 'Minus' || event.code === 'NumpadSubtract') onZoom(ZOOM_STEP);
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    down.delete(event.code);
    if (event.key) down.delete(event.key.toLowerCase());
  };
  const onMouseDown = (event: MouseEvent): void => {
    if (event.target instanceof HTMLElement && event.target.tagName === 'CANVAS') {
      if (event.button === 0) {
        latched.attack = true;
        mouseAttack = true;
      }
      if (event.button === 2) {
        latched.grab = true;
        mouseGrab = true;
      }
    }
  };
  const onMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) mouseAttack = false;
    if (event.button === 2) mouseGrab = false;
  };
  const onMouseMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return;
    cursorX = event.clientX;
    cursorY = event.clientY;
    hasCursor = true;
  };
  const onContextMenu = (event: Event): void => {
    if (event.target instanceof HTMLElement && event.target.tagName === 'CANVAS') {
      event.preventDefault();
    }
  };
  const onBlur = () => {
    down.clear();
    mouseAttack = false;
    mouseGrab = false;
  };

  return {
    attach() {
      target.addEventListener('keydown', onKeyDown as EventListener);
      target.addEventListener('keyup', onKeyUp as EventListener);
      target.addEventListener('blur', onBlur as EventListener);
      target.addEventListener('mousedown', onMouseDown as EventListener);
      target.addEventListener('mouseup', onMouseUp as EventListener);
      target.addEventListener('pointermove', onMouseMove as EventListener);
      target.addEventListener('contextmenu', onContextMenu as EventListener);
    },
    detach() {
      target.removeEventListener('keydown', onKeyDown as EventListener);
      target.removeEventListener('keyup', onKeyUp as EventListener);
      target.removeEventListener('blur', onBlur as EventListener);
      target.removeEventListener('mousedown', onMouseDown as EventListener);
      target.removeEventListener('mouseup', onMouseUp as EventListener);
      target.removeEventListener('pointermove', onMouseMove as EventListener);
      target.removeEventListener('contextmenu', onContextMenu as EventListener);
    },
    read(): RawAxes {
      let x = 0;
      let y = 0;
      if (down.has('KeyW') || down.has('ArrowUp') || down.has('w')) y -= 1;
      if (down.has('KeyS') || down.has('ArrowDown') || down.has('s')) y += 1;
      if (down.has('KeyA') || down.has('ArrowLeft') || down.has('a')) x -= 1;
      if (down.has('KeyD') || down.has('ArrowRight') || down.has('d')) x += 1;
      const len = Math.hypot(x, y) || 1;
      const axes: RawAxes = {
        moveX: x / (x && y ? Math.SQRT2 : 1),
        moveY: y / (x && y ? Math.SQRT2 : 1),
        aimX: len > 0 ? x / len : 0,
        aimY: len > 0 ? y / len : 0,
        attack: down.has('Space') || down.has('KeyF') || down.has('f') || down.has(' ') || mouseAttack || latched.attack,
        grab: down.has('KeyE') || down.has('e') || mouseGrab || latched.grab,
        build: down.has('KeyR') || down.has('KeyQ') || down.has('r') || down.has('q') || latched.build,
        zoom: 0
      };
      latched.attack = false;
      latched.grab = false;
      latched.build = false;
      return axes;
    },
    cursor(): { x: number; y: number } | null {
      return hasCursor ? { x: cursorX, y: cursorY } : null;
    }
  };
}

export { encodeInput };

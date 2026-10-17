import { describe, expect, it } from 'vitest';
import { createKeyboard } from '../../src/platform/input/keyboard';

type Handler = (event: Record<string, unknown>) => void;

function makeTarget() {
  const handlers = new Map<string, Handler[]>();
  return {
    addEventListener(type: string, fn: Handler) {
      const list = handlers.get(type) ?? [];
      list.push(fn);
      handlers.set(type, list);
    },
    removeEventListener() {
      // Not needed for these tests.
    },
    fire(type: string, event: Record<string, unknown>) {
      const withDefaults = { preventDefault: () => undefined, ...event };
      for (const fn of handlers.get(type) ?? []) fn(withDefaults);
    }
  };
}

function makeKeyboard() {
  const target = makeTarget();
  const keyboard = createKeyboard(target as unknown as EventTarget);
  return { keyboard, target };
}

describe('keyboard input', () => {
  it('buffers a tap shorter than one sim tick and consumes it exactly once', () => {
    const { keyboard, target } = makeKeyboard();
    keyboard.attach();

    target.fire('keydown', { code: 'KeyE', key: 'e' });
    target.fire('keyup', { code: 'KeyE', key: 'e' });

    expect(keyboard.read().grab).toBe(true);
    expect(keyboard.read().grab).toBe(false);
  });

  it('keeps held keys reporting true across reads', () => {
    const { keyboard, target } = makeKeyboard();
    keyboard.attach();

    target.fire('keydown', { code: 'Space', key: ' ' });
    expect(keyboard.read().attack).toBe(true);
    // OS auto-repeat keydown must not matter; the held key still reads true.
    expect(keyboard.read().attack).toBe(true);

    target.fire('keyup', { code: 'Space', key: ' ' });
    expect(keyboard.read().attack).toBe(false);
  });

  it('latches build presses separately from attack and grab', () => {
    const { keyboard, target } = makeKeyboard();
    keyboard.attach();

    target.fire('keydown', { code: 'KeyR', key: 'r' });
    target.fire('keyup', { code: 'KeyR', key: 'r' });

    const axes = keyboard.read();
    expect(axes.build).toBe(true);
    expect(axes.attack).toBe(false);
    expect(axes.grab).toBe(false);
    expect(keyboard.read().build).toBe(false);
  });

  it('tracks the mouse cursor and ignores touch pointers', () => {
    const { keyboard, target } = makeKeyboard();
    keyboard.attach();

    expect(keyboard.cursor()).toBeNull();

    target.fire('pointermove', { pointerType: 'touch', clientX: 10, clientY: 20 });
    expect(keyboard.cursor()).toBeNull();

    target.fire('pointermove', { pointerType: 'mouse', clientX: 100, clientY: 60 });
    expect(keyboard.cursor()).toEqual({ x: 100, y: 60 });
  });

  it('clears held state on blur so keys do not stick', () => {
    const { keyboard, target } = makeKeyboard();
    keyboard.attach();

    target.fire('keydown', { code: 'KeyW', key: 'w' });
    expect(keyboard.read().moveY).toBe(-1);

    target.fire('blur', {});
    expect(keyboard.read().moveY).toBe(0);
  });
});

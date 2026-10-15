// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createKeyboard } from '../../src/platform/input/keyboard';
import { createTouch } from '../../src/platform/input/touch';
import { encodeInput } from '../../src/sim/input/actions';
import { createWorld, hashWorld } from '../../src/sim/core/world';
import { stepWorld } from '../../src/sim/core/step';
import { spawnBuddy } from '../../src/sim/domain/match';
import { TICK_S } from '../../src/sim/domain/constants';
import { padOrigin } from '../../src/sim/domain/pad';

function keyboardMovingRight() {
  const target = new EventTarget();
  const keyboard = createKeyboard(target as unknown as Window & typeof globalThis);
  keyboard.attach();
  target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
  const axes = keyboard.read();
  keyboard.detach();
  return axes;
}

function touchDraggingRight() {
  const host = document.createElement('div');
  host.innerHTML = '<div data-part="stickRing"><div data-part="stickKnob"></div></div>';
  Object.defineProperty(host, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0 })
  });
  const touch = createTouch();
  touch.attach(host);

  const down = new Event('pointerdown', { bubbles: true }) as PointerEvent;
  Object.assign(down, { pointerId: 1, pointerType: 'touch', clientX: 60, clientY: 150, preventDefault() {} });
  host.dispatchEvent(down);

  const move = new Event('pointermove') as PointerEvent;
  Object.assign(move, { pointerId: 1, pointerType: 'touch', clientX: 140, clientY: 150, preventDefault() {} });
  window.dispatchEvent(move);

  const axes = touch.read();
  touch.detach();
  return axes;
}

function runStream(axes: ReturnType<typeof keyboardMovingRight>): number {
  const world = createWorld({ seed: 808 });
  const origin = padOrigin('red');
  const hero = spawnBuddy(world, 'red', 'fighter', false);
  hero.x = origin.x;
  hero.z = origin.z;
  world.localPlayer = hero.id;
  const foe = spawnBuddy(world, 'blue', 'fighter', false);
  foe.x = 10;
  foe.z = 10;
  for (let i = 0; i < 90; i++) {
    world.inputs.set(hero.id, encodeInput(i, axes));
    stepWorld(world, TICK_S);
  }
  return hashWorld(world);
}

describe('input parity', () => {
  it('a key press and a thumb drag produce the same command', () => {
    const fromKey = encodeInput(7, keyboardMovingRight());
    const fromTouch = encodeInput(7, touchDraggingRight());
    expect(fromTouch.mx).toBeGreaterThan(100);
    expect(fromKey.mx).toBe(fromTouch.mx);
    expect(fromKey.my).toBe(fromTouch.my);
  });

  it('both producers drive the simulation to the same world', () => {
    expect(runStream(touchDraggingRight())).toBe(runStream(keyboardMovingRight()));
  });

  it('quantises to a fixed grid so floats cannot drift', () => {
    const a = encodeInput(1, { ...keyboardMovingRight(), moveX: 0.5111, moveY: -0.2222 });
    const b = encodeInput(1, { ...keyboardMovingRight(), moveX: 0.5112, moveY: -0.2221 });
    expect(a.mx).toBe(b.mx);
    expect(a.my).toBe(b.my);
  });

  it('clamps out-of-range axes instead of amplifying speed', () => {
    const cmd = encodeInput(1, { moveX: 9, moveY: -9, aimX: 0, aimY: 0, attack: false, grab: false, build: false, zoom: 0 });
    expect(Math.abs(cmd.mx)).toBeLessThanOrEqual(127);
    expect(Math.abs(cmd.my)).toBeLessThanOrEqual(127);
  });
});

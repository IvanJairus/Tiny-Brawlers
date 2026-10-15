import type { RawAxes } from '../../sim/input/actions';

export interface TouchSource {
  attach(area: HTMLElement): void;
  detach(): void;
  read(): RawAxes;
  setButtons(buttons: { grab: boolean; shoot: boolean; build: boolean }): void;
  visible(): boolean;
}

const STICK_MAX = 46;

/**
 * The stick is dynamic: it appears under the thumb anywhere on the left half, so
 * a player never fights a fixed base that is under their keyboard hand on desktop.
 */
export function createTouch(target: Window & typeof globalThis = window): TouchSource {
  const buttons = { grab: false, shoot: false, build: false };
  let stickId: number | null = null;
  let originX = 0;
  let originY = 0;
  let dx = 0;
  let dy = 0;
  let area: HTMLElement | null = null;
  let ring: HTMLElement | null = null;
  let knob: HTMLElement | null = null;
  let coarse = false;

  try {
    coarse = target.matchMedia('(pointer: coarse)').matches;
  } catch {
    coarse = false;
  }

  const onDown = (event: PointerEvent): void => {
    if (!area || stickId !== null) return;
    if (event.pointerType === 'mouse' && !coarse) return;
    const rect = area.getBoundingClientRect();
    if (event.clientX - rect.left > rect.width * 0.45) return;
    stickId = event.pointerId;
    originX = event.clientX;
    originY = event.clientY;
    dx = 0;
    dy = 0;
    ring?.style.setProperty('opacity', '1');
    if (ring) {
      ring.style.left = `${event.clientX - rect.left}px`;
      ring.style.top = `${event.clientY - rect.top}px`;
    }
    if (knob) knob.style.transform = 'translate(0px, 0px)';
    event.preventDefault();
  };

  const onMove = (event: PointerEvent): void => {
    if (stickId === null || event.pointerId !== stickId) return;
    const rawX = event.clientX - originX;
    const rawY = event.clientY - originY;
    const length = Math.hypot(rawX, rawY);
    const clamped = Math.min(length, STICK_MAX);
    const angle = Math.atan2(rawY, rawX);
    dx = Math.cos(angle) * clamped;
    dy = Math.sin(angle) * clamped;
    if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const onUp = (event: PointerEvent): void => {
    if (event.pointerId !== stickId) return;
    stickId = null;
    dx = 0;
    dy = 0;
    if (knob) knob.style.transform = 'translate(0px, 0px)';
    ring?.style.setProperty('opacity', '0');
  };

  return {
    attach(host) {
      area = host;
      ring = host.querySelector<HTMLElement>('[data-part="stickRing"]');
      knob = host.querySelector<HTMLElement>('[data-part="stickKnob"]');
      host.addEventListener('pointerdown', onDown);
      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onUp);
      target.addEventListener('pointercancel', onUp);
      host.classList.toggle('is-coarse', coarse);
    },
    detach() {
      area?.removeEventListener('pointerdown', onDown);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
    },
    read(): RawAxes {
      return {
        moveX: dx / STICK_MAX,
        moveY: dy / STICK_MAX,
        aimX: dx / STICK_MAX,
        aimY: dy / STICK_MAX,
        attack: buttons.shoot,
        grab: buttons.grab,
        build: buttons.build,
        zoom: 0
      };
    },
    setButtons(next) {
      buttons.grab = next.grab;
      buttons.shoot = next.shoot;
      buttons.build = next.build;
    },
    visible: () => coarse
  };
}

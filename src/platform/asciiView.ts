import { asciiFrame } from '../sim/core/ascii';
import type { World } from '../sim/core/world';

export interface AsciiView {
  element: HTMLElement;
  update(world: World, nowMs: number): void;
  text(): string;
  dispose(): void;
}

const REFRESH_MS = 200;

/** Text mode overlay, `?ascii=1`: the same world the renderer draws, as plain characters. */
export function createAsciiView(doc: Document = document): AsciiView {
  const element = doc.createElement('pre');
  element.className = 'ascii-view';
  element.setAttribute('role', 'log');
  element.setAttribute('aria-label', 'Text mode');
  element.dataset.part = 'asciiView';

  let lastPaint = -1;
  let current = '';

  return {
    element,
    text: () => current,
    update(world: World, nowMs: number): void {
      if (nowMs - lastPaint < REFRESH_MS) return;
      lastPaint = nowMs;
      current = asciiFrame(world);
      element.textContent = current;
    },
    dispose(): void {
      element.remove();
    }
  };
}

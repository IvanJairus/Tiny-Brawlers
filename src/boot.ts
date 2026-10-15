import { createStage, type Stage } from './render/scene';
import { createStepper } from './sim/core/tick';

export interface DebugHandle {
  stage: Stage;
  steps(): number;
  fps(): number;
}

declare global {
  interface Window {
    __tb?: DebugHandle;
  }
}

export function boot(container: HTMLElement): () => void {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const stage = createStage(container, coarse);
  let steps = 0;
  let frames = 0;
  let fpsWindowStart = 0;
  let fps = 0;

  const stepper = createStepper(() => {
    steps++;
  });

  stage.resize();
  const onResize = () => stage.resize();
  window.addEventListener('resize', onResize);

  let last = 0;
  let running = true;

  const frame = (now: number): void => {
    if (!running) return;
    if (last !== 0) stepper.push(now - last);
    last = now;

    stage.draw();

    frames++;
    if (now - fpsWindowStart >= 500) {
      fps = (frames * 1000) / (now - fpsWindowStart);
      fpsWindowStart = now;
      frames = 0;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  if (import.meta.env.DEV) {
    window.__tb = { stage, steps: () => steps, fps: () => fps };
  }

  return () => {
    running = false;
    window.removeEventListener('resize', onResize);
    stage.dispose();
  };
}

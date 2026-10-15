export interface MeterSample {
  frameMs: number;
  drawCalls: number;
  triangles: number;
  entities: number;
}

export interface Meter {
  element: HTMLElement;
  sample(sample: MeterSample, nowMs: number): void;
  summary(): { p50: number; p95: number; fps: number; frames: number; drawCalls: number };
}

const WINDOW_MS = 10_000;

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
  return sorted[index];
}

/**
 * On-device measurement is the only honest answer to "is it smooth on a phone",
 * and a phone has no devtools attached. This overlay reports p50 and p95 frame
 * time plus the live draw-call count, updated at a quarter of the frame rate so
 * the meter itself does not become the thing that is slow.
 */
export function createMeter(): Meter {
  const element = document.createElement('div');
  element.className = 'meter';
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'off');

  const frames: number[] = [];
  let lastDrawCalls = 0;
  let lastTriangles = 0;
  let lastEntities = 0;
  let lastPaint = 0;
  let windowStart = 0;

  const summary = () => {
    const sorted = frames.slice().sort((a, b) => a - b);
    const mean = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
    return {
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      fps: mean > 0 ? 1000 / mean : 0,
      frames: sorted.length,
      drawCalls: lastDrawCalls
    };
  };

  return {
    element,
    sample(sample: MeterSample, nowMs: number): void {
      if (windowStart === 0) windowStart = nowMs;
      frames.push(sample.frameMs);
      while (frames.length > 600) frames.shift();
      if (nowMs - windowStart > WINDOW_MS) {
        windowStart = nowMs;
        frames.splice(0, Math.floor(frames.length / 2));
      }
      lastDrawCalls = sample.drawCalls;
      lastTriangles = sample.triangles;
      lastEntities = sample.entities;

      if (nowMs - lastPaint < 250) return;
      lastPaint = nowMs;
      const stats = summary();
      const slow = stats.p95 > 20;
      element.classList.toggle('is-slow', slow);
      element.textContent =
        `${stats.fps.toFixed(0)} fps · p50 ${stats.p50.toFixed(1)}ms · p95 ${stats.p95.toFixed(1)}ms\n` +
        `draw ${stats.drawCalls} · tri ${(lastTriangles / 1000).toFixed(0)}k · ent ${lastEntities}`;
      element.title = `n=${stats.frames}`;
    },
    summary
  };
}

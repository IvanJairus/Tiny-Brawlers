import type { Snapshot } from './codec';

export interface InterpStats {
  buffered: number;
  rttMs: number;
  lastTick: number;
  tickGapMs: number;
}

/**
 * Snapshots arrive at 15 Hz while the screen runs faster. The buffer keeps the
 * two most recent states so the renderer can place entities between them, and
 * freezes the pose instead of extrapolating forever when the link stalls.
 */
export class SnapshotBuffer {
  private items: Array<{ at: number; snapshot: Snapshot }> = [];
  private lastArrival = 0;
  private gap = 66;
  private rtt = 0;

  push(snapshot: Snapshot, nowMs: number): void {
    if (this.lastArrival) this.gap = this.gap * 0.8 + (nowMs - this.lastArrival) * 0.2;
    this.lastArrival = nowMs;
    this.items.push({ at: nowMs, snapshot });
    while (this.items.length > 4) this.items.shift();
  }

  setRtt(ms: number): void {
    this.rtt = ms;
  }

  latest(): Snapshot | null {
    return this.items[this.items.length - 1]?.snapshot ?? null;
  }

  /** Returns the two states to blend and the 0..1 factor at the given time. */
  sample(nowMs: number, delayMs = 100): { from: Snapshot; to: Snapshot; alpha: number } | null {
    const renderAt = nowMs - delayMs;
    const ready = this.items.filter((item) => item.at <= renderAt);
    if (ready.length === 0) return this.items.length > 0 ? { from: this.items[0].snapshot, to: this.items[0].snapshot, alpha: 1 } : null;
    const to = ready[ready.length - 1];
    const from = ready[ready.length - 2] ?? to;
    const span = Math.max(1, to.at - from.at);
    return { from: from.snapshot, to: to.snapshot, alpha: Math.max(0, Math.min(1, (renderAt - from.at) / span)) };
  }

  /** True once the link has been silent long enough that extrapolation should stop. */
  stalled(nowMs: number, limitMs = 120): boolean {
    return nowMs - this.lastArrival > limitMs;
  }

  stats(): InterpStats {
    return {
      buffered: this.items.length,
      rttMs: this.rtt,
      lastTick: this.items[this.items.length - 1]?.snapshot.tick ?? -1,
      tickGapMs: Math.round(this.gap)
    };
  }
}

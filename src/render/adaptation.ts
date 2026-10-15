export const SLOW_FRAME_MS = 20;
export const FRAMES_BEFORE_DOWNGRADE = 60;

export interface Adaptation {
  sample(frameMs: number): boolean;
  readonly scale: number;
}

/**
 * A phone that cannot hold the frame budget needs fewer pixels, not a stuttering
 * game. The rule drops once and never climbs back, so it cannot oscillate.
 */
export function createAdaptation(initialScale = 1): Adaptation {
  let slow = 0;
  let scale = initialScale;
  return {
    sample(frameMs: number): boolean {
      if (scale <= 0.75) return false;
      slow = frameMs > SLOW_FRAME_MS ? slow + 1 : 0;
      if (slow < FRAMES_BEFORE_DOWNGRADE) return false;
      slow = 0;
      scale = 0.75;
      return true;
    },
    get scale() { return scale; }
  };
}

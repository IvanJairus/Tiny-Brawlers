export type Button = 0 | 1;

/**
 * Wire format is fixed-width and quantised so a touch producer and a keyboard
 * producer cannot diverge by a float.
 */
export interface InputCmd {
  seq: number;
  mx: number;
  my: number;
  ax: number;
  ay: number;
  attack: Button;
  grab: Button;
  build: Button;
  zoom: number;
}

export const EMPTY_INPUT: InputCmd = {
  seq: 0, mx: 0, my: 0, ax: 0, ay: 0, attack: 0, grab: 0, build: 0, zoom: 0
};

export const AXIS_SCALE = 127;

export function quantiseAxis(value: number): number {
  const clamped = Math.max(-1, Math.min(1, value));
  return Math.round(clamped * AXIS_SCALE);
}

export function dequantiseAxis(value: number): number {
  return value / AXIS_SCALE;
}

export interface RawAxes {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  attack: boolean;
  grab: boolean;
  build: boolean;
  zoom: number;
}

export function encodeInput(seq: number, raw: RawAxes): InputCmd {
  return {
    seq: seq & 0xff,
    mx: quantiseAxis(raw.moveX),
    my: quantiseAxis(raw.moveY),
    ax: quantiseAxis(raw.aimX),
    ay: quantiseAxis(raw.aimY),
    attack: raw.attack ? 1 : 0,
    grab: raw.grab ? 1 : 0,
    build: raw.build ? 1 : 0,
    zoom: Math.max(-1, Math.min(1, Math.round(raw.zoom)))
  };
}

export function decodeMove(cmd: InputCmd): { x: number; y: number } {
  return { x: dequantiseAxis(cmd.mx), y: dequantiseAxis(cmd.my) };
}

export function decodeAim(cmd: InputCmd): { x: number; y: number } {
  return { x: dequantiseAxis(cmd.ax), y: dequantiseAxis(cmd.ay) };
}

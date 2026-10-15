export const TICK_HZ = 30;
export const TICK_MS = 1000 / TICK_HZ;
export const TICK_S = 1 / TICK_HZ;
export const MAX_CATCHUP_STEPS = 5;
export const MAX_ACCUMULATOR_MS = TICK_MS * MAX_CATCHUP_STEPS;

export const SNAPSHOT_HZ = 15;
export const VIEW_STATE_HZ = 15;

export const ARENA_HALF = 32;
export const ARENA_SURFACE_Y = 0;
export const VOID_DISTANCE = 46;

export const CRATE_SIZE = 0.9;
export const CRATE_MAX_ALIVE = 24;
export const CRATE_SPAWN_INTERVAL_S = 4.5;
export const CRATE_DROP_RADIUS = 6;

export const BUNKER_MAX_HP = 1000;
export const TANK_MAX_ALIVE = 4;

export const BASE_COORDINATES: Record<'red' | 'blue' | 'yellow' | 'cyan', { x: number; z: number }> = {
  red: { x: -21.2, z: -21.2 },
  blue: { x: 21.2, z: -21.2 },
  yellow: { x: -21.2, z: 21.2 },
  cyan: { x: 21.2, z: 21.2 }
};

export const PAD = {
  surfaceY: 0.1,
  layerY: [0.55, 1.5] as const,
  quadrantOffset: 0.55,
  halfWidth: 2.1,
  slotCount: 8
};

export const RESPAWN_S = 5;
export const REINFORCEMENT_INTERVAL_S = 20;
export const SQUAD_SIZE_MIN = 1;
export const SQUAD_SIZE_MAX = 6;

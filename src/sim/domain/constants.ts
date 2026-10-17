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

export const CRATE_INITIAL_COUNT = 14;
export const CRATE_WAVE_MIN = 3;
export const CRATE_WAVE_MAX = 5;

export const MELEE_RANGE = 1.85;
export const MELEE_DAMAGE = 22;
export const MELEE_COOLDOWN_S = 0.36;
export const MELEE_KNOCKBACK = 1.15;
export const CRATE_BONK_DAMAGE = 25;

/** Seconds for a buddy to reach full run speed from a standstill. */
export const MOVE_ACCEL_S = 0.12;
/** Seconds for a buddy to bleed full speed down to zero when input stops. */
export const MOVE_DECEL_S = 0.09;
/** Exponential decay rate (1/s) of shove velocity. Total slide ≈ impulse / this. */
export const KNOCK_DECAY = 8;
/** Input authority multiplier while a shove is still decaying, so a hit lands. */
export const KNOCK_CONTROL = 0.35;
/** Impulse units; with the decay above this yields ≈ MELEE_KNOCKBACK of slide. */
export const MELEE_KNOCK_IMPULSE = MELEE_KNOCKBACK * KNOCK_DECAY;
export const BLAST_KNOCK_IMPULSE = 10;

export const SOFT_BRICK_HP = 60;
export const POWERUP_DURATION_S = 12;
export const SHIELD_MAX_HP = 60;
export const HEART_HEAL_AMOUNT = 50;

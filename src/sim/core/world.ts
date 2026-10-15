import { createIdAllocator, type EntityId, type IdAllocator } from './ids';
import { createRng, type Rng } from './rng';
import { pushEvent, type SimEvent } from './events';
import { EMPTY_INPUT, type InputCmd } from '../input/actions';
import { BUNKER_MAX_HP } from '../domain/constants';
import { EMPTY_PAD, type PadMask } from '../domain/pad';
import { TEAM_IDS, type TeamId } from '../domain/teams';
import type { BuddyRec } from '../domain/buddy';
import type { CrateRec } from '../domain/crate';
import type { ProjectileRec } from '../domain/projectile';
import type { TankRec } from '../domain/tank';
import type { BotMemory } from '../ai/bot';

export interface World {
  tick: number;
  clock: number;
  ids: IdAllocator;
  rngWorld: Rng;
  rngAi: Rng;
  rngNet: Rng;
  buddies: BuddyRec[];
  crates: CrateRec[];
  projectiles: ProjectileRec[];
  tanks: TankRec[];
  pads: Record<TeamId, PadMask>;
  padCrates: Record<TeamId, EntityId[]>;
  padRotation: Record<TeamId, number>;
  bunkerHp: Record<TeamId, number>;
  eliminated: Record<TeamId, boolean>;
  inputs: Map<EntityId, InputCmd>;
  prevInputs: Map<EntityId, InputCmd>;
  botMemory: Map<EntityId, BotMemory>;
  seq: number;
  events: SimEvent[];
  over: boolean;
  winner: TeamId | null;
  crateTimer: number;
  troopTimer: number;
  localPlayer: EntityId;
}

export interface WorldConfig {
  seed: number;
  teams?: TeamId[];
}

export function createWorld(config: WorldConfig): World {
  const teams = config.teams ?? [...TEAM_IDS];
  const pads = {} as Record<TeamId, PadMask>;
  const padCrates = {} as Record<TeamId, EntityId[]>;
  const padRotation = {} as Record<TeamId, number>;
  const bunkerHp = {} as Record<TeamId, number>;
  const eliminated = {} as Record<TeamId, boolean>;
  for (const team of TEAM_IDS) {
    pads[team] = EMPTY_PAD;
    padCrates[team] = [];
    padRotation[team] = 0;
    bunkerHp[team] = teams.includes(team) ? BUNKER_MAX_HP : 0;
    eliminated[team] = !teams.includes(team);
  }

  return {
    tick: 0,
    clock: 0,
    ids: createIdAllocator(),
    rngWorld: createRng(config.seed),
    rngAi: createRng(config.seed ^ 0x5bf03635),
    rngNet: createRng(config.seed ^ 0x1ffffffff),
    buddies: [],
    crates: [],
    projectiles: [],
    tanks: [],
    pads,
    padCrates,
    padRotation,
    bunkerHp,
    eliminated,
    inputs: new Map(),
    prevInputs: new Map(),
    botMemory: new Map(),
    seq: 0,
    events: [],
    over: false,
    winner: null,
    crateTimer: 3,
    troopTimer: 20,
    localPlayer: 0 as EntityId
  };
}

export function setInput(w: World, buddy: EntityId, cmd: InputCmd): void {
  w.inputs.set(buddy, cmd);
}

export function inputOf(w: World, buddy: EntityId): InputCmd {
  return w.inputs.get(buddy) ?? EMPTY_INPUT;
}

export function findBuddy(w: World, id: EntityId): BuddyRec | undefined {
  return w.buddies.find((b) => b.id === id);
}

export function findCrate(w: World, id: EntityId): CrateRec | undefined {
  return w.crates.find((c) => c.id === id);
}

export function buddiesOf(w: World, team: TeamId, aliveOnly = true): BuddyRec[] {
  return w.buddies.filter((b) => b.team === team && (!aliveOnly || b.state !== 'ko'));
}

export function emit(w: World, event: SimEvent): void {
  pushEvent(w.events, event);
}

const Q = (n: number): number => Math.round(n * 64);

function mix(hash: number, value: number): number {
  let h = hash ^ (Q(value) | 0);
  h = Math.imul(h, 16777619) >>> 0;
  return h >>> 0;
}

/**
 * Quantised world fingerprint. Two runs that diverge anywhere in the sim show up
 * here, which is what makes the determinism and netcode gates checkable.
 */
export function hashWorld(w: World): number {
  let h = 2166136261 >>> 0;
  h = mix(h, w.tick);
  for (const b of w.buddies) {
    h = mix(h, b.id); h = mix(h, b.x); h = mix(h, b.z); h = mix(h, b.hp);
    h = mix(h, b.heading); h = mix(h, b.state.length); h = mix(h, b.weapon.length);
  }
  for (const c of w.crates) {
    h = mix(h, c.id); h = mix(h, c.x); h = mix(h, c.y); h = mix(h, c.z); h = mix(h, c.state.length);
  }
  for (const p of w.projectiles) h = mix(h, p.id), h = mix(h, p.x), h = mix(h, p.y), h = mix(h, p.z);
  for (const t of w.tanks) h = mix(h, t.id), h = mix(h, t.x), h = mix(h, t.z), h = mix(h, t.hp);
  for (const team of TEAM_IDS) {
    h = mix(h, w.pads[team]);
    h = mix(h, w.bunkerHp[team]);
  }
  h = mix(h, w.rngWorld.state());
  return h >>> 0;
}

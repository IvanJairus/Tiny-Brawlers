import { evaluatePad } from '../domain/recipes';
import { BASE_COORDINATES } from '../domain/constants';
import { TEAM_IDS, type TeamId } from '../domain/teams';
import { padOrigin } from '../domain/pad';
import { distance } from '../domain/buddy';
import { NO_ENTITY, type EntityId } from './ids';
import type { World } from './world';

export interface PadView {
  title: string;
  category: string;
  dps: number;
  description: string;
  total: number;
  slots: boolean[];
  buildable: boolean;
  nearPad: boolean;
}

export interface ViewState {
  tick: number;
  clock: number;
  over: boolean;
  winner: TeamId | null;
  localPlayer: EntityId;
  hp: number;
  maxHp: number;
  weapon: string;
  carrying: boolean;
  team: TeamId;
  cls: string;
  ammo: { grenades: number; rockets: number; medkits: number };
  bunkerHp: Record<TeamId, number>;
  alive: Record<TeamId, number>;
  eliminated: Record<TeamId, boolean>;
  pad: PadView;
  cratesOnField: number;
  tanks: number;
  stats: { built: number; knockouts: number; cratesDelivered: number; survived: number };
}

export interface MatchStats {
  built: number;
  knockouts: number;
  cratesDelivered: number;
}

export function projectView(w: World, stats: MatchStats): ViewState {
  const me = w.buddies.find((b) => b.id === w.localPlayer);
  const team = me?.team ?? 'red';
  const padTeam: TeamId = 'red';
  const mask = w.pads[padTeam];
  const recipe = evaluatePad(mask);
  const origin = padOrigin(padTeam);

  const alive = {} as Record<TeamId, number>;
  for (const t of TEAM_IDS) alive[t] = w.buddies.filter((b) => b.team === t && b.state !== 'ko').length;

  return {
    tick: w.tick,
    clock: w.clock,
    over: w.over,
    winner: w.winner,
    localPlayer: w.localPlayer,
    hp: me?.hp ?? 0,
    maxHp: me?.maxHp ?? 1,
    weapon: me?.weapon ?? 'none',
    carrying: (me?.carryCrate ?? (NO_ENTITY as EntityId)) !== (NO_ENTITY as EntityId),
    team,
    cls: me?.cls ?? 'fighter',
    ammo: { grenades: me?.grenades ?? 0, rockets: me?.rockets ?? 0, medkits: me?.medkits ?? 0 },
    bunkerHp: { ...w.bunkerHp },
    alive,
    eliminated: { ...w.eliminated },
    pad: {
      title: recipe.title,
      category: recipe.category,
      dps: recipe.dps,
      description: recipe.description,
      total: mask ? countBits(mask) : 0,
      slots: Array.from({ length: 8 }, (_, i) => (mask & (1 << i)) !== 0),
      buildable: recipe.category !== 'empty',
      nearPad: me ? distance(me, origin) < 3.4 : false
    },
    cratesOnField: w.crates.length,
    tanks: w.tanks.length,
    stats: { ...stats, survived: Math.round(w.clock) }
  };
}

function countBits(mask: number): number {
  let n = 0;
  for (let i = 0; i < 8; i++) if (mask & (1 << i)) n++;
  return n;
}

export const BUNKER_POSITIONS = BASE_COORDINATES;

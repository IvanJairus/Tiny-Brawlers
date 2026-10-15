import { ARENA_HALF, BASE_COORDINATES, CRATE_SIZE, PAD } from '../domain/constants';
import { TEAM_IDS, type TeamId } from '../domain/teams';
import { padOrigin } from '../domain/pad';
import type { World } from './world';

/** Text view of the world, built only from sim state: the way to tell a render bug from a sim bug. */
export const ASCII_WIDTH = 65;
export const ASCII_HEIGHT = 33;
export const ASCII_HEADER_LINES = 2;

const WATER = '~';
const GROUND = '.';
const PATH = ':';
const PAD_EMPTY = 'o';
const PAD_FULL = 'O';
const CRATE = '#';
const PROJECTILE = '*';
const TANK = 'T';
const SELF = '@';

const TEAM_GLYPH: Record<TeamId, string> = { red: 'r', blue: 'b', yellow: 'y', cyan: 'c' };

function columnOf(x: number): number {
  return Math.round(((x + ARENA_HALF) / (ARENA_HALF * 2)) * (ASCII_WIDTH - 1));
}

function rowOf(z: number): number {
  return Math.round(((z + ARENA_HALF) / (ARENA_HALF * 2)) * (ASCII_HEIGHT - 1));
}

function terrainRow(z: number): string[] {
  const row: string[] = [];
  for (let col = 0; col < ASCII_WIDTH; col++) {
    const x = (col / (ASCII_WIDTH - 1)) * ARENA_HALF * 2 - ARENA_HALF;
    const inside = Math.abs(x) <= ARENA_HALF - 1 && Math.abs(z) <= ARENA_HALF - 1;
    row.push(inside ? GROUND : WATER);
  }
  return row;
}

function markPad(grid: string[][], team: TeamId): void {
  const origin = padOrigin(team);
  const half = PAD.halfWidth + CRATE_SIZE;
  for (let z = origin.z - half; z <= origin.z + half; z += 1.6) {
    for (let x = origin.x - half; x <= origin.x + half; x += 1.6) {
      const col = columnOf(x);
      const row = rowOf(z);
      if (row < 0 || col < 0 || row >= ASCII_HEIGHT || col >= ASCII_WIDTH) continue;
      if (grid[row][col] === GROUND) grid[row][col] = PAD_EMPTY;
    }
  }
}

function put(grid: string[][], x: number, z: number, glyph: string): void {
  const col = columnOf(x);
  const row = rowOf(z);
  if (row < 0 || col < 0 || row >= ASCII_HEIGHT || col >= ASCII_WIDTH) return;
  grid[row][col] = glyph;
}

function header(world: World): string[] {
  const bunkers = TEAM_IDS.map((team) => `${TEAM_GLYPH[team]}:${Math.round(world.bunkerHp[team])}`).join(' ');
  const alive = TEAM_IDS.map(
    (team) => `${TEAM_GLYPH[team]}${world.buddies.filter((b) => b.team === team && b.state !== 'ko' && !b.remove).length}`
  ).join(' ');
  return [`tick ${world.tick} ${world.clock.toFixed(1)}s live ${alive}`, `bunker hp ${bunkers}`];
}

export function asciiFrame(world: World): string {
  const grid: string[][] = [];
  for (let row = 0; row < ASCII_HEIGHT; row++) {
    const z = (row / (ASCII_HEIGHT - 1)) * ARENA_HALF * 2 - ARENA_HALF;
    grid.push(terrainRow(z));
  }

  for (const team of TEAM_IDS) {
    const base = BASE_COORDINATES[team];
    put(grid, base.x, base.z, TEAM_GLYPH[team].toUpperCase());
    markPad(grid, team);
    if (world.pads[team] !== 0) {
      const origin = padOrigin(team);
      put(grid, origin.x, origin.z, PAD_FULL);
    }
  }

  for (const crate of world.crates) put(grid, crate.x, crate.z, CRATE);
  for (const projectile of world.projectiles) put(grid, projectile.x, projectile.z, PROJECTILE);
  for (const tank of world.tanks) put(grid, tank.x, tank.z, TANK);
  for (const buddy of world.buddies) {
    if (buddy.remove) continue;
    put(grid, buddy.x, buddy.z, buddy.state === 'ko' ? 'x' : TEAM_GLYPH[buddy.team]);
  }
  const me = world.buddies.find((b) => b.id === world.localPlayer);
  if (me && !me.remove) put(grid, me.x, me.z, SELF);

  const legend = '@kamu rbyc=tim #peti *=tembak T=tank x=KO o=pad .=darat ~=air';
  return [...header(world), ...grid.map((row) => row.join('')), legend].join('\n');
}

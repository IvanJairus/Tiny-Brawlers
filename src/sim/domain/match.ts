import type { EntityId } from '../core/ids';
import type { World } from '../core/world';
import { emit } from '../core/world';
import { BASE_COORDINATES, BUNKER_MAX_HP, REINFORCEMENT_INTERVAL_S, RESPAWN_S } from './constants';
import { CLASS_STATS, type BuddyClass } from './classes';
import { makeBuddy, type BuddyRec } from './buddy';
import { TEAM_IDS, type TeamId } from './teams';

export function spawnBuddy(w: World, team: TeamId, cls: BuddyClass, isBot: boolean): BuddyRec {
  const base = BASE_COORDINATES[team];
  const angle = w.rngWorld.float(0, Math.PI * 2);
  const buddy = makeBuddy(
    w.ids.alloc(), team, cls,
    base.x + Math.cos(angle) * 2.4,
    base.z + Math.sin(angle) * 2.4,
    isBot
  );
  buddy.invuln = 0.5;
  w.buddies.push(buddy);
  emit(w, { kind: 'spawn', entity: buddy.id, at: { x: buddy.x, z: buddy.z } });
  return buddy;
}

export function initialSquads(w: World, perTeam: number): void {
  const classes: BuddyClass[] = ['fighter', 'healer', 'constructor'];
  for (const team of TEAM_IDS) {
    if (w.eliminated[team]) continue;
    for (let i = 0; i < perTeam; i++) {
      spawnBuddy(w, team, classes[i % classes.length], true);
    }
  }
}

export function aliveTeams(w: World): TeamId[] {
  return TEAM_IDS.filter((t) => !w.eliminated[t]);
}

export function teamHasCrateOnPad(w: World, team: TeamId): boolean {
  return w.padCrates[team].length > 0;
}

/**
 * A team is gone only when its bunker is flat and no buddy is left standing.
 * Crates already stacked on the pad are lost with the team.
 */
export function refreshElimination(w: World): void {
  for (const team of TEAM_IDS) {
    if (w.eliminated[team]) continue;
    const bunkerDown = w.bunkerHp[team] <= 0;
    const anyAlive = w.buddies.some((b) => b.team === team && b.state !== 'ko');
    if (bunkerDown && !anyAlive) {
      w.eliminated[team] = true;
      w.pads[team] = 0;
      w.padCrates[team] = [];
      emit(w, { kind: 'eliminated', team });
    }
  }

  const survivors = aliveTeams(w);
  if (w.over || survivors.length > 1) return;
  const living = w.buddies.filter((b) => !w.eliminated[b.team] && b.state !== 'ko');
  if (survivors.length === 0 && living.length === 0) {
    w.over = true;
    w.winner = null;
    emit(w, { kind: 'matchOver', winner: null });
  } else if (survivors.length === 1) {
    w.over = true;
    w.winner = survivors[0];
    emit(w, { kind: 'matchOver', winner: survivors[0] });
  }
}

export function respawnDelayFor(buddy: BuddyRec): number {
  return RESPAWN_S;
}

export function tickRespawns(w: World, dt: number): void {
  for (const b of w.buddies) {
    if (b.state !== 'ko' || w.eliminated[b.team]) continue;
    if (b.koTimer > 0) {
      b.koTimer = Math.max(0, b.koTimer - dt);
      continue;
    }
    const alive = w.buddies.filter((x) => x.team === b.team && x.state !== 'ko').length;
    if (alive >= 6) continue;
    const base = BASE_COORDINATES[b.team];
    b.x = base.x + w.rngWorld.float(-2, 2);
    b.z = base.z + w.rngWorld.float(-2, 2);
    b.hp = Math.max(1, Math.round(CLASS_STATS[b.cls].maxHp * 0.4));
    b.state = 'idle';
    b.invuln = 2;
    b.carryCrate = 0 as EntityId;
    emit(w, { kind: 'revive', entity: b.id, at: { x: b.x, z: b.z } });
  }
}

export function tickReinforcements(w: World, dt: number): void {
  w.troopTimer -= dt;
  if (w.troopTimer > 0) return;
  w.troopTimer = REINFORCEMENT_INTERVAL_S;
  for (const team of aliveTeams(w)) {
    const size = w.buddies.filter((b) => b.team === team && b.state !== 'ko').length;
    if (size < 6) spawnBuddy(w, team, 'fighter', true);
  }
}

export function damageBunker(w: World, team: TeamId, amount: number, fromTeam: TeamId | null): void {
  if (w.eliminated[team] || amount <= 0 || fromTeam === team) return;
  w.bunkerHp[team] = Math.max(0, w.bunkerHp[team] - amount);
  const base = BASE_COORDINATES[team];
  emit(w, { kind: 'bunkerHit', team, hp: w.bunkerHp[team], at: { x: base.x, z: base.z } });
}

export const BUNKER_HP = BUNKER_MAX_HP;

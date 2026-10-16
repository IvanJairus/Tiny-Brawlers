import type { EntityId } from '../core/ids';
import { SOFT_BRICK_HP } from './constants';

export type BiomeKind = 'rumput' | 'gurun' | 'salju';
export const BIOME_IDS: readonly BiomeKind[] = ['rumput', 'gurun', 'salju'] as const;

export type ObstacleKind = 'hard' | 'soft';
export type BrickStage = 'intact' | 'cracked' | 'broken';

export type PowerUpKind = 'up_api' | 'up_lari' | 'up_bom' | 'up_perisai' | 'up_hati';
export const POWERUP_IDS: readonly PowerUpKind[] = ['up_api', 'up_lari', 'up_bom', 'up_perisai', 'up_hati'] as const;

export interface ObstacleRec {
  id: EntityId;
  kind: ObstacleKind;
  x: number;
  z: number;
  halfSize: number;
  hp: number;
  maxHp: number;
  dead: boolean;
}

export interface PowerUpRec {
  id: EntityId;
  kind: PowerUpKind;
  x: number;
  z: number;
  y: number;
  spin: number;
  life: number;
  dead: boolean;
}

export function brickStageOf(hp: number, maxHp: number): BrickStage {
  if (hp > maxHp * 0.66) return 'intact';
  if (hp > maxHp * 0.33) return 'cracked';
  return 'broken';
}

export const DEFAULT_OBSTACLE_SPECS: ReadonlyArray<{
  kind: ObstacleKind;
  x: number;
  z: number;
  halfSize: number;
}> = [
  // 8 hard obstacles (tembok_keras, halfSize: 0.9)
  { kind: 'hard', x: -5.5, z: -9.5, halfSize: 0.9 },
  { kind: 'hard', x: 5.5, z: -9.5, halfSize: 0.9 },
  { kind: 'hard', x: -5.5, z: 9.5, halfSize: 0.9 },
  { kind: 'hard', x: 5.5, z: 9.5, halfSize: 0.9 },
  { kind: 'hard', x: -9.5, z: -5.5, halfSize: 0.9 },
  { kind: 'hard', x: -9.5, z: 5.5, halfSize: 0.9 },
  { kind: 'hard', x: 9.5, z: -5.5, halfSize: 0.9 },
  { kind: 'hard', x: 9.5, z: 5.5, halfSize: 0.9 },

  // 16 soft obstacles (bata_lunak, halfSize: 0.85)
  { kind: 'soft', x: -2.2, z: -16.5, halfSize: 0.85 },
  { kind: 'soft', x: 2.2, z: -16.5, halfSize: 0.85 },
  { kind: 'soft', x: -2.2, z: 16.5, halfSize: 0.85 },
  { kind: 'soft', x: 2.2, z: 16.5, halfSize: 0.85 },
  { kind: 'soft', x: -16.5, z: -2.2, halfSize: 0.85 },
  { kind: 'soft', x: -16.5, z: 2.2, halfSize: 0.85 },
  { kind: 'soft', x: 16.5, z: -2.2, halfSize: 0.85 },
  { kind: 'soft', x: 16.5, z: 2.2, halfSize: 0.85 },
  { kind: 'soft', x: -3.8, z: -7.2, halfSize: 0.85 },
  { kind: 'soft', x: 3.8, z: -7.2, halfSize: 0.85 },
  { kind: 'soft', x: -3.8, z: 7.2, halfSize: 0.85 },
  { kind: 'soft', x: 3.8, z: 7.2, halfSize: 0.85 },
  { kind: 'soft', x: -13.5, z: -6.5, halfSize: 0.85 },
  { kind: 'soft', x: 13.5, z: -6.5, halfSize: 0.85 },
  { kind: 'soft', x: -13.5, z: 6.5, halfSize: 0.85 },
  { kind: 'soft', x: 13.5, z: 6.5, halfSize: 0.85 }
];

export function createDefaultObstacles(startId = 10000): ObstacleRec[] {
  return DEFAULT_OBSTACLE_SPECS.map((spec, i) => {
    const hp = spec.kind === 'hard' ? 999999 : SOFT_BRICK_HP;
    return {
      id: (startId + i) as EntityId,
      kind: spec.kind,
      x: spec.x,
      z: spec.z,
      halfSize: spec.halfSize,
      hp,
      maxHp: hp,
      dead: false
    };
  });
}

export function resolveCircleObstacles(
  entity: { x: number; z: number },
  radius: number,
  obstacles: ObstacleRec[]
): void {
  for (const obs of obstacles) {
    if (obs.dead) continue;
    const reach = obs.halfSize + radius;
    if (Math.abs(entity.x - obs.x) >= reach || Math.abs(entity.z - obs.z) >= reach) continue;

    const minX = obs.x - obs.halfSize;
    const maxX = obs.x + obs.halfSize;
    const minZ = obs.z - obs.halfSize;
    const maxZ = obs.z + obs.halfSize;

    const cx = Math.max(minX, Math.min(maxX, entity.x));
    const cz = Math.max(minZ, Math.min(maxZ, entity.z));

    const dx = entity.x - cx;
    const dz = entity.z - cz;
    const distSq = dx * dx + dz * dz;

    if (distSq < radius * radius) {
      const dist = Math.sqrt(distSq);
      if (dist < 1e-6) {
        const overlapX = obs.halfSize + radius - Math.abs(entity.x - obs.x);
        const overlapZ = obs.halfSize + radius - Math.abs(entity.z - obs.z);
        if (overlapX < overlapZ) {
          entity.x += (entity.x >= obs.x ? 1 : -1) * overlapX;
        } else {
          entity.z += (entity.z >= obs.z ? 1 : -1) * overlapZ;
        }
      } else {
        const push = radius - dist;
        entity.x += (dx / dist) * push;
        entity.z += (dz / dist) * push;
      }
    }
  }
}

export function hitObstacleAlongSegment(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  obstacles: ObstacleRec[],
  pad = 0.15
): ObstacleRec | null {
  const dx = bx - ax;
  const dz = bz - az;
  let bestObs: ObstacleRec | null = null;
  let bestT = Infinity;

  for (const obs of obstacles) {
    if (obs.dead) continue;
    const h = obs.halfSize + pad;
    const minX = obs.x - h;
    const maxX = obs.x + h;
    if ((ax < minX && bx < minX) || (ax > maxX && bx > maxX)) continue;
    const minZ = obs.z - h;
    const maxZ = obs.z + h;
    if ((az < minZ && bz < minZ) || (az > maxZ && bz > maxZ)) continue;

    let t0 = 0;
    let t1 = 1;

    if (Math.abs(dx) < 1e-9) {
      if (ax < minX || ax > maxX) continue;
    } else {
      let tx1 = (minX - ax) / dx;
      let tx2 = (maxX - ax) / dx;
      if (tx1 > tx2) {
        const tmp = tx1;
        tx1 = tx2;
        tx2 = tmp;
      }
      t0 = Math.max(t0, tx1);
      t1 = Math.min(t1, tx2);
      if (t0 > t1) continue;
    }

    if (Math.abs(dz) < 1e-9) {
      if (az < minZ || az > maxZ) continue;
    } else {
      let tz1 = (minZ - az) / dz;
      let tz2 = (maxZ - az) / dz;
      if (tz1 > tz2) {
        const tmp = tz1;
        tz1 = tz2;
        tz2 = tmp;
      }
      t0 = Math.max(t0, tz1);
      t1 = Math.min(t1, tz2);
      if (t0 > t1) continue;
    }

    if (t0 <= 1 && t1 >= 0 && t0 < bestT) {
      bestT = t0;
      bestObs = obs;
    }
  }

  return bestObs;
}

export function damageObstacle(obs: ObstacleRec, amount: number): boolean {
  if (obs.dead || obs.kind === 'hard' || amount <= 0) return false;
  obs.hp = Math.max(0, obs.hp - amount);
  if (obs.hp <= 0) {
    obs.dead = true;
    return true;
  }
  return false;
}

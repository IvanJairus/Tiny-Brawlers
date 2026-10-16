import type { EntityId } from '../core/ids';
import type { TeamId } from './teams';

export type ProjectileKind = 'bullet' | 'grenade' | 'rocket' | 'shell';

export interface ProjectileRec {
  id: EntityId;
  kind: ProjectileKind;
  team: TeamId;
  owner: EntityId;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  fuse: number;
  damage: number;
  radius: number;
  dead: boolean;
}

const GRENADE_GRAVITY = 20;

export function makeProjectile(p: Omit<ProjectileRec, 'id' | 'dead'>, id: EntityId): ProjectileRec {
  return { ...p, id, dead: false };
}

export function stepProjectile(p: ProjectileRec, dt: number): void {
  if (p.kind === 'grenade') p.vy -= GRENADE_GRAVITY * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.z += p.vz * dt;

  if (p.kind === 'grenade' && p.y < 0.12) {
    p.y = 0.12;
    p.vy = -p.vy * 0.42;
    p.vx *= 0.72;
    p.vz *= 0.72;
  }
  p.fuse -= dt;
}

export function isFinished(p: ProjectileRec): boolean {
  return p.fuse <= 0 || p.y < -2 || Math.hypot(p.x, p.z) > 60;
}

/** Every damage source must resolve through here so no hit can be invisible. */
export function blastOf(p: ProjectileRec): { radius: number; damage: number } {
  switch (p.kind) {
    case 'bullet': return { radius: 0, damage: p.damage };
    case 'grenade': return { radius: p.radius > 0 ? p.radius : 3.4, damage: p.damage };
    case 'rocket': return { radius: 4.6, damage: p.damage };
    case 'shell': return { radius: 2.2, damage: p.damage };
  }
}

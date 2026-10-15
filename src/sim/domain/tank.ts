import type { EntityId } from '../core/ids';
import type { TeamId } from './teams';

export interface TankRec {
  id: EntityId;
  team: TeamId;
  x: number;
  z: number;
  heading: number;
  turretAngle: number;
  hp: number;
  maxHp: number;
  driver: EntityId;
  fireCooldown: number;
  destroyed: boolean;
}

export const TANK_MAX_HP = 600;
const TANK_SPEED = 5.2;
const TANK_TURN = 1.6;

export function makeTank(id: EntityId, team: TeamId, x: number, z: number, heading: number): TankRec {
  return {
    id, team, x, z, heading, turretAngle: heading, hp: TANK_MAX_HP, maxHp: TANK_MAX_HP,
    driver: 0 as EntityId, fireCooldown: 0, destroyed: false
  };
}

export function stepTank(t: TankRec, drive: { fwd: number; turn: number }, dt: number): void {
  if (t.destroyed) return;
  if (t.fireCooldown > 0) t.fireCooldown = Math.max(0, t.fireCooldown - dt);
  t.heading += drive.turn * TANK_TURN * dt;
  t.x += Math.sin(t.heading) * drive.fwd * TANK_SPEED * dt;
  t.z += Math.cos(t.heading) * drive.fwd * TANK_SPEED * dt;
}

/**
 * The turret is stored in world space everywhere, including when AI aims it;
 * mixing local and world frames is what made bot aim point the wrong way before.
 */
export function aimTurret(t: TankRec, worldAngle: number, dt: number, rate = 2.4): void {
  const delta = ((worldAngle - t.turretAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const max = rate * dt;
  t.turretAngle += Math.max(-max, Math.min(max, delta));
}

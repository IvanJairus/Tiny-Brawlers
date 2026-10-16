import type { EntityId } from './ids';
import type { ItemType } from '../domain/recipes';
import type { TeamId } from '../domain/teams';
import type { PowerUpKind } from '../domain/obstacles';

export interface Vec2 { x: number; z: number }

export type SimEvent =
  | { kind: 'spawn'; entity: EntityId; at: Vec2 }
  | { kind: 'despawn'; entity: EntityId }
  | { kind: 'damage'; entity: EntityId; amount: number; fromTeam: TeamId | null; at: Vec2 }
  | { kind: 'heal'; entity: EntityId; amount: number; at: Vec2 }
  | { kind: 'knockout'; entity: EntityId; at: Vec2 }
  | { kind: 'revive'; entity: EntityId; at: Vec2 }
  | { kind: 'shot'; entity: EntityId; weapon: ItemType; at: Vec2; dir: number }
  | { kind: 'explosion'; entity: EntityId; radius: number; at: Vec2 }
  | { kind: 'pickup'; entity: EntityId; buddy: EntityId; at: Vec2 }
  | { kind: 'place'; entity: EntityId; buddy: EntityId; team: TeamId; slot: number; at: Vec2 }
  | { kind: 'throw'; entity: EntityId; buddy: EntityId; at: Vec2 }
  | { kind: 'build'; team: TeamId; recipe: ItemType; at: Vec2 }
  | { kind: 'bunkerHit'; team: TeamId; hp: number; at: Vec2 }
  | { kind: 'eliminated'; team: TeamId }
  | { kind: 'matchOver'; winner: TeamId | null }
  | { kind: 'melee'; entity: EntityId; at: Vec2; dir: number }
  | { kind: 'brickHit'; entity: EntityId; hp: number; at: Vec2 }
  | { kind: 'brickBreak'; entity: EntityId; at: Vec2 }
  | { kind: 'powerup'; buddy: EntityId; powerup: PowerUpKind; at: Vec2 };

const EVENT_QUEUE_LIMIT = 64;

/** Events are cues, not state: the queue is bounded so a stall cannot grow it. */
export function pushEvent(queue: SimEvent[], event: SimEvent): void {
  if (queue.length >= EVENT_QUEUE_LIMIT) queue.shift();
  queue.push(event);
}

export function drainEvents(queue: SimEvent[]): SimEvent[] {
  if (queue.length === 0) return [];
  return queue.splice(0, queue.length);
}

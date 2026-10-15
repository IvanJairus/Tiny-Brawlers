import { stepBuddy, distance } from '../domain/buddy';
import { NO_ENTITY, type EntityId } from '../core/ids';
import { AXIS_SCALE } from '../input/actions';
import type { InputCmd } from '../input/actions';
import type { World } from '../core/world';

export interface PredictedPosition {
  seq: number;
  x: number;
  z: number;
}

export interface Predictor {
  localId: EntityId;
  step(world: World, cmd: InputCmd, dt: number): void;
  reconcile(world: World, x: number, z: number): number;
  reset(id: EntityId): void;
  history(): PredictedPosition[];
}

export const SNAP_DISTANCE = 0.75;

/**
 * Only the local buddy is predicted. Crates, pads, damage and vehicles stay
 * authoritative, so a client can never invent game state.
 */
export function createPredictor(localId: EntityId = NO_ENTITY as EntityId): Predictor {
  let history: PredictedPosition[] = [];

  return {
    localId,
    step(world: World, cmd: InputCmd, dt: number): void {
      const me = world.buddies.find((b) => b.id === this.localId);
      if (!me) return;
      stepBuddy(me, { x: cmd.mx / AXIS_SCALE, y: cmd.my / AXIS_SCALE }, dt);
      history.push({ seq: cmd.seq, x: me.x, z: me.z });
      if (history.length > 64) history.shift();
    },
    reconcile(world: World, x: number, z: number): number {
      const me = world.buddies.find((b) => b.id === this.localId);
      if (!me) return 0;
      const error = distance({ x: me.x, z: me.z }, { x, z });
      if (error > 0.02) {
        me.x = x;
        me.z = z;
      }
      return error;
    },
    reset(id: EntityId): void {
      this.localId = id;
      history = [];
    },
    history: () => history
  };
}

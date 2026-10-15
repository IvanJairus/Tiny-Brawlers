import { MSG } from './messages';
import { applySnapshot, decodeInput, encodeInput, decodeSnapshot, type Snapshot } from './codec';
import { SnapshotBuffer } from './interp';
import { createPredictor, SNAP_DISTANCE } from './predict';
import { EMPTY_INPUT, type InputCmd } from '../input/actions';
import { createWorld, type World } from '../core/world';
import { NO_ENTITY, type EntityId } from '../core/ids';
import type { BuddyClass } from '../domain/classes';
import type { TeamId } from '../domain/teams';
import type { Channel, Transport } from './transport';

export type ClientPhase = 'idle' | 'joining' | 'lobby' | 'playing' | 'refused';

export interface ClientOptions {
  name: string;
  cls: BuddyClass;
  roomCode: string;
  now: () => number;
}

export interface Client {
  world: World;
  phase: ClientPhase;
  slot: number;
  team: TeamId | null;
  buffer: SnapshotBuffer;
  join(hostPeerId: string): void;
  ready(): void;
  sendInput(cmd: InputCmd): void;
  handle(peerId: string, channel: Channel, data: Uint8Array): void;
  tick(dt: number, cmd: InputCmd): void;
  rtt(): number;
  lastError(): string | null;
  lastResyncError: number;
}

const json = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));
const unjson = <T>(data: Uint8Array): T | null => {
  try {
    return JSON.parse(new TextDecoder().decode(data)) as T;
  } catch {
    return null;
  }
};

export function createClient(transport: Transport, options: ClientOptions): Client {
  const world = createWorld({ seed: 1 });
  const buffer = new SnapshotBuffer();
  const predictor = createPredictor();
  let hostPeerId = '';
  let seq = 0;
  let sentAt = new Map<number, number>();
  let rtt = 0;
  let lastError: string | null = null;
  let pendingLocal = NO_ENTITY as EntityId;

  const client: Client = {
    world,
    phase: 'idle',
    slot: -1,
    team: null,
    buffer,
    lastError: () => lastError,
    lastResyncError: 0,
    rtt: () => rtt,

    join(hostPeerIdArg) {
      hostPeerId = hostPeerIdArg;
      client.phase = 'joining';
      transport.send(hostPeerId, 'reliable', json({ t: 'join', name: options.name, cls: options.cls, code: options.roomCode }));
    },

    ready() {
      transport.send(hostPeerId, 'reliable', json({ t: 'ready' }));
    },

    sendInput(cmd) {
      seq = (seq + 1) % 256;
      const outgoing: InputCmd = { ...cmd, seq };
      sentAt.set(seq, options.now());
      if (sentAt.size > 64) sentAt.delete((seq - 64 + 256) % 256);
      transport.send(hostPeerId, 'fast', concat(new Uint8Array([MSG.input]), encodeInput(outgoing)));
    },

    tick(dt, cmd) {
      client.sendInput(cmd);
      predictor.step(world, cmd, dt);
    },

    handle(peerId, channel, data) {
      if (peerId !== hostPeerId && channel === 'fast') return;

      if (channel === 'fast') {
        // A refused peer must not keep watching: the host broadcasts snapshots to
        // the room, and without this a guest that was turned away at the door
        // still renders a live match and gets pushed to the playing screen.
        if (client.phase === 'refused') return;
        if (data[0] !== MSG.snapshot) return;
        const snapshot = decodeSnapshotSafe(data.subarray(1));
        if (!snapshot) {
          lastError = `codec:${data.length}`;
          return;
        }
        if (buffer.latest() && snapshot.tick <= buffer.latest()!.tick) return;
        const predicted = world.buddies.find((b) => b.id === world.localPlayer);
        const predictedX = predicted?.x ?? 0;
        const predictedZ = predicted?.z ?? 0;
        applySnapshot(world, snapshot);
        if (pendingLocal && (world.localPlayer === (NO_ENTITY as EntityId) || !world.buddies.some((b) => b.id === world.localPlayer))) {
          world.localPlayer = pendingLocal;
          predictor.reset(pendingLocal);
        }
        buffer.push(snapshot, options.now());
        if (client.phase !== 'playing') client.phase = 'playing';
        const me = world.buddies.find((b) => b.id === world.localPlayer);
        if (me) {
          const error = Math.hypot(me.x - predictedX, me.z - predictedZ);
          client.lastResyncError = error;
          if (error > SNAP_DISTANCE) lastError = 'resync';
          predictor.reconcile(world, me.x, me.z);
        }
        return;
      }

      const message = unjson<{
        t?: string; slot?: number; team?: TeamId; protocol?: number; roster?: unknown[];
        ping?: number; at?: number; buddyId?: number;
        e?: Array<{ k: string; x: number; z: number }>;
      }>(data);
      if (!message) return;

      switch (message.t) {
        case 'accept':
          client.slot = message.slot ?? -1;
          client.team = message.team ?? null;
          client.phase = 'lobby';
          if (typeof message.buddyId === 'number' && message.buddyId) pendingLocal = message.buddyId as EntityId;
          break;
        case 'control':
          if (typeof message.buddyId === 'number' && message.buddyId) pendingLocal = message.buddyId as EntityId;
          break;
        case 'full':
          lastError = 'full';
          client.phase = 'refused';
          break;
        case 'refused':
          lastError = 'code';
          client.phase = 'refused';
          break;
        case 'rejoin':
          lastError = 'rejoin';
          client.phase = 'refused';
          break;
        case 'roster':
          if (client.phase === 'refused') break;
          if (client.phase === 'joining') client.phase = 'lobby';
          break;
        case 'start':
          if (client.phase === 'refused') break;
          client.phase = 'playing';
          break;
        case 'replaced':
          lastError = 'replaced';
          break;
        case 'pong':
          if (typeof message.at === 'number') rtt = Math.max(0, options.now() - message.at);
          buffer.setRtt(rtt);
          break;
        case 'ev':
          for (const event of message.e ?? []) {
            world.events.push({ kind: event.k, entity: NO_ENTITY as EntityId, at: { x: event.x, z: event.z } } as never);
          }
          break;
        default:
          break;
      }
    }
  };

  transport.onData((peerId, channel, data) => client.handle(peerId, channel, data));
  return client;
}

function decodeSnapshotSafe(data: Uint8Array): Snapshot | null {
  try {
    return decodeSnapshot(data);
  } catch {
    return null;
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}



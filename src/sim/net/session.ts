import { createHost, type Host } from './host';
import { createClient, type Client } from './client';
import { encodeInput, EMPTY_INPUT, type InputCmd, type RawAxes } from '../input/actions';
import { stepWorld } from '../core/step';
import type { SimEvent } from '../core/events';
import { createWorld, seedInitialCrates, type World } from '../core/world';
import { initialSquads } from '../domain/match';
import { CLASS_STATS, type BuddyClass } from '../domain/classes';
import type { Transport } from './transport';
import type { BiomeKind } from '../domain/obstacles';

export type SessionKind = 'solo' | 'host' | 'client';

export interface RosterEntry {
  team: string;
  name: string;
  human: boolean;
  ready: boolean;
  latencyMs: number;
}

export interface Session {
  readonly kind: SessionKind;
  world: World;
  roster(): RosterEntry[];
  code(): string | null;
  phase(): 'idle' | 'joining' | 'lobby' | 'playing' | 'refused';
  error(): string | null;
  step(dt: number, axes: RawAxes): void;
  publish(events: SimEvent[]): void;
  start(): void;
  dispose(): void;
}

const SNAPSHOT_INTERVAL_MS = 1000 / 15;

/**
 * A relay that refused the connection is a reason to stop waiting, not a state to
 * sit in. Loopback and same-browser transports have no signalling to fail, so
 * they simply do not answer.
 */
function relayProblem(transport: Transport): string | null {
  const status = (transport as unknown as Partial<{ signallingStatus(): string }>).signallingStatus?.();
  return status === 'failed' ? 'relay' : null;
}

export function createSoloSession(seed: number, cls: BuddyClass, localTeam = 'red', biome: BiomeKind = 'rumput'): Session {
  const world = createWorld({ seed, biome });
  initialSquads(world, 2);
  seedInitialCrates(world);
  const hero = world.buddies.find((b) => b.team === localTeam);
  if (hero) {
    hero.cls = cls;
    hero.maxHp = CLASS_STATS[cls].maxHp;
    hero.hp = hero.maxHp;
    hero.isBot = false;
    hero.ownedByPlayer = true;
    world.localPlayer = hero.id;
  }

  return {
    kind: 'solo',
    world,
    code: () => null,
    phase: () => 'playing',
    error: () => null,
    roster: () => world.buddies.filter((b) => !b.isBot).map((b) => ({
      team: b.team, name: 'Kamu', human: true, ready: true, latencyMs: 0
    })),
    step(dt: number, axes: RawAxes): void {
      world.inputs.set(world.localPlayer, encodeInput((world.seq + world.tick) % 256, axes));
      stepWorld(world, dt);
    },
    publish(): void {
      // Nothing to send in solo play.
    },
    start(): void {
      // Solo play is already running.
    },
    dispose(): void {
      world.inputs.clear();
    }
  };
}

export interface HostSessionOptions {
  roomCode: string;
  cls: BuddyClass;
  name: string;
  now: () => number;
}

export function createHostSession(world: World, transport: Transport, options: HostSessionOptions): Session {
  const host: Host = createHost(world, transport, { roomCode: options.roomCode, now: options.now });
  const localSlot = host.slots[0];
  localSlot.name = options.name;
  localSlot.cls = options.cls;
  localSlot.bot = false;

  let sincePublish = 0;

  return {
    kind: 'host',
    world,
    code: () => options.roomCode,
    phase: () => (host.started ? 'playing' : 'lobby'),
    error: () => relayProblem(transport),
    roster: () => host.slots.map((slot) => ({
      team: slot.team,
      name: slot.peerId === null ? `Bot ${slot.team}` : slot.name,
      human: slot.peerId !== null,
      ready: slot.ready,
      latencyMs: 0
    })),
    step(dt: number, axes: RawAxes): void {
      host.collect();
      host.noteLocalInput();
      if (localSlot.buddyId) world.inputs.set(localSlot.buddyId, encodeInput((world.seq + world.tick) % 256, axes));
      stepWorld(world, dt);
      sincePublish += dt * 1000;
      if (sincePublish >= SNAPSHOT_INTERVAL_MS) {
        sincePublish = 0;
        this.publish(world.events);
      }
    },
    start(): void {
      host.begin();
    },
    publish(events: SimEvent[]): void {
      host.publish(events);
    },
    dispose(): void {
      transport.close();
    }
  };
}

export interface ClientSessionOptions {
  roomCode: string;
  cls: BuddyClass;
  name: string;
  hostPeerId: string;
  now: () => number;
}

export function createClientSession(transport: Transport, options: ClientSessionOptions): Session {
  const client: Client = createClient(transport, {
    name: options.name, cls: options.cls, roomCode: options.roomCode, now: options.now
  });
  client.join(options.hostPeerId);

  return {
    kind: 'client',
    world: client.world,
    code: () => options.roomCode,
    phase: () => client.phase,
    error: () => client.lastError() ?? relayProblem(transport),
    roster: () => [{ team: client.team ?? 'blue', name: options.name, human: true, ready: true, latencyMs: client.rtt() }],
    step(dt: number, axes: RawAxes): void {
      const cmd: InputCmd = axes.moveX === 0 && axes.moveY === 0 && !axes.attack && !axes.grab && !axes.build
        ? EMPTY_INPUT
        : encodeInput(0, axes);
      client.tick(dt, cmd);
    },
    publish(): void {
      // A client never broadcasts state.
    },
    start(): void {
      client.ready();
    },
    dispose(): void {
      transport.close();
    }
  };
}

export { createHost, createClient };

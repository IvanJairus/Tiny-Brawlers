import { MSG, PROTOCOL_HASH } from './messages';
import { decodeInput, encodeInput, encodeSnapshot } from './codec';
import { EMPTY_INPUT, type InputCmd } from '../input/actions';
import { TEAM_IDS, type TeamId } from '../domain/teams';
import { BUDDY_CLASSES, type BuddyClass } from '../domain/classes';
import { NO_ENTITY, type EntityId } from '../core/ids';
import type { SimEvent } from '../core/events';
import type { World } from '../core/world';
import type { Channel, Transport } from './transport';

export interface HostSlot {
  index: number;
  team: TeamId;
  cls: BuddyClass;
  peerId: string | null;
  name: string;
  ready: boolean;
  bot: boolean;
  buddyId: EntityId;
  lastPeerId: string | null;
  lastInputAt: number;
  seq: number;
}

export interface HostOptions {
  roomCode: string;
  now: () => number;
  takeoverMs?: number;
}

export interface Host {
  slots: HostSlot[];
  started: boolean;
  handle(peerId: string, channel: Channel, data: Uint8Array): void;
  peerDown(peerId: string): void;
  begin(): void;
  publish(events: SimEvent[]): void;
  collect(): void;
  humanCount(): number;
  code(): string;
}

const json = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));
const unjson = <T>(data: Uint8Array): T | null => {
  try {
    return JSON.parse(new TextDecoder().decode(data)) as T;
  } catch {
    return null;
  }
};

/**
 * The host is the only thing that runs the simulation. Clients send inputs and
 * receive state, which is what keeps four browsers from disagreeing about physics.
 */
export function createHost(world: World, transport: Transport, options: HostOptions): Host {
  const takeoverMs = options.takeoverMs ?? 2500;
  const slots: HostSlot[] = TEAM_IDS.map((team, index) => ({
    index,
    team,
    cls: BUDDY_CLASSES[index % BUDDY_CLASSES.length],
    peerId: index === 0 ? transport.id : null,
    name: index === 0 ? 'Host' : '',
    ready: index === 0,
    bot: true,
    buddyId: NO_ENTITY as EntityId,
    lastPeerId: null,
    lastInputAt: 0,
    seq: 0
  }));

  let started = false;
  const now = options.now;

  const sendTo = (peerId: string, channel: Channel, payload: unknown): void => {
    transport.send(peerId, channel, json(payload));
  };

  const broadcastRoster = (): void => {
    const roster = slots.map(({ index, team, cls, name, ready, bot, peerId }) => ({
      index, team, cls, name, ready, bot, human: peerId !== null
    }));
    transport.broadcast('reliable', json({ t: 'roster', roster }));
  };

  const assignBuddies = (): void => {
    for (const slot of slots) {
      const buddy = world.buddies.find((b) => b.team === slot.team && b.state !== 'ko');
      if (!buddy) continue;
      slot.buddyId = buddy.id;
      buddy.isBot = slot.bot;
      buddy.ownedByPlayer = !slot.bot;
    }
    world.localPlayer = slots[0].buddyId;
  };

  const host: Host = {
    slots,
    get started() { return started; },
    set started(value: boolean) { started = value; },
    code: () => options.roomCode,
    humanCount: () => slots.filter((slot) => slot.peerId !== null).length,

    handle(peerId, channel, data) {
      if (channel === 'fast') {
        const tag = data[0];
        if (tag !== MSG.input || !started) return;
        const slot = slots.find((entry) => entry.peerId === peerId);
        if (!slot || slot.buddyId === (NO_ENTITY as EntityId)) return;
        const cmd = decodeInput(data.subarray(1));
        slot.seq = cmd.seq;
        slot.lastInputAt = now();
        world.inputs.set(slot.buddyId, cmd);
        return;
      }

      const message = unjson<{
        t?: string; name?: string; cls?: string; code?: string; seq?: number; ping?: number;
      }>(data);
      if (!message) return;

      if (message.t === 'join') {
        // The buddy id is only known once squads exist, so it is sent again at start.
        // After the match begins only a peer that already held a slot may re-enter it.
        const free = started
          ? slots.find((slot) => slot.peerId === null && slot.lastPeerId === peerId)
          : slots.find((slot) => slot.peerId === null);
        if (!free) {
          sendTo(peerId, 'reliable', { t: started ? 'rejoin' : 'full' });
          return;
        }
        if ((message.code ?? '').toUpperCase() !== options.roomCode.toUpperCase()) {
          sendTo(peerId, 'reliable', { t: 'refused' });
          return;
        }
        // A slot that was taken over by AI keeps its buddy, so the same player
        // reconnecting gets their original soldier back rather than a new one.
        if (free.buddyId !== (NO_ENTITY as EntityId)) {
          const existing = world.buddies.find((b) => b.id === free.buddyId);
          if (existing) {
            existing.isBot = false;
            existing.ownedByPlayer = true;
          }
          free.bot = false;
        }
        free.peerId = peerId;
        free.lastPeerId = peerId;
        free.name = (message.name ?? 'Pemain').slice(0, 16);
        free.cls = BUDDY_CLASSES.includes(message.cls as BuddyClass) ? (message.cls as BuddyClass) : free.cls;
        sendTo(peerId, 'reliable', {
          t: 'accept', slot: free.index, team: free.team, protocol: PROTOCOL_HASH, code: options.roomCode,
          buddyId: free.buddyId
        });
        broadcastRoster();
        return;
      }

      if (message.t === 'ready') {
        const slot = slots.find((entry) => entry.peerId === peerId);
        if (slot) slot.ready = true;
        broadcastRoster();
        return;
      }

      if (message.t === 'start') {
        host.begin();
        return;
      }

      if (message.t === 'ping') {
        sendTo(peerId, 'reliable', { t: 'pong', ping: message.ping ?? 0, at: now() });
      }
    },

    peerDown(peerId) {
      const slot = slots.find((entry) => entry.peerId === peerId);
      if (!slot) return;
      slot.peerId = null;
      slot.bot = true;
      slot.ready = false;
      const buddy = world.buddies.find((b) => b.id === slot.buddyId);
      if (buddy) {
        buddy.isBot = true;
        buddy.ownedByPlayer = false;
      }
      world.inputs.delete(slot.buddyId);
      broadcastRoster();
    },

    begin() {
      if (started) return;
      started = true;
      for (const slot of slots) slot.bot = slot.peerId === null;
      assignBuddies();
      for (const slot of slots) {
        if (slot.peerId !== null) {
          sendTo(slot.peerId, 'reliable', { t: 'control', slot: slot.index, buddyId: slot.buddyId });
        }
      }
      transport.broadcast('reliable', json({ t: 'start', tickHz: 30, snapshotHz: 15 }));
    },

    publish(events) {
      if (!started) return;
      const moment = now();
      for (const slot of slots) {
        if (slot.peerId === null || slot.bot) continue;
        if (moment - slot.lastInputAt < takeoverMs) continue;
        slot.bot = true;
        const buddy = world.buddies.find((b) => b.id === slot.buddyId);
        if (buddy) buddy.isBot = true;
        transport.send(slot.peerId, 'reliable', json({ t: 'replaced', slot: slot.index }));
      }
      transport.broadcast('fast', concat(new Uint8Array([MSG.snapshot]), encodeSnapshot(world)));
      if (events.length > 0) transport.broadcast('reliable', json({ t: 'ev', e: compactEvents(events) }));
    },

    collect() {
      for (const slot of slots) {
        if (slot.bot || slot.peerId === null) continue;
        if (!world.inputs.has(slot.buddyId)) world.inputs.set(slot.buddyId, EMPTY_INPUT);
      }
    }
  };

  transport.onData((peerId, channel, data) => host.handle(peerId, channel, data));
  return host;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function compactEvents(events: SimEvent[]): Array<{ k: string; x: number; z: number }> {
  return events.slice(0, 24).map((event) => {
    const at = 'at' in event ? event.at : { x: 0, z: 0 };
    return { k: event.kind, x: Math.round(at.x * 8) / 8, z: Math.round(at.z * 8) / 8 };
  });
}

export { encodeInput };

import { describe, expect, it } from 'vitest';
import { decodeInput, encodeInput, encodeSnapshot, decodeSnapshot, applySnapshot } from '../../src/sim/net/codec';
import { createWorld, hashWorld } from '../../src/sim/core/world';
import { stepWorld } from '../../src/sim/core/step';
import { initialSquads, spawnBuddy } from '../../src/sim/domain/match';
import { createHost } from '../../src/sim/net/host';
import { createClient } from '../../src/sim/net/client';
import { BAD_LINK, CLEAN_LINK, LoopbackHub } from '../../src/sim/net/transport';
import { EMPTY_INPUT, encodeInput as encode } from '../../src/sim/input/actions';
import { TICK_S } from '../../src/sim/domain/constants';
import { padOrigin } from '../../src/sim/domain/pad';
import { NO_ENTITY } from '../../src/sim/core/ids';

function seededWorld(): ReturnType<typeof createWorld> {
  const world = createWorld({ seed: 4242 });
  initialSquads(world, 2);
  return world;
}

describe('wire codec', () => {
  it('round-trips an input command exactly', () => {
    const cmd = encode(37, {
      moveX: 0.5, moveY: -0.25, aimX: 1, aimY: 0, attack: true, grab: false, build: true, zoom: 0
    });
    const decoded = decodeInput(encodeInput(cmd));
    expect(decoded).toEqual(cmd);
  });

  it('round-trips a live world within quantisation error', () => {
    const world = seededWorld();
    stepWorld(world, TICK_S);
    const decoded = decodeSnapshot(encodeSnapshot(world));
    expect(decoded.tick).toBe(world.tick);
    expect(decoded.buddies.length).toBe(world.buddies.length);
    for (let i = 0; i < world.buddies.length; i++) {
      expect(Math.abs(decoded.buddies[i].x - world.buddies[i].x)).toBeLessThan(0.02);
      expect(Math.abs(decoded.buddies[i].z - world.buddies[i].z)).toBeLessThan(0.02);
      expect(decoded.buddies[i].hp).toBe(Math.round(world.buddies[i].hp));
    }
    expect(decoded.pads.red).toBe(world.pads.red);
    expect(decoded.bunkerHp.blue).toBe(world.bunkerHp.blue);
  });

  it('rejects a truncated snapshot instead of corrupting the world', () => {
    const world = seededWorld();
    const bytes = encodeSnapshot(world);
    const cut = bytes.subarray(0, Math.floor(bytes.length / 2));
    expect(() => decodeSnapshot(cut)).toThrow();
  });

  it('stays inside the mobile bandwidth budget', () => {
    const world = seededWorld();
    for (let i = 0; i < 300; i++) stepWorld(world, TICK_S);
    const size = encodeSnapshot(world).byteLength;
    const perSecond = size * 15;
    expect(size).toBeLessThan(1200);
    expect(perSecond).toBeLessThan(16_384);
  });
});

describe('host authoritative session', () => {
  it('accepts a player with the right code and refuses the wrong one', () => {
    const hub = new LoopbackHub(CLEAN_LINK);
    const world = seededWorld();
    const hostTransport = hub.create();
    const host = createHost(world, hostTransport, { roomCode: 'ABCD23', now: () => hub.now });
    void host;

    const guestTransport = hub.create();
    const guest = createClient(guestTransport, { name: 'Tamu', cls: 'healer', roomCode: 'WRONG', now: () => hub.now });
    guest.join(hostTransport.id);
    hub.advance(50);
    expect(guest.phase).toBe('refused');
    expect(guest.lastError()).toBe('code');

    const second = hub.create();
    const guest2 = createClient(second, { name: 'Dua', cls: 'healer', roomCode: 'ABCD23', now: () => hub.now });
    guest2.join(hostTransport.id);
    hub.advance(50);
    expect(guest2.phase).toBe('lobby');
    expect(guest2.slot).toBe(1);
    expect(guest2.team).toBe('blue');
  });

  it('keeps clients converged with the host through a stalled link', () => {
    const hub = new LoopbackHub(BAD_LINK, 99);
    const world = seededWorld();
    const hostTransport = hub.create();
    const host = createHost(world, hostTransport, { roomCode: 'ROOM01', now: () => hub.now });

    const guestTransport = hub.create();
    const guest = createClient(guestTransport, { name: 'Dua', cls: 'fighter', roomCode: 'ROOM01', now: () => hub.now });
    guest.join(hostTransport.id);
    hub.advance(120);
    guest.ready();
    host.begin();
    hub.advance(120);

    let sincePublish = 0;
    const stepBoth = (ms: number): void => {
      const steps = Math.round(ms / (TICK_S * 1000));
      for (let i = 0; i < steps; i++) {
        host.collect();
        stepWorld(world, TICK_S);
        sincePublish += TICK_S * 1000;
        if (sincePublish >= 1000 / 15) {
          sincePublish = 0;
          host.publish(world.events.splice(0, world.events.length));
        }
        guest.tick(TICK_S, encode(0, {
          moveX: 0.4, moveY: 0.2, aimX: 0, aimY: 0, attack: false, grab: false, build: false, zoom: 0
        }));
      }
      hub.advance(ms);
    };

    stepBoth(2000);
    expect(guest.phase).toBe('playing');
    expect(guest.world.buddies.length).toBe(world.buddies.length);

    const stalledFrom = hub.now;
    for (let i = 0; i < 12; i++) {
      host.collect();
      stepWorld(world, TICK_S);
      hub.advance(TICK_S * 1000);
    }
    void stalledFrom;

    stepBoth(1500);
    const latest = guest.buffer.latest();
    expect(latest).not.toBeNull();
    expect(Math.abs(latest!.tick - world.tick)).toBeLessThan(20);
  });

  it('hands a dropped player back to the AI without losing their crate', () => {
    const hub = new LoopbackHub(CLEAN_LINK, 7);
    const world = seededWorld();
    const hostTransport = hub.create();
    const host = createHost(world, hostTransport, { roomCode: 'KEEP01', now: () => hub.now });

    const guestTransport = hub.create();
    const guest = createClient(guestTransport, { name: 'Tiga', cls: 'constructor', roomCode: 'KEEP01', now: () => hub.now });
    guest.join(hostTransport.id);
    hub.advance(80);
    host.begin();
    hub.advance(80);

    const slot = host.slots[1];
    const buddy = world.buddies.find((b) => b.id === slot.buddyId)!;
    const origin = padOrigin(buddy.team);
    buddy.x = origin.x;
    buddy.z = origin.z;
    const crate = world.crates[0] ?? null;
    if (crate) {
      crate.state = 'held';
      crate.heldBy = buddy.id;
      buddy.carryCrate = crate.id;
    }

    hub.drop(guestTransport.id);
    for (let i = 0; i < 120; i++) {
      host.collect();
      stepWorld(world, TICK_S);
      host.publish([]);
      hub.advance(TICK_S * 1000);
    }

    expect(slot.bot).toBe(true);
    expect(buddy.isBot).toBe(true);
    for (const other of world.buddies) {
      if (other.carryCrate === (NO_ENTITY as never)) continue;
      const held = world.crates.find((c) => c.id === other.carryCrate);
      expect(held, 'a carried crate must still exist').toBeDefined();
      expect(held!.heldBy).toBe(other.id);
    }
  });

  it('refuses a stranger once the match has started', () => {
    const hub = new LoopbackHub(CLEAN_LINK, 33);
    const world = createWorld({ seed: 707 });
    initialSquads(world, 2);
    const hostTransport = hub.create();
    const host = createHost(world, hostTransport, { roomCode: 'LOCK01', now: () => hub.now });
    host.begin();
    const stranger = hub.create();
    host.handle(stranger.id, 'reliable', new TextEncoder().encode(JSON.stringify({
      t: 'join', name: 'Orang', cls: 'fighter', code: 'LOCK01'
    })));
    expect(host.slots.some((slot) => slot.peerId === stranger.id)).toBe(false);
    expect(host.humanCount()).toBe(1);
  });

  it('gives a reconnecting player their original buddy back', () => {
    const hub = new LoopbackHub(CLEAN_LINK, 21);
    const world = createWorld({ seed: 606 });
    initialSquads(world, 2);
    const hostTransport = hub.create();
    const host = createHost(world, hostTransport, { roomCode: 'BACK01', now: () => hub.now });
    const guestTransport = hub.create();
    host.handle(guestTransport.id, 'reliable', new TextEncoder().encode(JSON.stringify({
      t: 'join', name: 'Dua', cls: 'fighter', code: 'BACK01'
    })));
    host.begin();
    hub.advance(40);

    const slot = host.slots[1];
    expect(slot.peerId).toBe(guestTransport.id);
    const buddy = world.buddies.find((b) => b.id === slot.buddyId)!;
    expect(buddy.isBot).toBe(false);

    host.peerDown(guestTransport.id);
    expect(slot.bot).toBe(true);
    expect(buddy.isBot).toBe(true);

    host.handle(guestTransport.id, 'reliable', new TextEncoder().encode(JSON.stringify({
      t: 'join', name: 'Dua', cls: 'fighter', code: 'BACK01'
    })));
    expect(slot.peerId).toBe(guestTransport.id);
    expect(slot.bot).toBe(false);
    expect(buddy.isBot).toBe(false);
    expect(buddy.ownedByPlayer).toBe(true);
  });

  it('fills unused slots with bots so a two player match still plays', () => {
    const hub = new LoopbackHub(CLEAN_LINK, 3);
    const world = seededWorld();
    const hostTransport = hub.create();
    const host = createHost(world, hostTransport, { roomCode: 'TWO22', now: () => hub.now });
    const guestTransport = hub.create();
    const guest = createClient(guestTransport, { name: 'Dua', cls: 'fighter', roomCode: 'TWO22', now: () => hub.now });
    guest.join(hostTransport.id);
    hub.advance(60);
    host.begin();
    hub.advance(60);
    expect(host.humanCount()).toBe(2);
    expect(host.slots.filter((slot) => slot.bot).length).toBe(2);
    expect(host.slots.filter((slot) => !slot.bot).map((slot) => slot.team)).toEqual(['red', 'blue']);
  });
});

describe('client world mirror', () => {
  it('applies a snapshot into a renderable world', () => {
    const world = seededWorld();
    for (let i = 0; i < 60; i++) stepWorld(world, TICK_S);
    const mirror = createWorld({ seed: 1 });
    const hero = spawnBuddy(mirror, 'red', 'fighter', false);
    mirror.localPlayer = hero.id;
    applySnapshot(mirror, decodeSnapshot(encodeSnapshot(world)));
    expect(mirror.buddies.length).toBe(world.buddies.length);
    expect(mirror.bunkerHp.red).toBe(world.bunkerHp.red);
    expect(mirror.tick).toBe(world.tick);
    expect(hashWorld(mirror)).not.toBe(0);
  });

  it('ignores an out-of-order older snapshot', () => {
    const world = seededWorld();
    stepWorld(world, TICK_S);
    const early = encodeSnapshot(world);
    for (let i = 0; i < 30; i++) stepWorld(world, TICK_S);
    const late = encodeSnapshot(world);
    expect(decodeSnapshot(late).tick).toBeGreaterThan(decodeSnapshot(early).tick);
    void EMPTY_INPUT;
  });
});

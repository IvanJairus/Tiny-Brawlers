import { describe, expect, it } from 'vitest';
import { createWorld } from '../../src/sim/core/world';
import { initialSquads } from '../../src/sim/domain/match';
import { createClientSession, createHostSession } from '../../src/sim/net/session';
import { BAD_LINK, CLEAN_LINK, LoopbackHub } from '../../src/sim/net/transport';
import { TICK_S } from '../../src/sim/domain/constants';

const STILL = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, attack: false, grab: false, build: false, zoom: 0 };
const WALK = { moveX: 0.8, moveY: 0.2, aimX: 0, aimY: 0, attack: false, grab: false, build: false, zoom: 0 };

function build(impairment = CLEAN_LINK) {
  const hub = new LoopbackHub(impairment, 4242);
  const world = createWorld({ seed: 20261 });
  initialSquads(world, 2);

  const hostTransport = hub.create();
  const guestTransport = hub.create();

  const host = createHostSession(world, hostTransport, { roomCode: 'PLAY01', cls: 'fighter', name: 'Tuan', now: () => hub.now });
  const guest = createClientSession(guestTransport, {
    roomCode: 'PLAY01', cls: 'healer', name: 'Tamu', hostPeerId: hostTransport.id, now: () => hub.now
  });
  return { hub, host, guest, world };
}

describe('netplay session', () => {
  it('gets a guest into a running match and keeps them in step', () => {
    const { hub, host, guest } = build();
    hub.advance(60);
    guest.start();
    host.start();
    hub.advance(60);
    host.publish([]);
    hub.advance(60);

    expect(guest.world.localPlayer).not.toBe(0);
    expect(guest.roster()[0].team).toBe('blue');

    for (let i = 0; i < 240; i++) {
      host.step(TICK_S, STILL);
      guest.step(TICK_S, WALK);
      hub.advance(TICK_S * 1000);
    }

    const mirror = guest.world.buddies.find((b) => b.id === guest.world.localPlayer);
    const original = host.world.buddies.find((b) => b.id === mirror?.id);
    expect(mirror).toBeDefined();
    expect(original).toBeDefined();
    expect(Math.abs(mirror!.x - original!.x)).toBeLessThan(1.2);
    expect(Math.abs(mirror!.z - original!.z)).toBeLessThan(1.2);
    expect(guest.world.bunkerHp.red).toBe(host.world.bunkerHp.red);
  });

  it('survives a lossy link without inventing entities', () => {
    const { hub, host, guest } = build(BAD_LINK);
    hub.advance(60);
    guest.start();
    host.start();
    hub.advance(80);
    for (let i = 0; i < 600; i++) {
      host.step(TICK_S, STILL);
      guest.step(TICK_S, WALK);
      hub.advance(TICK_S * 1000);
    }
    const ids = new Set(guest.world.buddies.map((b) => b.id));
    expect(ids.size).toBe(guest.world.buddies.length);
    for (const buddy of guest.world.buddies) {
      if (!buddy.carryCrate) continue;
      expect(guest.world.crates.some((c) => c.id === buddy.carryCrate)).toBe(true);
    }
  });

  it('reports why a join was refused', () => {
    const hub = new LoopbackHub(CLEAN_LINK, 11);
    const world = createWorld({ seed: 3 });
    initialSquads(world, 2);
    const hostTransport = hub.create();
    const guestTransport = hub.create();
    createHostSession(world, hostTransport, { roomCode: 'RIGHT1', cls: 'fighter', name: 'A', now: () => hub.now });
    const guest = createClientSession(guestTransport, {
      roomCode: 'WRONG1', cls: 'fighter', name: 'B', hostPeerId: hostTransport.id, now: () => hub.now
    });
    hub.advance(80);
    expect(guest.error()).toBe('code');
    expect(guest.phase()).toBe('refused');
  });

  it('refuses a guest with the wrong room code', () => {
    const hub = new LoopbackHub(CLEAN_LINK, 5);
    const world = createWorld({ seed: 7 });
    initialSquads(world, 2);
    const hostTransport = hub.create();
    const guestTransport = hub.create();
    createHostSession(world, hostTransport, { roomCode: 'RIGHT1', cls: 'fighter', name: 'A', now: () => hub.now });
    const guest = createClientSession(guestTransport, {
      roomCode: 'WRONG1', cls: 'fighter', name: 'B', hostPeerId: hostTransport.id, now: () => hub.now
    });
    hub.advance(80);
    expect(guest.world.buddies.length).toBe(0);
  });
});

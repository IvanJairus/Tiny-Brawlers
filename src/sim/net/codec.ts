import type { World } from '../core/world';
import type { EntityId } from '../core/ids';
import { NO_ENTITY } from '../core/ids';
import { TEAM_IDS, type TeamId } from '../domain/teams';
import { BUDDY_CLASSES, type BuddyClass } from '../domain/classes';
import type { InputCmd } from '../input/actions';
import type { ProjectileKind } from '../domain/projectile';

export const POS_SCALE = 64;

const WEAPON_IDS = ['none', 'pistol', 'shotgun', 'grenade', 'bazooka', 'medic', 'medic_unit', 'commando', 'tank', 'ammo'] as const;
const STATE_IDS = ['idle', 'walk', 'carry', 'ko', 'celebrate'] as const;
const CRATE_STATE_IDS = ['dropping', 'loose', 'held', 'onPad', 'thrown'] as const;
const KIND_IDS: ProjectileKind[] = ['grenade', 'rocket', 'shell'];
const TEAM_INDEX = new Map(TEAM_IDS.map((t, i) => [t, i]));
const TEAM_BY_INDEX: readonly TeamId[] = TEAM_IDS;

export interface Writer {
  bytes(): Uint8Array;
  u8(v: number): void;
  u16(v: number): void;
  i16(v: number): void;
  u32(v: number): void;
  f32(v: number): void;
  str(v: string): void;
}

export function createWriter(capacity = 2048): Writer {
  let buffer = new ArrayBuffer(capacity);
  let view = new DataView(buffer);
  let bytes = new Uint8Array(buffer);
  let offset = 0;

  const ensure = (need: number): void => {
    if (offset + need <= bytes.length) return;
    const larger = new Uint8Array(Math.max(bytes.length * 2, offset + need));
    larger.set(bytes);
    bytes = larger;
    view = new DataView(larger.buffer);
  };

  const raw = (value: Uint8Array): void => {
    ensure(value.length);
    bytes.set(value, offset);
    offset += value.length;
  };

  return {
    bytes: () => bytes.slice(0, offset),
    u8(v) { ensure(1); view.setUint8(offset, v & 0xff); offset += 1; },
    u16(v) { ensure(2); view.setUint16(offset, v & 0xffff, true); offset += 2; },
    i16(v) { ensure(2); view.setInt16(offset, v, true); offset += 2; },
    u32(v) { ensure(4); view.setUint32(offset, v >>> 0, true); offset += 4; },
    f32(v) { ensure(4); view.setFloat32(offset, v, true); offset += 4; },
    str(v) {
      const encoded = new TextEncoder().encode(v);
      this.u8(Math.min(255, encoded.length));
      raw(encoded);
    }
  };
}

export function createReader(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;
  return {
    get done() { return offset >= data.length; },
    tell: () => offset,
    u8: () => view.getUint8(offset++),
    u16: () => { const v = view.getUint16(offset, true); offset += 2; return v; },
    i16: () => { const v = view.getInt16(offset, true); offset += 2; return v; },
    u32: () => { const v = view.getUint32(offset, true); offset += 4; return v; },
    f32: () => { const v = view.getFloat32(offset, true); offset += 4; return v; },
    str: () => {
      const length = view.getUint8(offset++);
      const text = new TextDecoder().decode(data.subarray(offset, offset + length));
      offset += length;
      return text;
    }
  };
}

const q = (v: number): number => Math.round(v * POS_SCALE);

export function encodeInput(cmd: InputCmd): Uint8Array {
  const w = createWriter(16);
  w.u8(cmd.seq);
  w.i16(cmd.mx);
  w.i16(cmd.my);
  w.i16(cmd.ax);
  w.i16(cmd.ay);
  w.u8((cmd.attack << 2) | (cmd.grab << 1) | cmd.build);
  w.u8(cmd.zoom + 1);
  return w.bytes();
}

export function decodeInput(data: Uint8Array): InputCmd {
  const r = createReader(data);
  const seq = r.u8();
  const mx = r.i16();
  const my = r.i16();
  const ax = r.i16();
  const ay = r.i16();
  const buttons = r.u8();
  return {
    seq,
    mx,
    my,
    ax,
    ay,
    attack: ((buttons >> 2) & 1) as 0 | 1,
    grab: ((buttons >> 1) & 1) as 0 | 1,
    build: (buttons & 1) as 0 | 1,
    zoom: r.u8() - 1
  };
}

export function encodeSnapshot(w: World): Uint8Array {
  const writer = createWriter(1024);
  writer.u32(w.tick);
  writer.f32(w.clock);
  writer.u8((w.over ? 1 : 0) | (w.winner ? TEAM_INDEX.get(w.winner)! << 1 : 0));
  writer.u32(w.rngWorld.state());

  let eliminatedBits = 0;
  TEAM_IDS.forEach((team, i) => { if (w.eliminated[team]) eliminatedBits |= 1 << i; });
  writer.u8(eliminatedBits);
  for (const team of TEAM_IDS) writer.u8(w.pads[team]);
  for (const team of TEAM_IDS) writer.u16(Math.round(w.bunkerHp[team]));

  writer.u8(Math.min(255, w.buddies.length));
  for (const b of w.buddies) {
    writer.u16(b.id);
    writer.u8((TEAM_INDEX.get(b.team)! << 2) | BUDDY_CLASSES.indexOf(b.cls));
    writer.i16(q(b.x));
    writer.i16(q(b.z));
    writer.i16(q(b.heading));
    writer.u8(Math.min(255, Math.round(b.hp)));
    writer.u8(Math.min(255, b.maxHp));
    writer.u8(STATE_IDS.indexOf(b.state));
    writer.u8(WEAPON_IDS.indexOf(b.weapon as typeof WEAPON_IDS[number]));
    writer.u16(b.carryCrate);
    writer.u8(b.grenades);
    writer.u8(b.rockets);
    writer.u8(b.medkits);
    writer.u8(b.isBot ? 1 : 0);
  }

  writer.u8(Math.min(255, w.crates.length));
  for (const c of w.crates) {
    writer.u16(c.id);
    writer.i16(q(c.x));
    writer.i16(q(c.y));
    writer.i16(q(c.z));
    writer.i16(q(c.spin));
    writer.u8(CRATE_STATE_IDS.indexOf(c.state) | ((c.padTeam === null ? 7 : TEAM_INDEX.get(c.padTeam)!) << 3));
    writer.u16(c.heldBy);
    writer.u8(Math.max(-1, c.padSlot) + 1);
  }

  writer.u8(Math.min(255, w.projectiles.length));
  for (const p of w.projectiles) {
    writer.u16(p.id);
    writer.u8(KIND_IDS.indexOf(p.kind));
    writer.i16(q(p.x));
    writer.i16(q(p.y));
    writer.i16(q(p.z));
    writer.i16(q(p.vx));
    writer.i16(q(p.vz));
    writer.u8(p.team === undefined ? 0 : TEAM_INDEX.get(p.team)!);
  }

  writer.u8(Math.min(255, w.tanks.length));
  for (const t of w.tanks) {
    writer.u16(t.id);
    writer.u8(TEAM_INDEX.get(t.team)!);
    writer.i16(q(t.x));
    writer.i16(q(t.z));
    writer.i16(q(t.heading));
    writer.i16(q(t.turretAngle));
    writer.u16(Math.round(t.hp));
    writer.u16(t.driver);
  }

  return writer.bytes();
}

export interface Snapshot {
  tick: number;
  clock: number;
  over: boolean;
  winner: TeamId | null;
  rngState: number;
  eliminated: Record<TeamId, boolean>;
  pads: Record<TeamId, number>;
  bunkerHp: Record<TeamId, number>;
  buddies: Array<{
    id: EntityId; team: TeamId; cls: BuddyClass; x: number; z: number; heading: number;
    hp: number; maxHp: number; state: typeof STATE_IDS[number]; weapon: typeof WEAPON_IDS[number];
    carryCrate: EntityId; grenades: number; rockets: number; medkits: number; isBot: boolean;
  }>;
  crates: Array<{
    id: EntityId; x: number; y: number; z: number; spin: number;
    state: typeof CRATE_STATE_IDS[number]; heldBy: EntityId; padTeam: TeamId | null; padSlot: number;
  }>;
  projectiles: Array<{ id: EntityId; kind: ProjectileKind; x: number; y: number; z: number; vx: number; vz: number; team: TeamId }>;
  tanks: Array<{ id: EntityId; team: TeamId; x: number; z: number; heading: number; turret: number; hp: number; driver: EntityId }>;
}

const unscale = (v: number): number => v / POS_SCALE;

export function decodeSnapshot(data: Uint8Array): Snapshot {
  const r = createReader(data);
  const tick = r.u32();
  const clock = r.f32();
  const flags = r.u8();
  const rngState = r.u32();
  const eliminatedBits = r.u8();
  const pads = {} as Record<TeamId, number>;
  const bunkerHp = {} as Record<TeamId, number>;
  const eliminated = {} as Record<TeamId, boolean>;
  for (const team of TEAM_IDS) pads[team] = r.u8();
  for (const team of TEAM_IDS) bunkerHp[team] = r.u16();
  for (const i in TEAM_IDS) eliminated[TEAM_BY_INDEX[i]] = (eliminatedBits & (1 << Number(i))) !== 0;

  const buddyCount = r.u8();
  const buddies: Snapshot['buddies'] = [];
  for (let i = 0; i < buddyCount; i++) {
    const id = r.u16() as EntityId;
    const packed = r.u8();
    const x = unscale(r.i16());
    const z = unscale(r.i16());
    const heading = unscale(r.i16());
    const hp = r.u8();
    const maxHp = r.u8();
    const stateByte = r.u8();
    const weaponByte = r.u8();
    const carryCrate = r.u16() as EntityId;
    const grenades = r.u8();
    const rockets = r.u8();
    const medkits = r.u8();
    const isBot = r.u8() === 1;
    buddies.push({
      id,
      team: TEAM_BY_INDEX[packed >> 2],
      cls: BUDDY_CLASSES[packed & 3],
      x, z, heading, hp, maxHp,
      state: STATE_IDS[stateByte] ?? 'idle',
      weapon: WEAPON_IDS[weaponByte] ?? 'none',
      carryCrate, grenades, rockets, medkits, isBot
    });
  }

  const crateCount = r.u8();
  const crates: Snapshot['crates'] = [];
  for (let i = 0; i < crateCount; i++) {
    const id = r.u16() as EntityId;
    const x = unscale(r.i16());
    const y = unscale(r.i16());
    const z = unscale(r.i16());
    const spin = unscale(r.i16());
    const packed = r.u8();
    const teamIndex = packed >> 3;
    const heldBy = r.u16() as EntityId;
    const slot = r.u8() - 1;
    crates.push({
      id, x, y, z, spin,
      state: CRATE_STATE_IDS[packed & 7] ?? 'loose',
      heldBy,
      padTeam: teamIndex === 7 ? null : TEAM_BY_INDEX[teamIndex],
      padSlot: slot
    });
  }

  const projectileCount = r.u8();
  const projectiles: Snapshot['projectiles'] = [];
  for (let i = 0; i < projectileCount; i++) {
    const id = r.u16() as EntityId;
    const kindIndex = r.u8();
    const x = unscale(r.i16());
    const y = unscale(r.i16());
    const z = unscale(r.i16());
    const vx = unscale(r.i16());
    const vz = unscale(r.i16());
    const teamIndex = r.u8();
    projectiles.push({ id, kind: KIND_IDS[kindIndex] ?? 'shell', x, y, z, vx, vz, team: TEAM_BY_INDEX[teamIndex] });
  }

  const tankCount = r.u8();
  const tanks: Snapshot['tanks'] = [];
  for (let i = 0; i < tankCount; i++) {
    const id = r.u16() as EntityId;
    const teamIndex = r.u8();
    const x = unscale(r.i16());
    const z = unscale(r.i16());
    const heading = unscale(r.i16());
    const turret = unscale(r.i16());
    const hp = r.u16();
    const driver = r.u16() as EntityId;
    tanks.push({ id, team: TEAM_BY_INDEX[teamIndex], x, z, heading, turret, hp, driver });
  }

  return {
    tick, clock,
    over: (flags & 1) === 1,
    winner: flags >> 1 === 0 ? null : TEAM_BY_INDEX[(flags >> 1) & 3],
    rngState, eliminated, pads, bunkerHp, buddies, crates, projectiles, tanks
  };
}

export function applySnapshot(world: World, snapshot: Snapshot): void {
  world.tick = snapshot.tick;
  world.clock = snapshot.clock;
  world.over = snapshot.over;
  world.winner = snapshot.winner;
  world.rngWorld.setState(snapshot.rngState);
  for (const team of TEAM_IDS) {
    world.pads[team] = snapshot.pads[team];
    world.bunkerHp[team] = snapshot.bunkerHp[team];
    world.eliminated[team] = snapshot.eliminated[team];
  }

  world.buddies.length = 0;
  for (const b of snapshot.buddies) {
    world.buddies.push({
      id: b.id, team: b.team, cls: b.cls, x: b.x, z: b.z, prevX: b.x, prevZ: b.z,
      vx: 0, vz: 0, kx: 0, kz: 0, heading: b.heading, prevHeading: b.heading,
      hp: b.hp, maxHp: b.maxHp, state: b.state, weapon: b.weapon,
      grenades: b.grenades, rockets: b.rockets, medkits: b.medkits,
      carryCrate: b.carryCrate, koTimer: 0, fireCooldown: 0, invuln: 0,
      isBot: b.isBot, ownedByPlayer: b.id === world.localPlayer, remove: false,
      meleeTimer: 0, shieldHp: 0, shieldTimer: 0, fireTimer: 0, speedTimer: 0, bombBonus: 0
    });
  }

  world.crates.length = 0;
  for (const c of snapshot.crates) {
    world.crates.push({
      id: c.id, x: c.x, y: c.y, z: c.z, prevX: c.x, prevY: c.y, prevZ: c.z,
      vx: 0, vy: 0, vz: 0, spin: c.spin, spinZ: 0,
      state: c.state, heldBy: c.heldBy, padTeam: c.padTeam, padSlot: c.padSlot,
      claimTeam: null, settled: 0, dead: false
    });
  }

  world.projectiles.length = 0;
  for (const p of snapshot.projectiles) {
    world.projectiles.push({
      id: p.id, kind: p.kind, team: p.team, owner: NO_ENTITY as EntityId,
      x: p.x, y: p.y, z: p.z, vx: p.vx, vy: 0, vz: p.vz,
      fuse: 1, damage: 0, radius: 1, dead: false
    });
  }

  world.tanks.length = 0;
  for (const t of snapshot.tanks) {
    world.tanks.push({
      id: t.id, team: t.team, x: t.x, z: t.z, prevX: t.x, prevZ: t.z,
      heading: t.heading, prevHeading: t.heading,
      turretAngle: t.turret, prevTurretAngle: t.turret,
      hp: t.hp, maxHp: 600, driver: t.driver, fireCooldown: 0, destroyed: t.hp <= 0
    });
  }
}

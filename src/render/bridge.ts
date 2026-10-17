import * as THREE from 'three';
import { buildArena, type Arena } from './arena';
import { ChibiField, type ActorView } from './chibi';
import { CrateField, PlacementGhost, ThrowArc, buildRocks, type CrateView } from './props';
import { ProjectileField, type ProjectileView } from './projectiles';
import { ParticlePool, COLOR } from './particles';
import { TankField, type TankView } from './tanks';
import { createMaterials, type SharedMaterials } from './materials';
import { ObstacleField, type ObstacleView, type PowerUpView } from './obstacles';
import { brickStageOf, type BiomeKind } from '../sim/domain/obstacles';
import { findBestSlot, padOrigin, slotPosition } from '../sim/domain/pad';
import { CRATE_SIZE, PAD } from '../sim/domain/constants';
import { distance } from '../sim/domain/buddy';
import { throwPreview } from '../sim/domain/crate';
import { CLASS_STATS } from '../sim/domain/classes';
import { TEAM_COLORS } from '../sim/domain/teams';
import type { IsoCamera } from './camera';
import type { World } from '../sim/core/world';
import type { SimEvent } from '../sim/core/events';
import type { EntityId } from '../sim/core/ids';
import { NO_ENTITY } from '../sim/core/ids';
import { BUDGET } from './budget';
import { blastWorthFreezing, createHitStop } from './hitstop';
import { SpriteStage } from './spriteStage';

interface Interpolated {
  x: number;
  z: number;
  heading: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function lerpAngle(a: number, b: number, t: number): number {
  const delta = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + delta * t;
}

const EMPTY_WORLD_STANDIN = { buddies: [], localPlayer: 0 as EntityId } as unknown as World;

const FLASH_S = 0.06;
const POP_S = 0.18;

export interface FeelOptions {
  coarsePointer: boolean;
  reducedMotion: boolean;
}

const defaultFeel = (): FeelOptions => ({ coarsePointer: false, reducedMotion: false });

export class WorldRenderer {
  private materials: SharedMaterials;
  private arena: Arena;
  private chibi: ChibiField;
  private crates: CrateField;
  private rocks: THREE.InstancedMesh;
  private projectiles: ProjectileField;
  private particles: ParticlePool;
  private tanks: TankField;
  private obstacles: ObstacleField;
  private ghost: PlacementGhost;
  private arc: ThrowArc;
  private flashUntil = new Map<EntityId, number>();
  private airborne = new Set<EntityId>();
  private effectCounts = new Map<string, number>();
  private popUntil = new Map<EntityId, number>();
  private arcLast: { x: number; z: number; heading: number; force: number } = {
    x: Number.NaN, z: 0, heading: 0, force: 0
  };
  private camera: IsoCamera | null = null;
  private clock = 0;
  private lastFrameMs = 16;
  private hitStop = createHitStop();
  private prev = new Map<EntityId, Interpolated>();
  private lastPos = new Map<EntityId, Interpolated>();
  private currPos = new Map<EntityId, Interpolated>();
  private lastTick = -1;
  private spriteStage: SpriteStage;
  private reticle: { x: number; z: number } | null = null;
  private actors: ActorView[] = [];
  private crateViews: CrateView[] = [];
  private projectileViews: ProjectileView[] = [];
  private tankViews: TankView[] = [];
  private obstacleViews: ObstacleView[] = [];
  private powerupViews: PowerUpView[] = [];

  private worldRef: World = EMPTY_WORLD_STANDIN;

  constructor(private scene: THREE.Scene, private feel: () => FeelOptions = defaultFeel) {
    this.spriteStage = new SpriteStage();
    this.materials = createMaterials();
    this.arena = buildArena(this.materials);
    this.chibi = new ChibiField(this.materials);
    this.crates = new CrateField(this.materials);
    this.rocks = buildRocks(this.materials);
    this.projectiles = new ProjectileField(this.materials);
    this.particles = new ParticlePool(this.materials);
    this.tanks = new TankField(this.materials);
    this.obstacles = new ObstacleField(this.materials);
    this.ghost = new PlacementGhost(this.materials);
    this.arc = new ThrowArc();

    scene.add(
      this.arena.group, this.chibi.group, this.crates.mesh, this.rocks,
      this.projectiles.group, this.particles.points, this.tanks.group,
      this.ghost.mesh, this.arc.line, this.obstacles.group
    );
  }

  setBiome(biome: BiomeKind): void {
    this.arena.setBiome?.(biome);
  }

  attachCamera(camera: IsoCamera): void {
    this.camera = camera;
  }

  /** Ground point under the mouse cursor, drawn as a crosshair. Null hides it. */
  setReticle(point: { x: number; z: number } | null): void {
    this.reticle = point;
  }

  /** True while a nearby blast is holding the picture still. The simulation keeps running. */
  frozen(): boolean {
    if (typeof window !== 'undefined' || typeof document !== 'undefined') {
      return false;
    }
    return this.hitStop.frozen(this.clock);
  }

  sync(world: World, alpha: number, time: number, dt: number): void {
    this.worldRef = world;
    this.clock = time;
    this.lastFrameMs = dt * 1000;
    if (world.tick !== this.lastTick) {
      this.lastTick = world.tick;
      this.lastPos.clear();
      for (const [id, pos] of this.currPos) {
        this.lastPos.set(id, pos);
      }
      this.currPos.clear();
      for (const b of world.buddies) {
        this.currPos.set(b.id, { x: b.x, z: b.z, heading: b.heading });
      }
      this.trackLandings(world);
    }
    const t = Math.max(0, Math.min(1, alpha));

    const focus = this.focusOn(world, t);
    if (focus && this.camera && typeof this.camera.follow === 'function') {
      this.camera.follow(focus.x, focus.z, dt);
    }

    this.actors.length = 0;
    for (const b of world.buddies) {
      if (this.actors.length >= BUDGET.buddies) break;
      const fallback = this.lastPos.get(b.id);
      const prevX = (b as { prevX?: number }).prevX ?? fallback?.x ?? b.x;
      const prevZ = (b as { prevZ?: number }).prevZ ?? fallback?.z ?? b.z;
      const prevH = (b as { prevHeading?: number }).prevHeading ?? fallback?.heading ?? b.heading;
      const ix = lerp(prevX, b.x, t);
      const iz = lerp(prevZ, b.z, t);
      const ih = lerpAngle(prevH, b.heading, t);
      this.actors.push({
        id: b.id,
        team: b.team,
        x: ix,
        z: iz,
        heading: ih,
        state: b.state,
        weapon: b.weapon === 'medic' ? 'medic' : (b.weapon as ActorView['weapon']),
        hpRatio: b.hp / b.maxHp,
        phase: (b.id % 17) * 0.37,
        flash: this.decay(this.flashUntil, b.id, time, FLASH_S),
        pop: this.decay(this.popUntil, b.id, time, POP_S),
        melee: (b.meleeTimer ?? 0) / 0.26,
        shield: (b.shieldHp ?? 0) > 0
      });
    }
    this.chibi.sync(this.actors, time);

    this.crateViews.length = 0;
    for (const c of world.crates) {
      const held = c.state === 'held';
      const prevX = (c as { prevX?: number }).prevX ?? c.x;
      const prevY = (c as { prevY?: number }).prevY ?? c.y;
      const prevZ = (c as { prevZ?: number }).prevZ ?? c.z;
      const cx = lerp(prevX, c.x, t);
      const cy = lerp(prevY, c.y, t);
      const cz = lerp(prevZ, c.z, t);
      this.crateViews.push({ x: cx, y: cy, z: cz, spin: c.spin, scale: held ? 0.86 : 1 });
    }
    this.crates.sync(this.crateViews);

    this.projectileViews.length = 0;
    for (const p of world.projectiles) {
      this.projectileViews.push({ kind: p.kind, x: p.x, y: p.y, z: p.z, heading: Math.atan2(p.vx, p.vz) });
    }
    this.projectiles.sync(this.projectileViews);

    this.tankViews.length = 0;
    for (const tank of world.tanks) {
      const prevX = (tank as { prevX?: number }).prevX ?? tank.x;
      const prevZ = (tank as { prevZ?: number }).prevZ ?? tank.z;
      const prevH = (tank as { prevHeading?: number }).prevHeading ?? tank.heading;
      const prevT = (tank as { prevTurretAngle?: number }).prevTurretAngle ?? tank.turretAngle;
      const tx = lerp(prevX, tank.x, t);
      const tz = lerp(prevZ, tank.z, t);
      const th = lerpAngle(prevH, tank.heading, t);
      const tt = lerpAngle(prevT, tank.turretAngle, t);
      this.tankViews.push({
        team: tank.team, x: tx, z: tz, heading: th,
        turret: tt, hpRatio: tank.hp / tank.maxHp
      });
    }
    this.tanks.sync(this.tankViews);

    this.obstacleViews.length = 0;
    const rawObstacles = (world as unknown as { obstacles?: Array<{ kind: 'hard' | 'soft'; hp?: number; maxHp?: number; dead?: boolean; x: number; z: number }> }).obstacles ?? [];
    for (const obs of rawObstacles) {
      if (obs.dead) continue;
      this.obstacleViews.push({
        kind: obs.kind,
        stage: obs.kind === 'hard' ? 'intact' : brickStageOf(obs.hp ?? 3, obs.maxHp ?? 3),
        x: obs.x,
        z: obs.z
      });
    }

    this.powerupViews.length = 0;
    const rawPowerups = (world as unknown as { powerups?: Array<{ kind: PowerUpView['kind']; x: number; y?: number; z: number; spin?: number; dead?: boolean }> }).powerups ?? [];
    for (const pu of rawPowerups) {
      if (pu.dead) continue;
      this.powerupViews.push({
        kind: pu.kind,
        x: pu.x,
        y: pu.y ?? 0.8,
        z: pu.z,
        spin: pu.spin ?? (time * 2.2)
      });
    }
    this.obstacles.sync(this.obstacleViews, this.powerupViews, time);

    this.particles.update(dt);
    this.arena.update(time);
    this.updateCarryAids(world, time);

    this.spriteStage.render(
      world, this.actors, this.crateViews, this.tankViews,
      this.obstacleViews, this.powerupViews, this.projectileViews,
      this.camera ? this.camera.camera : null, time, this.reticle
    );
  }

  /** Preview of the slot a carried crate would fill, or of where a throw lands. */
  private updateCarryAids(world: World, time: number): void {
    this.ghost.hide();
    this.arc.hide();
    const me = world.buddies.find((b) => b.id === world.localPlayer);
    if (!me || me.state === 'ko' || me.carryCrate === (NO_ENTITY as EntityId) || world.eliminated[me.team]) {
      this.arcLast.x = Number.NaN;
      return;
    }

    const origin = padOrigin(me.team);
    const slot = distance(me, origin) < PAD.halfWidth + 2.5
      ? findBestSlot(world.pads[me.team], me.team, me.x, me.z)
      : -1;
    if (slot >= 0) {
      const place = slotPosition(me.team, slot);
      this.ghost.showAt(place.x, place.y, place.z, (Math.sin(time * 4) + 1) / 2);
      this.arcLast.x = Number.NaN;
      return;
    }

    const force = CLASS_STATS[me.cls].throwForce;
    const last = this.arcLast;
    const moved = Math.abs(me.x - last.x) > 0.05 || Math.abs(me.z - last.z) > 0.05
      || Math.abs(me.heading - last.heading) > 0.02;
    if (Number.isNaN(last.x) || force !== last.force || moved) {
      this.arcLast = { x: me.x, z: me.z, heading: me.heading, force };
      this.arc.show(throwPreview(me.x, me.z, me.heading, force), TEAM_COLORS[me.team].css);
      return;
    }
    this.arc.reveal();
  }

  /** How often each feel effect has fired: the effects are invisible to a screenshot. */
  effects(): Record<string, number> {
    return Object.fromEntries(this.effectCounts);
  }

  private mark(effect: string): void {
    this.effectCounts.set(effect, (this.effectCounts.get(effect) ?? 0) + 1);
  }

  /**
   * A crate that has been high and is on the floor now has just landed. The flag
   * rather than the previous sample, because a crate falls about half a metre per
   * tick and would slip through any window comparing two consecutive heights.
   * Vertical speed is not something the snapshot carries to a client, so height is
   * all there is to work from.
   */
  private trackLandings(world: World): void {
    const rest = CRATE_SIZE / 2;
    const live = new Set<EntityId>();
    for (const crate of world.crates) {
      if (crate.state === 'held' || crate.state === 'onPad') {
        this.airborne.delete(crate.id);
        continue;
      }
      live.add(crate.id);
      if (crate.y > rest + 1.2) {
        this.airborne.add(crate.id);
        continue;
      }
      if (!this.airborne.has(crate.id) || crate.y > rest + 0.35) continue;
      this.airborne.delete(crate.id);
      this.mark('crateLanded');
      this.particles.burst(crate.x, 0.15, crate.z, COLOR.dirt, 10, 2.6, 1.1, 0.5);
    }
    for (const id of this.airborne) if (!live.has(id)) this.airborne.delete(id);
  }

  private decay(until: Map<EntityId, number>, id: EntityId, time: number, window: number): number {
    const endsAt = until.get(id);
    if (endsAt === undefined) return 0;
    const left = (endsAt - time) / window;
    if (left <= 0) {
      until.delete(id);
      return 0;
    }
    return left;
  }

  consume(events: SimEvent[]): void {
    for (const event of events) {
      if (this.camera && (event.kind === 'explosion' || event.kind === 'bunkerHit')) {
        const focus = this.focusOn(this.worldRef);
        if (focus) {
          const d = Math.hypot(event.at.x - focus.x, event.at.z - focus.z);
          const strength = Math.max(0, 1 - d / 18) * (event.kind === 'bunkerHit' ? 0.12 : 0.28);
          if (strength > 0.02) this.camera.shake(strength);
          const feel = this.feel();
          if (blastWorthFreezing({
            strength, coarsePointer: feel.coarsePointer, reducedMotion: feel.reducedMotion, frameMs: this.lastFrameMs
          })) {
            this.hitStop.trigger(this.clock);
          }
        }
      }
      const ev = event as unknown as { kind: string; at: { x: number; z: number }; entity?: EntityId };
      switch (ev.kind) {
        case 'explosion':
          this.particles.burst(ev.at.x, 0.6, ev.at.z, COLOR.fire, 26, 7, 1, 0.55);
          this.particles.burst(ev.at.x, 0.4, ev.at.z, COLOR.smoke, 12, 3.4, 0.3, 1.1);
          break;
        case 'damage':
          if (ev.entity !== undefined) this.flashUntil.set(ev.entity, this.clock + FLASH_S);
          this.particles.burst(ev.at.x, 1.1, ev.at.z, COLOR.hit, 7, 3.2, 1.4, 0.32);
          break;
        case 'knockout':
          if (ev.entity !== undefined) this.popUntil.set(ev.entity, this.clock + POP_S);
          this.particles.burst(ev.at.x, 0.9, ev.at.z, COLOR.dirt, 16, 4.4, 1.2, 0.7);
          break;
        case 'despawn':
          if (ev.entity !== undefined) {
            this.flashUntil.delete(ev.entity);
            this.popUntil.delete(ev.entity);
          }
          break;
        case 'heal':
          this.particles.burst(ev.at.x, 1.1, ev.at.z, COLOR.heal, 10, 2.2, -0.25, 0.8);
          break;
        case 'place':
          this.particles.burst(ev.at.x, 0.7, ev.at.z, COLOR.wood, 6, 2.1, 1.2, 0.35);
          break;
        case 'build':
          // The pad is where a crate stops existing, so this is the break the
          // feel list asks splinters for.
          this.mark('crateBroken');
          this.particles.burst(ev.at.x, 1.2, ev.at.z, COLOR.fire, 22, 5, 0.6, 0.9);
          this.particles.burst(ev.at.x, 0.7, ev.at.z, COLOR.wood, 14, 3.4, 1.2, 0.5);
          break;
        case 'melee':
          this.particles.burst(ev.at.x, 0.95, ev.at.z, COLOR.hit, 5, 2.4, 0.8, 0.22);
          break;
        case 'brickHit':
          this.particles.burst(ev.at.x, 0.8, ev.at.z, COLOR.wood, 8, 3.0, 1.2, 0.4);
          break;
        case 'brickBreak':
          this.mark('brickBroken');
          this.particles.burst(ev.at.x, 0.7, ev.at.z, COLOR.wood, 18, 4.2, 1.3, 0.65);
          this.particles.burst(ev.at.x, 0.5, ev.at.z, COLOR.dirt, 10, 2.8, 1.0, 0.5);
          break;
        case 'powerup':
          this.particles.burst(ev.at.x, 0.9, ev.at.z, COLOR.heal, 12, 3.0, -0.2, 0.55);
          break;
        default:
          break;
      }
    }
    this.spriteStage.consume(events, this.clock);
  }

  focusOn(world: World, alpha = 1): { x: number; z: number } | null {
    const target = world.buddies.find((b) => b.id === world.localPlayer && b.state !== 'ko')
      ?? world.buddies.find((b) => b.id === world.localPlayer)
      ?? world.buddies.find((b) => b.team === 'red' && b.state !== 'ko');
    if (!target) return null;
    const t = Math.max(0, Math.min(1, alpha));
    const px = (target as { prevX?: number }).prevX ?? target.x;
    const pz = (target as { prevZ?: number }).prevZ ?? target.z;
    return { x: lerp(px, target.x, t), z: lerp(pz, target.z, t) };
  }

  info(): { calls: number; triangles: number; programs: number; geometries: number; materials: number } | null {
    return null;
  }

  ownedEntity(world: World, id: EntityId): boolean {
    return id !== (NO_ENTITY as EntityId) && world.buddies.some((b) => b.id === id);
  }

  dispose(): void {
    this.spriteStage.dispose();
    this.scene.remove(
      this.arena.group, this.chibi.group, this.crates.mesh, this.rocks,
      this.projectiles.group, this.particles.points, this.tanks.group,
      this.ghost.mesh, this.arc.line, this.obstacles.group
    );
    this.ghost.dispose();
    this.arena.dispose();
    this.chibi.dispose();
    this.crates.dispose();
    this.projectiles.dispose();
    this.particles.dispose();
    this.tanks.dispose();
    this.obstacles.dispose();
    this.rocks.geometry.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
  }
}

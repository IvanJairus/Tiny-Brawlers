import * as THREE from 'three';
import { buildArena, type Arena } from './arena';
import { ChibiField, type ActorView } from './chibi';
import { CrateField, PlacementGhost, ThrowArc, buildRocks, type CrateView } from './props';
import { ProjectileField, type ProjectileView } from './projectiles';
import { ParticlePool, COLOR } from './particles';
import { TankField, type TankView } from './tanks';
import { createMaterials, type SharedMaterials } from './materials';
import { findBestSlot, padOrigin, slotPosition } from '../sim/domain/pad';
import { PAD } from '../sim/domain/constants';
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
  private ghost: PlacementGhost;
  private arc: ThrowArc;
  private flashUntil = new Map<EntityId, number>();
  private popUntil = new Map<EntityId, number>();
  private camera: IsoCamera | null = null;
  private clock = 0;
  private lastFrameMs = 16;
  private hitStop = createHitStop();
  private prev = new Map<EntityId, Interpolated>();
  private lastTick = -1;
  private actors: ActorView[] = [];
  private crateViews: CrateView[] = [];
  private projectileViews: ProjectileView[] = [];
  private tankViews: TankView[] = [];

  private worldRef: World = EMPTY_WORLD_STANDIN;

  constructor(private scene: THREE.Scene, private feel: () => FeelOptions = defaultFeel) {
    this.materials = createMaterials();
    this.arena = buildArena(this.materials);
    this.chibi = new ChibiField(this.materials);
    this.crates = new CrateField(this.materials);
    this.rocks = buildRocks(this.materials);
    this.projectiles = new ProjectileField(this.materials);
    this.particles = new ParticlePool(this.materials);
    this.tanks = new TankField(this.materials);
    this.ghost = new PlacementGhost(this.materials);
    this.arc = new ThrowArc();

    scene.add(
      this.arena.group, this.chibi.group, this.crates.mesh, this.rocks,
      this.projectiles.group, this.particles.points, this.tanks.group,
      this.ghost.mesh, this.arc.line
    );
  }

  attachCamera(camera: IsoCamera): void {
    this.camera = camera;
  }

  /** True while a nearby blast is holding the picture still. The simulation keeps running. */
  frozen(): boolean {
    return this.hitStop.frozen(this.clock);
  }

  sync(world: World, alpha: number, time: number, dt: number): void {
    this.worldRef = world;
    this.clock = time;
    this.lastFrameMs = dt * 1000;
    if (world.tick !== this.lastTick) {
      this.lastTick = world.tick;
      this.prev.clear();
      for (const b of world.buddies) this.prev.set(b.id, { x: b.x, z: b.z, heading: b.heading });
    }
    const t = Math.max(0, Math.min(1, alpha));

    this.actors.length = 0;
    for (const b of world.buddies) {
      if (this.actors.length >= BUDGET.buddies) break;
      const before = this.prev.get(b.id) ?? { x: b.x, z: b.z, heading: b.heading };
      this.actors.push({
        id: b.id,
        team: b.team,
        x: lerp(before.x, b.x, t),
        z: lerp(before.z, b.z, t),
        heading: lerpAngle(before.heading, b.heading, t),
        state: b.state,
        weapon: b.weapon === 'medic' ? 'medic' : (b.weapon as ActorView['weapon']),
        hpRatio: b.hp / b.maxHp,
        phase: (b.id % 17) * 0.37,
        flash: this.decay(this.flashUntil, b.id, time, FLASH_S),
        pop: this.decay(this.popUntil, b.id, time, POP_S)
      });
    }
    this.chibi.sync(this.actors, time);

    this.crateViews.length = 0;
    for (const c of world.crates) {
      const held = c.state === 'held';
      this.crateViews.push({ x: c.x, y: c.y, z: c.z, spin: c.spin, scale: held ? 0.86 : 1 });
    }
    this.crates.sync(this.crateViews);

    this.projectileViews.length = 0;
    for (const p of world.projectiles) {
      this.projectileViews.push({ kind: p.kind, x: p.x, y: p.y, z: p.z, heading: Math.atan2(p.vx, p.vz) });
    }
    this.projectiles.sync(this.projectileViews);

    this.tankViews.length = 0;
    for (const tank of world.tanks) {
      this.tankViews.push({
        team: tank.team, x: tank.x, z: tank.z, heading: tank.heading,
        turret: tank.turretAngle, hpRatio: tank.hp / tank.maxHp
      });
    }
    this.tanks.sync(this.tankViews);

    this.particles.update(dt);
    this.arena.update(time);
    this.updateCarryAids(world, time);
  }

  /** Preview of the slot a carried crate would fill, or of where a throw lands. */
  private updateCarryAids(world: World, time: number): void {
    this.ghost.hide();
    this.arc.hide();
    const me = world.buddies.find((b) => b.id === world.localPlayer);
    if (!me || me.state === 'ko' || me.carryCrate === (NO_ENTITY as EntityId) || world.eliminated[me.team]) {
      return;
    }

    const origin = padOrigin(me.team);
    const slot = distance(me, origin) < PAD.halfWidth + 1.3
      ? findBestSlot(world.pads[me.team], me.team, me.x, me.z)
      : -1;
    if (slot >= 0) {
      const place = slotPosition(me.team, slot);
      this.ghost.showAt(place.x, place.y, place.z, (Math.sin(time * 4) + 1) / 2);
      return;
    }

    const points = throwPreview(me.x, me.z, me.heading, CLASS_STATS[me.cls].throwForce);
    this.arc.show(points, TEAM_COLORS[me.team].css);
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
      switch (event.kind) {
        case 'explosion':
          this.particles.burst(event.at.x, 0.6, event.at.z, COLOR.fire, 26, 7, 1, 0.55);
          this.particles.burst(event.at.x, 0.4, event.at.z, COLOR.smoke, 12, 3.4, 0.3, 1.1);
          break;
        case 'damage':
          this.flashUntil.set(event.entity, this.clock + FLASH_S);
          this.particles.burst(event.at.x, 1.1, event.at.z, COLOR.hit, 7, 3.2, 1.4, 0.32);
          break;
        case 'knockout':
          this.popUntil.set(event.entity, this.clock + POP_S);
          this.particles.burst(event.at.x, 0.9, event.at.z, COLOR.dirt, 16, 4.4, 1.2, 0.7);
          break;
        case 'despawn':
          this.flashUntil.delete(event.entity);
          this.popUntil.delete(event.entity);
          break;
        case 'heal':
          this.particles.burst(event.at.x, 1.1, event.at.z, COLOR.heal, 10, 2.2, -0.25, 0.8);
          break;
        case 'place':
          this.particles.burst(event.at.x, 0.7, event.at.z, COLOR.wood, 6, 2.1, 1.2, 0.35);
          break;
        case 'build':
          this.particles.burst(event.at.x, 1.2, event.at.z, COLOR.fire, 22, 5, 0.6, 0.9);
          break;
        default:
          break;
      }
    }
  }

  focusOn(world: World): { x: number; z: number } | null {
    const target = world.buddies.find((b) => b.id === world.localPlayer && b.state !== 'ko')
      ?? world.buddies.find((b) => b.id === world.localPlayer)
      ?? world.buddies.find((b) => b.team === 'red' && b.state !== 'ko');
    return target ? { x: target.x, z: target.z } : null;
  }

  info(): { calls: number; triangles: number; programs: number; geometries: number; materials: number } | null {
    return null;
  }

  ownedEntity(world: World, id: EntityId): boolean {
    return id !== (NO_ENTITY as EntityId) && world.buddies.some((b) => b.id === id);
  }

  dispose(): void {
    this.scene.remove(
      this.arena.group, this.chibi.group, this.crates.mesh, this.rocks,
      this.projectiles.group, this.particles.points, this.tanks.group
    );
    this.ghost.dispose();
    this.arena.dispose();
    this.chibi.dispose();
    this.crates.dispose();
    this.projectiles.dispose();
    this.particles.dispose();
    this.tanks.dispose();
    this.rocks.geometry.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
  }
}

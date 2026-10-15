import * as THREE from 'three';
import { buildArena, type Arena } from './arena';
import { ChibiField, type ActorView } from './chibi';
import { CrateField, buildRocks, type CrateView } from './props';
import { ProjectileField, type ProjectileView } from './projectiles';
import { ParticlePool, COLOR } from './particles';
import { TankField, type TankView } from './tanks';
import { createMaterials, type SharedMaterials } from './materials';
import type { World } from '../sim/core/world';
import type { SimEvent } from '../sim/core/events';
import type { EntityId } from '../sim/core/ids';
import { NO_ENTITY } from '../sim/core/ids';
import { BUDGET } from './budget';

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

export class WorldRenderer {
  private materials: SharedMaterials;
  private arena: Arena;
  private chibi: ChibiField;
  private crates: CrateField;
  private rocks: THREE.InstancedMesh;
  private projectiles: ProjectileField;
  private particles: ParticlePool;
  private tanks: TankField;
  private prev = new Map<EntityId, Interpolated>();
  private lastTick = -1;
  private actors: ActorView[] = [];
  private crateViews: CrateView[] = [];
  private projectileViews: ProjectileView[] = [];
  private tankViews: TankView[] = [];

  constructor(private scene: THREE.Scene) {
    this.materials = createMaterials();
    this.arena = buildArena(this.materials);
    this.chibi = new ChibiField(this.materials);
    this.crates = new CrateField(this.materials);
    this.rocks = buildRocks(this.materials);
    this.projectiles = new ProjectileField(this.materials);
    this.particles = new ParticlePool(this.materials);
    this.tanks = new TankField(this.materials);

    scene.add(this.arena.group, this.chibi.group, this.crates.mesh, this.rocks, this.projectiles.group, this.particles.points, this.tanks.group);
  }

  sync(world: World, alpha: number, time: number, dt: number): void {
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
        phase: (b.id % 17) * 0.37
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
  }

  consume(events: SimEvent[]): void {
    for (const event of events) {
      switch (event.kind) {
        case 'explosion':
          this.particles.burst(event.at.x, 0.6, event.at.z, COLOR.fire, 26, 7, 1, 0.55);
          this.particles.burst(event.at.x, 0.4, event.at.z, COLOR.smoke, 12, 3.4, 0.3, 1.1);
          break;
        case 'damage':
          this.particles.burst(event.at.x, 1.1, event.at.z, COLOR.hit, 7, 3.2, 1.4, 0.32);
          break;
        case 'knockout':
          this.particles.burst(event.at.x, 0.9, event.at.z, COLOR.dirt, 16, 4.4, 1.2, 0.7);
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

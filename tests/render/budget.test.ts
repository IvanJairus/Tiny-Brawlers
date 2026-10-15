import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildArena } from '../../src/render/arena';
import { ChibiField, type ActorView } from '../../src/render/chibi';
import { CrateField, buildRocks, type CrateView } from '../../src/render/props';
import { ProjectileField, PROJECTILE_MODELS, type ProjectileView } from '../../src/render/projectiles';
import { ParticlePool } from '../../src/render/particles';
import { TankField, type TankView } from '../../src/render/tanks';
import { createMaterials } from '../../src/render/materials';
import { BUDGET, overBudget } from '../../src/render/budget';
import { TEAM_IDS, type TeamId } from '../../src/sim/domain/teams';
import type { ProjectileKind } from '../../src/sim/domain/projectile';

function sceneCounters(scene: THREE.Scene) {
  const geometries = new Set<string>();
  const materials = new Set<string>();
  let triangles = 0;
  let meshes = 0;
  scene.traverse((object) => {
    const drawable = object as Partial<THREE.Mesh> & Partial<THREE.Points>;
    if (!drawable.isMesh && !drawable.isPoints) return;
    meshes++;
    const geo = drawable.geometry;
    if (!geo) return;
    geometries.add(geo.uuid);
    const material = drawable.material as THREE.Material | THREE.Material[];
    if (Array.isArray(material)) for (const m of material) materials.add(m.uuid);
    else materials.add(material.uuid);
    const index = geo.index;
    const count = index ? index.count : (geo.attributes.position?.count ?? 0);
    const instanced = object as unknown as THREE.InstancedMesh;
    triangles += (count / 3) * (instanced.isInstancedMesh ? instanced.count : 1);
  });
  return { calls: meshes, triangles: Math.round(triangles), programs: 0, geometries: geometries.size, materials: materials.size };
}

function actors(n: number): ActorView[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    team: TEAM_IDS[i % 4] as TeamId,
    x: (i % 7) - 3,
    z: (i % 5) - 2,
    heading: i * 0.4,
    state: (['idle', 'walk', 'carry', 'ko', 'celebrate'] as const)[i % 5],
    weapon: (['none', 'pistol', 'shotgun', 'grenade', 'bazooka', 'medic'] as const)[i % 6],
    hpRatio: 1,
    phase: i * 0.3
  }));
}

describe('render budget', () => {
  const materials = createMaterials();
  const scene = new THREE.Scene();
  const arena = buildArena(materials);
  const chibi = new ChibiField(materials);
  const crates = new CrateField(materials);
  const rocks = buildRocks(materials);
  const projectiles = new ProjectileField(materials);
  const particles = new ParticlePool(materials);
  const tanks = new TankField(materials);
  scene.add(arena.group, chibi.group, crates.mesh, rocks, projectiles.group, particles.points, tanks.group);

  const crateViews: CrateView[] = Array.from({ length: 24 }, (_, i) => ({ x: i, y: 0.45, z: 0, spin: 0, scale: 1 }));
  const projectileViews: ProjectileView[] = (Object.keys(PROJECTILE_MODELS) as ProjectileKind[]).flatMap((kind, i) =>
    Array.from({ length: 12 }, (_, j) => ({ kind, x: i, y: 1, z: j, heading: 0 })));
  const tankViews: TankView[] = Array.from({ length: 4 }, (_, i) => ({
    team: TEAM_IDS[i] as TeamId, x: i, z: i, heading: 0, turret: 0, hpRatio: 1
  }));

  chibi.sync(actors(BUDGET.buddies), 1);
  crates.sync(crateViews);
  projectiles.sync(projectileViews);
  tanks.sync(tankViews);

  it('stays inside the phone budget with a full battlefield on screen', () => {
    const counters = sceneCounters(scene);
    expect(overBudget(counters), JSON.stringify(counters)).toEqual([]);
    expect(counters.calls).toBeLessThanOrEqual(BUDGET.drawCalls);
  });

  it('draws only the instances that exist', () => {
    const empty = new THREE.Scene();
    const mats = createMaterials();
    const field = new ChibiField(mats);
    empty.add(field.group);
    field.sync([], 0);
    let drawn = 0;
    empty.traverse((o) => {
      const mesh = o as unknown as THREE.InstancedMesh;
      if (mesh.isInstancedMesh) drawn += mesh.count;
    });
    expect(drawn).toBe(0);
    field.sync(actors(3), 0);
    drawn = 0;
    empty.traverse((o) => {
      const mesh = o as unknown as THREE.InstancedMesh;
      if (mesh.isInstancedMesh) drawn += mesh.count;
    });
    expect(drawn).toBeGreaterThan(0);
    expect(drawn).toBeLessThanOrEqual(BUDGET.buddies * 6);
  });

  it('keeps the whole arena in one static mesh', () => {
    let staticMeshes = 0;
    arena.group.traverse((o) => {
      if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) staticMeshes++;
    });
    expect(staticMeshes).toBeLessThanOrEqual(3);
  });

  it('gives every damage source a model', () => {
    const kinds: ProjectileKind[] = ['grenade', 'rocket', 'shell'];
    for (const kind of kinds) {
      expect(PROJECTILE_MODELS[kind], `${kind} has no model`).toBeTypeOf('function');
      const parts = PROJECTILE_MODELS[kind]();
      expect(parts.length).toBeGreaterThan(0);
    }
  });

  it('never exceeds instance capacity when the battlefield is crowded', () => {
    expect(() => chibi.sync(actors(BUDGET.buddies + 12), 2)).not.toThrow();
    expect(() => crates.sync(Array.from({ length: 60 }, () => ({ x: 0, y: 1, z: 0, spin: 0, scale: 1 })))).not.toThrow();
    expect(() => projectiles.sync(Array.from({ length: 90 }, () => ({ kind: 'shell' as ProjectileKind, x: 0, y: 1, z: 0, heading: 0 })))).not.toThrow();
    const counters = sceneCounters(scene);
    expect(overBudget(counters), JSON.stringify(counters)).toEqual([]);
  });

  it('draws every buddy from the same merged meshes', () => {
    const field = new ChibiField(createMaterials());
    const meshes = field.group.children.length;
    field.sync(actors(1), 0);
    field.sync(actors(BUDGET.buddies), 0);

    const body = field.group.children[0] as THREE.InstancedMesh;
    expect(body.isInstancedMesh).toBe(true);
    expect(meshes).toBeLessThanOrEqual(13);
    expect(body.geometry.attributes.position.count).toBeGreaterThan(24);
    expect(field.group.children.length).toBe(meshes);
  });
});

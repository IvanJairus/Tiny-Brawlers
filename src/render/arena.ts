import * as THREE from 'three';
import { mergeParts, type Part } from './geometryKit';
import { PALETTE, type SharedMaterials } from './materials';
import { ARENA_HALF, BASE_COORDINATES, PAD } from '../sim/domain/constants';
import { TEAM_COLORS, TEAM_IDS, type TeamId } from '../sim/domain/teams';

export interface Arena {
  group: THREE.Group;
  update(time: number): void;
  dispose(): void;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);

function islandParts(): Part[] {
  const parts: Part[] = [
    { geometry: box(ARENA_HALF * 2, 0.5, ARENA_HALF * 2), color: PALETTE.grass, position: [0, -0.25, 0] },
    { geometry: box(62, 2.2, 62), color: PALETTE.cliff, position: [0, -1.35, 0] }
  ];

  for (const [x, z, rotY, len] of [
    [0, -ARENA_HALF, 0, ARENA_HALF * 2],
    [0, ARENA_HALF, 0, ARENA_HALF * 2],
    [-ARENA_HALF, 0, Math.PI / 2, ARENA_HALF * 2],
    [ARENA_HALF, 0, Math.PI / 2, ARENA_HALF * 2]
  ] as const) {
    parts.push({
      geometry: cyl(0.42, 0.42, len, 8),
      color: PALETTE.grassDark,
      position: [x, -0.06, z],
      rotation: [0, 0, Math.PI / 2 + rotY]
    });
  }

  for (const team of TEAM_IDS) {
    const base = BASE_COORDINATES[team];
    const angle = Math.atan2(base.z, base.x);
    const length = Math.hypot(base.x, base.z) - 7.5;
    parts.push({
      geometry: box(length, 0.06, 2.2),
      color: PALETTE.path,
      position: [Math.cos(angle) * length * 0.5 + base.x * 0.24, 0.03, Math.sin(angle) * length * 0.5 + base.z * 0.24],
      rotation: [0, -angle, 0]
    });
  }

  return parts;
}

function bunkerParts(team: TeamId): Part[] {
  const base = BASE_COORDINATES[team];
  const towardCentre = Math.atan2(-base.z, -base.x);
  const colour = TEAM_COLORS[team].hex;
  const at = (x: number, y: number, z: number): [number, number, number] => [base.x + x, y, base.z + z];

  const parts: Part[] = [
    { geometry: box(7.2, 2.6, 7.2), color: PALETTE.concrete, position: at(0, 1.3, 0) },
    { geometry: box(7.8, 0.5, 7.8), color: colour, position: at(0, 2.75, 0) },
    { geometry: box(7.4, 1.1, 0.5), color: PALETTE.concrete, position: at(0, 3.3, -3.5) },
    { geometry: box(7.4, 1.1, 0.5), color: PALETTE.concrete, position: at(0, 3.3, 3.5) },
    { geometry: box(0.5, 1.1, 7.4), color: PALETTE.concrete, position: at(-3.5, 3.3, 0) },
    { geometry: box(0.5, 1.1, 7.4), color: PALETTE.concrete, position: at(3.5, 3.3, 0) },
    { geometry: cyl(0.09, 0.09, 3.4, 6), color: PALETTE.metal, position: at(0, 4.6, 0) },
    { geometry: box(1.5, 0.9, 0.08), color: colour, position: at(0.78, 5.5, 0) }
  ];

  // Sandbags read as a stacked wall: flat-sided bags in two offset rows, not
  // loose cylinders scattered around the entrance.
  return parts;
}

function padParts(team: TeamId): Part[] {
  const base = BASE_COORDINATES[team];
  const origin = { x: base.x * 0.66, z: base.z * 0.66 };
  const parts: Part[] = [
    { geometry: box(PAD.halfWidth * 2, 0.12, PAD.halfWidth * 2), color: PALETTE.padSurface, position: [origin.x, 0.09, origin.z] }
  ];
  return parts;
}

function padGlowParts(team: TeamId): Part[] {
  const base = BASE_COORDINATES[team];
  const origin = { x: base.x * 0.66, z: base.z * 0.66 };
  const colour = TEAM_COLORS[team].hex;
  const size = PAD.halfWidth * 2;
  const parts: Part[] = [];
  for (const [w, d, x, z] of [
    [size, 0.18, 0, -PAD.halfWidth + 0.09],
    [size, 0.18, 0, PAD.halfWidth - 0.09],
    [0.18, size, -PAD.halfWidth + 0.09, 0],
    [0.18, size, PAD.halfWidth - 0.09, 0]
  ] as const) {
    parts.push({ geometry: box(w, 0.1, d), color: colour, position: [origin.x + x, 0.16, origin.z + z] });
  }
  parts.push({ geometry: box(size, 0.06, 0.09), color: colour, position: [origin.x, 0.15, origin.z] });
  parts.push({ geometry: box(0.09, 0.06, size), color: colour, position: [origin.x, 0.15, origin.z] });
  return parts;
}

export function buildArena(materials: SharedMaterials): Arena {
  const group = new THREE.Group();
  const disposables: THREE.BufferGeometry[] = [];

  const staticParts = [...islandParts()];
  for (const team of TEAM_IDS) {
    staticParts.push(...bunkerParts(team), ...padParts(team));
  }
  const staticGeo = mergeParts(staticParts);
  disposables.push(staticGeo);
  const staticMesh = new THREE.Mesh(staticGeo, materials.painted);
  staticMesh.name = 'arena_static';
  group.add(staticMesh);

  const glowParts: Part[] = [];
  for (const team of TEAM_IDS) glowParts.push(...padGlowParts(team));
  const glowGeo = mergeParts(glowParts);
  disposables.push(glowGeo);
  const glowMesh = new THREE.Mesh(glowGeo, materials.padGlow);
  glowMesh.name = 'arena_pad_glow';
  group.add(glowMesh);

  const waterGeo = new THREE.PlaneGeometry(140, 140, 28, 28);
  disposables.push(waterGeo);
  const water = new THREE.Mesh(waterGeo, materials.water);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -1.6;
  water.name = 'arena_water';
  group.add(water);

  return {
    group,
    update(time: number) {
      materials.water.uniforms.uTime.value = time;
      const pulse = 0.55 + Math.sin(time * 2.4) * 0.25;
      materials.padGlow.opacity = pulse;
    },
    dispose() {
      for (const geo of disposables) geo.dispose();
    }
  };
}

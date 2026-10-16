import * as THREE from 'three';
import { mergeParts, type Part } from './geometryKit';
import { BIOME_PALETTE, PALETTE, type SharedMaterials } from './materials';
import { ARENA_HALF, BASE_COORDINATES, PAD } from '../sim/domain/constants';
import { padOrigin } from '../sim/domain/pad';
import { TEAM_COLORS, TEAM_IDS, type TeamId } from '../sim/domain/teams';

export interface Arena {
  group: THREE.Group;
  update(time: number): void;
  dispose(): void;
  setBiome?(biome: 'rumput' | 'gurun' | 'salju'): void;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);

const PLAZA_RADIUS = 7.6;

function islandParts(biome: 'rumput' | 'gurun' | 'salju' = 'rumput'): Part[] {
  const theme = BIOME_PALETTE[biome] ?? BIOME_PALETTE.rumput;
  const parts: Part[] = [
    { geometry: box(ARENA_HALF * 2, 0.5, ARENA_HALF * 2), color: theme.top, position: [0, -0.25, 0] },
    { geometry: box(62, 2.2, 62), color: theme.cliff, position: [0, -1.35, 0] }
  ];

  for (const [x, z, rotY, len] of [
    [0, -ARENA_HALF, 0, ARENA_HALF * 2],
    [0, ARENA_HALF, 0, ARENA_HALF * 2],
    [-ARENA_HALF, 0, Math.PI / 2, ARENA_HALF * 2],
    [ARENA_HALF, 0, Math.PI / 2, ARENA_HALF * 2]
  ] as const) {
    parts.push({
      geometry: cyl(0.42, 0.42, len, 8),
      color: theme.rim,
      position: [x, -0.06, z],
      rotation: [0, 0, Math.PI / 2 + rotY]
    });
  }

  // Crates drop in the middle, so the middle is drawn as a plaza and each base is
  // joined to it by one kerbed road. Stone road colors match UHD reference batu_1..4.png.
  parts.push({ geometry: cyl(PLAZA_RADIUS, PLAZA_RADIUS, 0.06, 28), color: PALETTE.stoneRoad, position: [0, 0.03, 0] });
  parts.push({ geometry: cyl(PLAZA_RADIUS - 1.2, PLAZA_RADIUS - 1.2, 0.07, 28), color: PALETTE.stoneRoadDark, position: [0, 0.035, 0] });
  parts.push({ geometry: cyl(2.3, 2.3, 0.08, 20), color: PALETTE.stoneRoad, position: [0, 0.042, 0] });

  for (const team of TEAM_IDS) {
    const base = BASE_COORDINATES[team];
    const angle = Math.atan2(base.x, base.z);
    const radius = Math.hypot(base.x, base.z);
    const from = PLAZA_RADIUS - 0.6;
    const to = radius - 4.6;
    const length = to - from;
    const mid = (from + to) * 0.5;
    const dirX = Math.sin(angle);
    const dirZ = Math.cos(angle);

    parts.push({
      geometry: box(2.6, 0.06, length),
      color: PALETTE.stoneRoad,
      position: [dirX * mid, 0.032, dirZ * mid],
      rotation: [0, angle, 0]
    });
    for (const side of [-1, 1]) {
      parts.push({
        geometry: box(0.3, 0.1, length),
        color: PALETTE.stoneRoadDark,
        position: [dirX * mid + dirZ * 1.45 * side, 0.04, dirZ * mid - dirX * 1.45 * side],
        rotation: [0, angle, 0]
      });
    }
  }

  // 4 cardinal side-pocket plazas
  for (const [px, pz] of [
    [0, -16.5],
    [0, 16.5],
    [-16.5, 0],
    [16.5, 0]
  ] as const) {
    parts.push({ geometry: cyl(2.8, 2.8, 0.06, 16), color: PALETTE.stoneRoad, position: [px, 0.03, pz] });
    parts.push({ geometry: cyl(1.8, 1.8, 0.07, 14), color: PALETTE.path, position: [px, 0.035, pz] });
  }

  // 4 cardinal connector lanes
  parts.push({ geometry: box(2.2, 0.055, 9.4), color: PALETTE.stoneRoad, position: [0, 0.03, -11.8] });
  parts.push({ geometry: box(2.2, 0.055, 9.4), color: PALETTE.stoneRoad, position: [0, 0.03, 11.8] });
  parts.push({ geometry: box(9.4, 0.055, 2.2), color: PALETTE.stoneRoad, position: [-11.8, 0.03, 0] });
  parts.push({ geometry: box(9.4, 0.055, 2.2), color: PALETTE.stoneRoad, position: [11.8, 0.03, 0] });

  // 8 outer flanking road segments connecting base pad area to cardinal pockets
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const baseX = sx * 14;
      const baseZ = sz * 14;
      const targets: ReadonlyArray<readonly [number, number]> = [
        [0, sz * 16.5],
        [sx * 16.5, 0]
      ];
      for (const [tx, tz] of targets) {
        const dx = tx - baseX;
        const dz = tz - baseZ;
        const len = Math.hypot(dx, dz);
        const midX = (baseX + tx) * 0.5;
        const midZ = (baseZ + tz) * 0.5;
        const angle = Math.atan2(dx, dz);
        parts.push({
          geometry: box(1.9, 0.05, len),
          color: PALETTE.pathDark,
          position: [midX, 0.031, midZ],
          rotation: [0, angle, 0]
        });
      }
    }
  }

  // 12 small biome detail accents
  const accents: ReadonlyArray<readonly [number, number]> = [
    [-8, -15], [8, -15], [-8, 15], [8, 15],
    [-15, -8], [15, -8], [-15, 8], [15, 8],
    [-11, -5], [11, -5], [-11, 5], [11, 5]
  ];
  for (const [ax, az] of accents) {
    parts.push({
      geometry: box(0.45, 0.08, 0.45),
      color: theme.accent,
      position: [ax, 0.04, az]
    });
  }

  return parts;
}

/**
 * The bunker is the biggest thing on screen and the only thing a team can lose,
 * so it is built in a local frame with its front facing the plaza: doorway,
 * lintel in team colour, sandbags, corner posts, and two shadow bands that keep
 * the wall from reading as one flat grey plane.
 */
function bunkerParts(team: TeamId): Part[] {
  const base = BASE_COORDINATES[team];
  const dirX = -base.x;
  const dirZ = -base.z;
  const dirLen = Math.hypot(dirX, dirZ) || 1;
  const yaw = Math.atan2(dirX / dirLen, dirZ / dirLen);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const colour = TEAM_COLORS[team].hex;
  const facing: [number, number, number] = [0, yaw, 0];

  const parts: Part[] = [];
  const add = (geometry: THREE.BufferGeometry, color: number, x: number, y: number, z: number): void => {
    parts.push({ geometry, color, position: [base.x + x * cos + z * sin, y, base.z - x * sin + z * cos], rotation: facing });
  };

  add(box(8.4, 0.5, 8.4), PALETTE.concreteDark, 0, 0.25, 0);
  add(box(7.2, 2.4, 7.2), PALETTE.concrete, 0, 1.45, 0);
  add(box(7.36, 0.18, 7.36), PALETTE.concreteDark, 0, 0.95, 0);
  add(box(7.36, 0.18, 7.36), PALETTE.concreteDark, 0, 2.05, 0);

  add(box(1.7, 1.9, 0.24), PALETTE.eyeDark, 0, 1.2, 3.62);
  add(box(2.4, 0.36, 0.36), colour, 0, 2.3, 3.62);
  add(box(7.36, 0.46, 0.14), colour, 0, 2.62, 3.66);

  add(box(7.8, 0.4, 7.8), colour, 0, 2.9, 0);
  add(box(5.2, 0.16, 5.2), PALETTE.concreteDark, 0, 3.1, 0);
  add(box(7.4, 1.0, 0.5), PALETTE.concrete, 0, 3.5, -3.5);
  add(box(7.4, 1.0, 0.5), PALETTE.concrete, 0, 3.5, 3.5);
  add(box(0.5, 1.0, 7.4), PALETTE.concrete, -3.5, 3.5, 0);
  add(box(0.5, 1.0, 7.4), PALETTE.concrete, 3.5, 3.5, 0);
  for (const x of [-3.5, 3.5]) {
    for (const z of [-3.5, 3.5]) add(box(0.78, 1.4, 0.78), colour, x, 3.6, z);
  }

  add(box(1.05, 0.36, 0.6), PALETTE.sand, -0.56, 0.18, 4.6);
  add(box(1.05, 0.36, 0.6), PALETTE.sand, 0.56, 0.18, 4.6);
  add(box(1.05, 0.36, 0.6), PALETTE.sand, 0, 0.54, 4.6);

  parts.push({ geometry: cyl(0.09, 0.09, 3.4, 6), color: PALETTE.metal, position: [base.x, 4.9, base.z] });
  add(box(1.7, 1.0, 0.08), colour, 0.9, 5.8, 0);

  return parts;
}

/**
 * A pad holds eight crates in four quadrants and two layers, which a flat dark
 * quad cannot say. The quadrant tiles, the gaps between them, and the corner
 * posts one crate tall are what make the stack rule visible.
 */
function padParts(team: TeamId): Part[] {
  const origin = padOrigin(team);
  const colour = TEAM_COLORS[team].hex;
  const parts: Part[] = [
    { geometry: box(PAD.halfWidth * 2 + 0.5, 0.1, PAD.halfWidth * 2 + 0.5), color: PALETTE.padSurface, position: [origin.x, 0.05, origin.z] }
  ];

  for (const x of [-PAD.quadrantOffset, PAD.quadrantOffset]) {
    for (const z of [-PAD.quadrantOffset, PAD.quadrantOffset]) {
      parts.push({
        geometry: box(1.86, 0.12, 1.86),
        color: PALETTE.padTile,
        position: [origin.x + x, 0.13, origin.z + z]
      });
    }
  }

  const edge = PAD.halfWidth + 0.12;
  for (const x of [-edge, edge]) {
    for (const z of [-edge, edge]) {
      parts.push({ geometry: box(0.26, 0.92, 0.26), color: colour, position: [origin.x + x, 0.46, origin.z + z] });
    }
  }
  parts.push({ geometry: box(edge * 2, 0.16, 0.2), color: colour, position: [origin.x, 0.1, origin.z - edge] });
  parts.push({ geometry: box(edge * 2, 0.16, 0.2), color: colour, position: [origin.x, 0.1, origin.z + edge] });
  parts.push({ geometry: box(0.2, 0.16, edge * 2), color: colour, position: [origin.x - edge, 0.1, origin.z] });
  parts.push({ geometry: box(0.2, 0.16, edge * 2), color: colour, position: [origin.x + edge, 0.1, origin.z] });

  return parts;
}

function padGlowParts(team: TeamId): Part[] {
  const origin = padOrigin(team);
  const colour = TEAM_COLORS[team].hex;
  const size = PAD.halfWidth * 2;
  const parts: Part[] = [];
  for (const [w, d, x, z] of [
    [size, 0.18, 0, -PAD.halfWidth + 0.09],
    [size, 0.18, 0, PAD.halfWidth - 0.09],
    [0.18, size, -PAD.halfWidth + 0.09, 0],
    [0.18, size, PAD.halfWidth - 0.09, 0]
  ] as const) {
    parts.push({ geometry: box(w, 0.1, d), color: colour, position: [origin.x + x, 0.2, origin.z + z] });
  }
  parts.push({ geometry: box(size, 0.06, 0.09), color: colour, position: [origin.x, 0.19, origin.z] });
  parts.push({ geometry: box(0.09, 0.06, size), color: colour, position: [origin.x, 0.19, origin.z] });
  return parts;
}

function buildStaticParts(biome: 'rumput' | 'gurun' | 'salju'): Part[] {
  const staticParts = [...islandParts(biome)];
  for (const team of TEAM_IDS) {
    staticParts.push(...bunkerParts(team), ...padParts(team));
  }
  return staticParts;
}

export function buildArena(materials: SharedMaterials, biome: 'rumput' | 'gurun' | 'salju' = 'rumput'): Arena {
  const group = new THREE.Group();
  let currentBiome = biome;

  const staticGeo = mergeParts(buildStaticParts(currentBiome));
  const staticMesh = new THREE.Mesh(staticGeo, materials.painted);
  staticMesh.name = 'arena_static';
  group.add(staticMesh);

  const glowParts: Part[] = [];
  for (const team of TEAM_IDS) glowParts.push(...padGlowParts(team));
  const glowGeo = mergeParts(glowParts);
  const glowMesh = new THREE.Mesh(glowGeo, materials.padGlow);
  glowMesh.name = 'arena_pad_glow';
  group.add(glowMesh);

  const waterGeo = new THREE.PlaneGeometry(140, 140, 28, 28);
  const water = new THREE.Mesh(waterGeo, materials.water);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -1.6;
  water.name = 'arena_water';
  group.add(water);

  return {
    group,
    setBiome(newBiome: 'rumput' | 'gurun' | 'salju') {
      if (newBiome === currentBiome) return;
      currentBiome = newBiome;
      const nextGeo = mergeParts(buildStaticParts(newBiome));
      staticMesh.geometry.dispose();
      staticMesh.geometry = nextGeo;
    },
    update(time: number) {
      materials.water.uniforms.uTime.value = time;
      const pulse = 0.55 + Math.sin(time * 2.4) * 0.25;
      materials.padGlow.opacity = pulse;
    },
    dispose() {
      staticMesh.geometry.dispose();
      glowGeo.dispose();
      waterGeo.dispose();
    }
  };
}

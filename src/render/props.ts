import * as THREE from 'three';
import { mergeParts, type Part } from './geometryKit';
import { PALETTE } from './materials';
import type { SharedMaterials } from './materials';
import { BUDGET } from './budget';
import { CRATE_SIZE, ARENA_HALF } from '../sim/domain/constants';

export interface CrateView {
  x: number;
  y: number;
  z: number;
  spin: number;
  scale: number;
}

function crateParts(): Part[] {
  const s = CRATE_SIZE;
  const half = s / 2;
  const parts: Part[] = [{ geometry: new THREE.BoxGeometry(s, s, s), color: PALETTE.wood }];

  const brace = new THREE.BoxGeometry(0.1, s * 1.28, 0.05);
  for (const face of [
    { pos: [0, 0, half + 0.02] as const, rot: [0, 0, 1] as const },
    { pos: [0, 0, -half - 0.02] as const, rot: [0, 0, 1] as const },
    { pos: [half + 0.02, 0, 0] as const, rot: [0, 1, 0] as const },
    { pos: [-half - 0.02, 0, 0] as const, rot: [0, 1, 0] as const },
    { pos: [0, half + 0.02, 0] as const, rot: [1, 0, 0] as const },
    { pos: [0, -half - 0.02, 0] as const, rot: [1, 0, 0] as const }
  ]) {
    parts.push({
      geometry: brace,
      color: PALETTE.woodDark,
      position: [face.pos[0], face.pos[1], face.pos[2]],
      rotation: face.rot[0] ? [Math.PI / 2, face.rot[1] ? Math.PI / 4 : 0, face.rot[2] ? Math.PI / 4 : 0] : [0, face.rot[1] ? Math.PI / 2 : 0, Math.PI / 4]
    });
  }

  const cap = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        parts.push({ geometry: cap, color: PALETTE.metal, position: [sx * half, sy * half, sz * half] });
      }
    }
  }
  return parts;
}

export class CrateField {
  public readonly mesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();

  constructor(materials: SharedMaterials) {
    this.mesh = new THREE.InstancedMesh(mergeParts(crateParts()), materials.painted, BUDGET.crates);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  sync(crates: CrateView[]): void {
    let used = 0;
    for (const crate of crates) {
      if (used >= this.mesh.instanceMatrix.count) break;
      this.dummy.position.set(crate.x, crate.y, crate.z);
      this.dummy.rotation.set(crate.spin, crate.spin * 0.7, crate.spin * 0.3);
      this.dummy.scale.setScalar(crate.scale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(used++, this.dummy.matrix);
    }
    this.mesh.count = used;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }
}

const ROCK_SPOTS: Array<{ x: number; z: number; r: number }> = [
  { x: -26, z: -30, r: 1.2 }, { x: -12, z: -30.5, r: 0.9 }, { x: 4, z: -30.4, r: 1.4 },
  { x: 20, z: -30.8, r: 1.0 }, { x: -22, z: 30.6, r: 1.1 }, { x: -6, z: 30.4, r: 1.3 },
  { x: 10, z: 30.8, r: 0.85 }, { x: 24, z: 30.2, r: 1.2 }, { x: -30.4, z: -24, r: 1.0 },
  { x: -30.2, z: -8, r: 1.35 }, { x: -30.6, z: 8, r: 0.9 }, { x: -30.4, z: 22, r: 1.15 },
  { x: 30.4, z: -20, r: 1.3 }, { x: 30.6, z: -5, r: 0.95 }, { x: 30.2, z: 12, r: 1.25 },
  { x: 30.4, z: 25, r: 1.05 }, { x: -29, z: -29, r: 1.5 }, { x: 29, z: -29, r: 1.4 },
  { x: -29, z: 29, r: 1.45 }, { x: 29, z: 29, r: 1.5 }
];

export function buildRocks(materials: SharedMaterials): THREE.InstancedMesh {
  const geometry = mergeParts([
    { geometry: new THREE.IcosahedronGeometry(1, 0), color: PALETTE.rock, scale: [1.15, 0.8, 0.95] }
  ]);
  const mesh = new THREE.InstancedMesh(geometry, materials.painted, Math.max(ROCK_SPOTS.length, BUDGET.rocks));
  const dummy = new THREE.Object3D();
  ROCK_SPOTS.forEach((spot, i) => {
    dummy.position.set(
      Math.max(-ARENA_HALF + 1, Math.min(ARENA_HALF - 1, spot.x)),
      spot.r * 0.35,
      Math.max(-ARENA_HALF + 1, Math.min(ARENA_HALF - 1, spot.z))
    );
    dummy.rotation.set(i * 0.6, i * 1.1, i * 0.4);
    dummy.scale.setScalar(spot.r);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.count = ROCK_SPOTS.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

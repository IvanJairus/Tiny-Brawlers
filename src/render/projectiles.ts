import * as THREE from 'three';
import { mergeParts, type Part, unitSphere } from './geometryKit';
import { PALETTE } from './materials';
import type { SharedMaterials } from './materials';
import { BUDGET } from './budget';
import type { ProjectileKind } from '../sim/domain/projectile';

export interface ProjectileView {
  kind: ProjectileKind;
  x: number;
  y: number;
  z: number;
  heading: number;
}

/**
 * The previous build had grenades and rockets that existed only as numbers, so
 * area damage landed off screen. A kind with no entry here fails the budget test.
 */
export const PROJECTILE_MODELS: Record<ProjectileKind, () => Part[]> = {
  grenade: () => [
    { geometry: unitSphere(0.17, 10), color: 0x6a9a3c },
    { geometry: new THREE.CylinderGeometry(0.05, 0.05, 0.09, 6), color: PALETTE.metal, position: [0, 0.17, 0] }
  ],
  rocket: () => [
    { geometry: new THREE.CylinderGeometry(0.13, 0.13, 0.66, 10), color: PALETTE.metal, rotation: [Math.PI / 2, 0, 0] },
    { geometry: new THREE.ConeGeometry(0.14, 0.26, 10), color: 0xc0392b, position: [0, 0, 0.45], rotation: [Math.PI / 2, 0, 0] }
  ],
  shell: () => [
    { geometry: new THREE.BoxGeometry(0.09, 0.09, 0.42), color: PALETTE.star }
  ]
};

export class ProjectileField {
  public readonly group = new THREE.Group();
  private meshes = new Map<ProjectileKind, THREE.InstancedMesh>();
  private dummy = new THREE.Object3D();

  constructor(materials: SharedMaterials) {
    for (const [kind, build] of Object.entries(PROJECTILE_MODELS)) {
      const mesh = new THREE.InstancedMesh(mergeParts(build()), materials.painted, BUDGET.projectiles);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.meshes.set(kind as ProjectileKind, mesh);
      this.group.add(mesh);
    }
  }

  sync(projectiles: ProjectileView[]): void {
    const used = new Map<ProjectileKind, number>();
    for (const kind of this.meshes.keys()) used.set(kind, 0);

    for (const view of projectiles) {
      const mesh = this.meshes.get(view.kind);
      if (!mesh) continue;
      const index = used.get(view.kind) ?? 0;
      if (index >= mesh.instanceMatrix.count) continue;
      this.dummy.position.set(view.x, view.y, view.z);
      this.dummy.rotation.set(0, view.heading, 0);
      this.dummy.scale.setScalar(view.kind === 'shell' ? 1.4 : 1);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(index, this.dummy.matrix);
      used.set(view.kind, index + 1);
    }

    for (const [kind, mesh] of this.meshes) {
      mesh.count = used.get(kind) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) mesh.geometry.dispose();
  }
}

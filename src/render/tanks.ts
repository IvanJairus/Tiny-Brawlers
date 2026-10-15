import * as THREE from 'three';
import { mergeParts, type Part } from './geometryKit';
import { PALETTE } from './materials';
import type { SharedMaterials } from './materials';
import { BUDGET } from './budget';
import { TEAM_COLORS, type TeamId } from '../sim/domain/teams';

export interface TankView {
  team: TeamId;
  x: number;
  z: number;
  heading: number;
  turret: number;
  hpRatio: number;
}

function hullParts(): Part[] {
  return [
    { geometry: new THREE.BoxGeometry(1.9, 0.6, 2.6), color: PALETTE.metal, position: [0, 0.5, 0] },
    { geometry: new THREE.BoxGeometry(2.15, 0.34, 2.85), color: 0x1d2733, position: [0, 0.22, 0] },
    { geometry: new THREE.BoxGeometry(0.42, 0.34, 2.9), color: 0x141c26, position: [-0.86, 0.36, 0] },
    { geometry: new THREE.BoxGeometry(0.42, 0.34, 2.9), color: 0x141c26, position: [0.86, 0.36, 0] }
  ];
}

function turretParts(): Part[] {
  return [
    { geometry: new THREE.BoxGeometry(1.3, 0.5, 1.5), color: PALETTE.metal, position: [0, 0, 0] },
    { geometry: new THREE.CylinderGeometry(0.13, 0.13, 1.7, 8), color: 0x1d2733, position: [0.28, 0.05, 1.2], rotation: [Math.PI / 2, 0, 0] },
    { geometry: new THREE.CylinderGeometry(0.13, 0.13, 1.7, 8), color: 0x1d2733, position: [-0.28, 0.05, 1.2], rotation: [Math.PI / 2, 0, 0] }
  ];
}

export class TankField {
  public readonly group = new THREE.Group();
  private hulls: THREE.InstancedMesh;
  private turrets: THREE.InstancedMesh;
  private trim: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private geometries: THREE.BufferGeometry[] = [];

  constructor(materials: SharedMaterials) {
    this.hulls = this.make(mergeParts(hullParts()), materials.painted);
    this.turrets = this.make(mergeParts(turretParts()), materials.painted);
    this.trim = this.make(
      mergeParts([{ geometry: new THREE.BoxGeometry(0.34, 0.34, 0.34), color: 0xffffff, position: [0, 0.3, -0.5] }]),
      materials.painted
    );
    (this.trim.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  private make(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.InstancedMesh {
    this.geometries.push(geometry);
    const mesh = new THREE.InstancedMesh(geometry, material, BUDGET.tanks);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.group.add(mesh);
    return mesh;
  }

  sync(tanks: TankView[]): void {
    let used = 0;
    for (const tank of tanks) {
      if (used >= BUDGET.tanks) break;
      this.dummy.position.set(tank.x, 0, tank.z);
      this.dummy.rotation.set(0, tank.heading, 0);
      const squish = 0.6 + tank.hpRatio * 0.4;
      this.dummy.scale.set(1, squish, 1);
      this.dummy.updateMatrix();
      this.hulls.setMatrixAt(used, this.dummy.matrix);

      this.dummy.position.set(tank.x, 0.95, tank.z);
      this.dummy.rotation.set(0, tank.turret, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.turrets.setMatrixAt(used, this.dummy.matrix);

      this.dummy.position.set(tank.x, 1.25, tank.z);
      this.dummy.rotation.set(0, tank.turret, 0);
      this.dummy.updateMatrix();
      this.trim.setMatrixAt(used, this.dummy.matrix);
      used++;
    }
    for (const mesh of [this.hulls, this.turrets, this.trim]) {
      mesh.count = used;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  teamColour(team: TeamId): number {
    return TEAM_COLORS[team].hex;
  }

  dispose(): void {
    for (const geo of this.geometries) geo.dispose();
  }
}

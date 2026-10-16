import * as THREE from 'three';
import { mergeParts, type Part } from './geometryKit';
import { PALETTE, type SharedMaterials } from './materials';

export interface ObstacleView {
  kind: 'hard' | 'soft';
  stage: 'intact' | 'cracked' | 'broken';
  x: number;
  z: number;
}

export interface PowerUpView {
  kind: 'up_api' | 'up_lari' | 'up_bom' | 'up_perisai' | 'up_hati';
  x: number;
  y: number;
  z: number;
  spin: number;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);

function buildHardGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [
    { geometry: box(1.8, 1.35, 1.8), color: PALETTE.hardWallDark, position: [0, 0.675, 0] },
    { geometry: box(1.62, 1.28, 1.62), color: PALETTE.hardWall, position: [0, 0.72, 0] },
    { geometry: box(1.48, 0.14, 1.48), color: 0x8b9098, position: [0, 1.38, 0] },
    { geometry: box(0.16, 0.08, 0.16), color: PALETTE.hardBolt, position: [-0.42, 1.46, -0.42] },
    { geometry: box(0.16, 0.08, 0.16), color: PALETTE.hardBolt, position: [0, 1.46, 0] },
    { geometry: box(0.16, 0.08, 0.16), color: PALETTE.hardBolt, position: [0.42, 1.46, 0.42] }
  ];
  return mergeParts(parts);
}

function buildSoftIntactGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [
    { geometry: box(1.64, 1.15, 1.64), color: PALETTE.softBrickDark, position: [0, 0.575, 0] }
  ];
  for (const qx of [-0.38, 0.38]) {
    for (const qz of [-0.38, 0.38]) {
      parts.push({
        geometry: box(0.74, 1.12, 0.74),
        color: qx < 0 && qz < 0 ? PALETTE.softBrickLight : PALETTE.softBrick,
        position: [qx, 0.6, qz]
      });
    }
  }
  return mergeParts(parts);
}

function buildSoftCrackedGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [
    { geometry: box(1.64, 1.15, 1.64), color: PALETTE.softBrickDark, position: [0, 0.575, 0] }
  ];
  for (const qx of [-0.38, 0.38]) {
    for (const qz of [-0.38, 0.38]) {
      parts.push({
        geometry: box(0.74, 1.04, 0.74),
        color: qx < 0 && qz < 0 ? PALETTE.softBrickLight : PALETTE.softBrick,
        position: [qx, 0.56, qz],
        rotation: [0.06, 0.05, -0.05]
      });
    }
  }
  parts.push({ geometry: box(1.5, 1.14, 0.14), color: PALETTE.softCrack, position: [0, 0.58, 0] });
  parts.push({ geometry: box(0.14, 1.14, 1.5), color: PALETTE.softCrack, position: [0, 0.58, 0] });
  return mergeParts(parts);
}

function buildSoftBrokenGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [
    {
      geometry: box(0.68, 0.68, 0.68),
      color: PALETTE.softBrickLight,
      position: [-0.38, 0.34, -0.32],
      rotation: [0.12, -0.15, 0.08]
    },
    {
      geometry: box(0.68, 0.68, 0.68),
      color: PALETTE.softBrickDark,
      position: [0.4, 0.3, -0.28],
      rotation: [-0.08, 0.22, -0.14]
    },
    {
      geometry: box(0.68, 0.68, 0.68),
      color: PALETTE.softBrick,
      position: [0.05, 0.28, 0.42],
      rotation: [0.18, 0.1, 0.25]
    }
  ];
  return mergeParts(parts);
}

function buildPowerupGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [
    {
      geometry: cyl(0.42, 0.42, 0.18, 12),
      color: 0xffffff,
      position: [0, 0, 0],
      rotation: [Math.PI / 2, 0, 0]
    },
    {
      geometry: box(0.38, 0.26, 0.38),
      color: 0xffffff,
      position: [0, 0, 0],
      rotation: [0, Math.PI / 4, 0]
    }
  ];
  return mergeParts(parts);
}

const POWERUP_COLORS: Record<PowerUpView['kind'], THREE.Color> = {
  up_api: new THREE.Color(PALETTE.upFire),
  up_lari: new THREE.Color(PALETTE.upSpeed),
  up_bom: new THREE.Color(PALETTE.upBomb),
  up_perisai: new THREE.Color(PALETTE.upShield),
  up_hati: new THREE.Color(PALETTE.upHeart)
};

const UP_VECTOR = new THREE.Vector3(0, 1, 0);

export class ObstacleField {
  group = new THREE.Group();

  private hardMesh: THREE.InstancedMesh;
  private softIntactMesh: THREE.InstancedMesh;
  private softCrackedMesh: THREE.InstancedMesh;
  private softBrokenMesh: THREE.InstancedMesh;
  private powerupMesh: THREE.InstancedMesh;

  private helperMatrix = new THREE.Matrix4();
  private helperPos = new THREE.Vector3();
  private helperQuat = new THREE.Quaternion();
  private helperScale = new THREE.Vector3(1, 1, 1);

  constructor(materials: SharedMaterials) {
    this.hardMesh = new THREE.InstancedMesh(buildHardGeometry(), materials.painted, 16);
    this.softIntactMesh = new THREE.InstancedMesh(buildSoftIntactGeometry(), materials.painted, 24);
    this.softCrackedMesh = new THREE.InstancedMesh(buildSoftCrackedGeometry(), materials.painted, 24);
    this.softBrokenMesh = new THREE.InstancedMesh(buildSoftBrokenGeometry(), materials.painted, 24);
    this.powerupMesh = new THREE.InstancedMesh(buildPowerupGeometry(), materials.painted, 16);

    this.hardMesh.count = 0;
    this.softIntactMesh.count = 0;
    this.softCrackedMesh.count = 0;
    this.softBrokenMesh.count = 0;
    this.powerupMesh.count = 0;

    this.group.add(
      this.hardMesh,
      this.softIntactMesh,
      this.softCrackedMesh,
      this.softBrokenMesh,
      this.powerupMesh
    );
  }

  sync(obstacles: ObstacleView[], powerups: PowerUpView[], time: number): void {
    let hardCount = 0;
    let intactCount = 0;
    let crackedCount = 0;
    let brokenCount = 0;

    for (const obs of obstacles) {
      this.helperMatrix.makeTranslation(obs.x, 0, obs.z);
      if (obs.kind === 'hard') {
        if (hardCount < 16) {
          this.hardMesh.setMatrixAt(hardCount++, this.helperMatrix);
        }
      } else if (obs.stage === 'intact') {
        if (intactCount < 24) {
          this.softIntactMesh.setMatrixAt(intactCount++, this.helperMatrix);
        }
      } else if (obs.stage === 'cracked') {
        if (crackedCount < 24) {
          this.softCrackedMesh.setMatrixAt(crackedCount++, this.helperMatrix);
        }
      } else if (brokenCount < 24) {
        this.softBrokenMesh.setMatrixAt(brokenCount++, this.helperMatrix);
      }
    }

    this.hardMesh.count = hardCount;
    this.hardMesh.instanceMatrix.needsUpdate = true;

    this.softIntactMesh.count = intactCount;
    this.softIntactMesh.instanceMatrix.needsUpdate = true;

    this.softCrackedMesh.count = crackedCount;
    this.softCrackedMesh.instanceMatrix.needsUpdate = true;

    this.softBrokenMesh.count = brokenCount;
    this.softBrokenMesh.instanceMatrix.needsUpdate = true;

    let puCount = 0;
    for (const pu of powerups) {
      if (puCount >= 16) break;
      const bob = Math.sin(time * 3 + pu.x * 0.5 + pu.z * 0.5) * 0.12;
      const y = (pu.y ?? 0.8) + bob;
      const spin = pu.spin ?? (time * 2.2);

      this.helperPos.set(pu.x, y, pu.z);
      this.helperQuat.setFromAxisAngle(UP_VECTOR, spin);
      this.helperMatrix.compose(this.helperPos, this.helperQuat, this.helperScale);

      this.powerupMesh.setMatrixAt(puCount, this.helperMatrix);
      const col = POWERUP_COLORS[pu.kind] ?? POWERUP_COLORS.up_api;
      this.powerupMesh.setColorAt(puCount, col);
      puCount++;
    }

    this.powerupMesh.count = puCount;
    this.powerupMesh.instanceMatrix.needsUpdate = true;
    if (this.powerupMesh.instanceColor) {
      this.powerupMesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    this.hardMesh.geometry.dispose();
    this.softIntactMesh.geometry.dispose();
    this.softCrackedMesh.geometry.dispose();
    this.softBrokenMesh.geometry.dispose();
    this.powerupMesh.geometry.dispose();
  }
}

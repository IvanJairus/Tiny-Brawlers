import * as THREE from 'three';
import { mergeParts, type Part, unitSphere } from './geometryKit';
import { PALETTE } from './materials';
import type { SharedMaterials } from './materials';
import { TEAM_COLORS, TEAM_IDS, type TeamId } from '../sim/domain/teams';
import { BUDGET } from './budget';

export interface ActorView {
  id: number;
  team: TeamId;
  x: number;
  z: number;
  heading: number;
  state: 'idle' | 'walk' | 'carry' | 'ko' | 'celebrate';
  weapon: 'none' | 'pistol' | 'shotgun' | 'grenade' | 'bazooka' | 'medic';
  hpRatio: number;
  phase: number;
  /** 1 at the moment of a hit, decaying to 0 over the flash window. */
  flash: number;
  /** 1 at the moment of a knockout, used for one squash-and-pop frame set. */
  pop: number;
  melee?: number;
  shield?: boolean;
}

const HEAD_Y = 1.16;
const SHOULDER_Y = 1.02;
const HIP_Y = 0.1;

/**
 * A buddy is seven instanced parts, not sixty-seven meshes. Only the torso carries
 * team colour, so the head, arms and boots are shared by every team and cost one
 * draw call each for the whole battlefield.
 */
function torsoParts(team: TeamId): Part[] {
  return [
    { geometry: new THREE.CapsuleGeometry(0.4, 0.62, 3, 10), color: TEAM_COLORS[team].hex, position: [0, 0.72, 0] }
  ];
}

function headParts(): Part[] {
  return [
    { geometry: unitSphere(0.42, 9), color: PALETTE.skin, position: [0, HEAD_Y, 0] },
    { geometry: unitSphere(0.46, 8), color: PALETTE.helmet, position: [0, HEAD_Y + 0.1, 0], scale: [1, 0.72, 1] },
    { geometry: new THREE.TorusGeometry(0.44, 0.05, 3, 10), color: PALETTE.helmetRim, position: [0, HEAD_Y + 0.06, 0], rotation: [Math.PI / 2, 0, 0] },
    { geometry: new THREE.ConeGeometry(0.09, 0.1, 5), color: PALETTE.star, position: [0, HEAD_Y + 0.3, 0.42], rotation: [Math.PI / 2, 0, 0] },
    { geometry: unitSphere(0.1, 6), color: PALETTE.eyeWhite, position: [-0.16, HEAD_Y + 0.04, 0.35] },
    { geometry: unitSphere(0.1, 6), color: PALETTE.eyeWhite, position: [0.16, HEAD_Y + 0.04, 0.35] },
    { geometry: unitSphere(0.055, 4), color: PALETTE.eyeDark, position: [-0.16, HEAD_Y + 0.03, 0.43] },
    { geometry: unitSphere(0.055, 4), color: PALETTE.eyeDark, position: [0.16, HEAD_Y + 0.03, 0.43] },
    { geometry: unitSphere(0.075, 4), color: PALETTE.blush, position: [-0.28, HEAD_Y - 0.09, 0.28], scale: [1, 0.6, 0.5] },
    { geometry: unitSphere(0.075, 4), color: PALETTE.blush, position: [0.28, HEAD_Y - 0.09, 0.28], scale: [1, 0.6, 0.5] },
    { geometry: new THREE.TorusGeometry(0.09, 0.02, 3, 6, Math.PI), color: PALETTE.eyeDark, position: [0, HEAD_Y - 0.12, 0.38], rotation: [0, 0, Math.PI] }
  ];
}

function armParts(): Part[] {
  return [
    { geometry: new THREE.CapsuleGeometry(0.09, 0.24, 3, 7), color: PALETTE.skin, position: [0, -0.24, 0] }
  ];
}

function bootParts(): Part[] {
  return [{ geometry: new THREE.BoxGeometry(0.24, 0.16, 0.34), color: PALETTE.boot, position: [0, -0.05, 0.04] }];
}

const WEAPON_SHAPES: Record<string, () => Part[]> = {
  pistol: () => [
    { geometry: new THREE.BoxGeometry(0.08, 0.1, 0.3), color: PALETTE.metal, position: [0, 0.02, 0.12] },
    { geometry: new THREE.BoxGeometry(0.07, 0.14, 0.08), color: 0x3b4a5a, position: [0, -0.06, 0.02] }
  ],
  shotgun: () => [
    { geometry: new THREE.BoxGeometry(0.1, 0.1, 0.52), color: PALETTE.metal, position: [0, 0.02, 0.2] },
    { geometry: new THREE.BoxGeometry(0.09, 0.12, 0.24), color: PALETTE.wood, position: [0, -0.03, -0.06] }
  ],
  grenade: () => [{ geometry: unitSphere(0.13, 7), color: 0x6a9a3c, position: [0, 0.06, 0] }],
  bazooka: () => [
    { geometry: new THREE.CylinderGeometry(0.11, 0.11, 0.86, 8), color: PALETTE.helmet, position: [0, 0, 0], rotation: [Math.PI / 2, 0, 0] },
    { geometry: new THREE.ConeGeometry(0.12, 0.2, 8), color: PALETTE.metal, position: [0, 0, 0.5], rotation: [Math.PI / 2, 0, 0] }
  ],
  medic: () => [
    { geometry: new THREE.CylinderGeometry(0.06, 0.06, 0.3, 7), color: 0xd8f5e3, position: [0, 0, 0], rotation: [Math.PI / 2, 0, 0] },
    { geometry: new THREE.CylinderGeometry(0.02, 0.02, 0.16, 5), color: PALETTE.metal, position: [0, 0, 0.22], rotation: [Math.PI / 2, 0, 0] }
  ]
};

export class ChibiField {
  public readonly group = new THREE.Group();
  private torsos = new Map<TeamId, THREE.InstancedMesh>();
  private heads: THREE.InstancedMesh;
  private arms: THREE.InstancedMesh;
  private boots: THREE.InstancedMesh;
  private shadows: THREE.InstancedMesh;
  private flash: THREE.InstancedMesh;
  private weapons = new Map<string, THREE.InstancedMesh>();
  private geometries: THREE.BufferGeometry[] = [];
  private dummy = new THREE.Object3D();
  private flashColor = new THREE.Color();

  constructor(materials: SharedMaterials) {
    for (const team of TEAM_IDS) {
      this.torsos.set(team, this.instanced(mergeParts(torsoParts(team)), materials.painted, BUDGET.buddies));
    }
    this.heads = this.instanced(mergeParts(headParts()), materials.painted, BUDGET.buddies);
    this.arms = this.instanced(mergeParts(armParts()), materials.painted, BUDGET.buddies * 2);
    this.boots = this.instanced(mergeParts(bootParts()), materials.painted, BUDGET.buddies * 2);

    const shadowGeo = new THREE.CircleGeometry(0.46, 12);
    shadowGeo.rotateX(-Math.PI / 2);
    this.shadows = this.instanced(shadowGeo, materials.shadow, BUDGET.buddies);

    const flashGeo = new THREE.BoxGeometry(1.04, 1.52, 0.9);
    flashGeo.translate(0, 0.78, 0);
    this.flash = this.instanced(flashGeo, materials.hitFlash, BUDGET.buddies);
    this.flash.name = 'hit_flash';

    for (const [kind, build] of Object.entries(WEAPON_SHAPES)) {
      this.weapons.set(kind, this.instanced(mergeParts(build()), materials.painted, BUDGET.buddies));
    }
  }

  private instanced(geometry: THREE.BufferGeometry, material: THREE.Material, count: number): THREE.InstancedMesh {
    this.geometries.push(geometry);
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.group.add(mesh);
    return mesh;
  }

  sync(actors: ActorView[], time: number): void {
    const teamSlots = new Map<TeamId, number>();
    for (const team of TEAM_IDS) teamSlots.set(team, 0);
    const weaponUsed = new Map<string, number>();
    for (const kind of this.weapons.keys()) weaponUsed.set(kind, 0);

    this.heads.count = 0;
    this.arms.count = 0;
    this.boots.count = 0;
    this.shadows.count = 0;
    this.flash.count = 0;
    let flashCount = 0;

    actors.forEach((actor, slot) => {
      if (slot >= BUDGET.buddies) return;
      const teamIndex = teamSlots.get(actor.team) ?? 0;
      teamSlots.set(actor.team, teamIndex + 1);
      this.drawActor(actor, teamIndex, slot, time, weaponUsed);
      if (actor.flash > 0) {
        this.dummy.position.set(actor.x, 0, actor.z);
        this.dummy.rotation.set(0, actor.heading, 0);
        const swell = 1.06 + actor.flash * 0.14;
        this.dummy.scale.set(swell, swell, swell);
        this.dummy.updateMatrix();
        this.flash.setMatrixAt(flashCount++, this.dummy.matrix);
      }
    });
    this.flash.count = Math.min(flashCount, BUDGET.buddies);

    for (const team of TEAM_IDS) this.torsos.get(team)!.count = teamSlots.get(team) ?? 0;
    this.heads.count = Math.min(actors.length, BUDGET.buddies);
    this.shadows.count = this.heads.count;
    this.arms.count = Math.min(actors.length * 2, this.arms.instanceMatrix.count);
    this.boots.count = this.arms.count;
    for (const [kind, mesh] of this.weapons) mesh.count = weaponUsed.get(kind) ?? 0;

    for (const mesh of [...this.torsos.values(), this.heads, this.arms, this.boots, this.shadows, this.flash, ...this.weapons.values()]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private drawActor(
    actor: ActorView, teamIndex: number, slot: number, time: number, weaponUsed: Map<string, number>
  ): void {
    const ko = actor.state === 'ko';
    const walking = actor.state === 'walk' || actor.state === 'carry';
    const swing = walking ? Math.sin(time * 9 + actor.phase) : 0;
    const bob = walking
      ? Math.abs(Math.sin(time * 9 + actor.phase)) * 0.06
      : Math.sin(time * 2 + actor.phase) * 0.015;
    const squash = walking ? Math.cos(time * 9 + actor.phase) * 0.045 : Math.sin(time * 2 + actor.phase) * 0.02;
    const carrying = actor.state === 'carry';
    const load = carrying ? 0.08 : 0;
    const sag = carrying ? -0.07 : 0;
    const pop = 1 + actor.pop * 0.3;
    const rightX = Math.cos(actor.heading);
    const rightZ = -Math.sin(actor.heading);
    const forwardX = Math.sin(actor.heading);
    const forwardZ = Math.cos(actor.heading);

    this.flashColor.setScalar(1 + actor.flash * 2.2);
    const torsoMesh = this.torsos.get(actor.team)!;
    this.dummy.position.set(actor.x, bob + sag, actor.z);
    this.dummy.rotation.set(ko ? -Math.PI / 2.2 : 0, actor.heading, ko ? 0 : swing * 0.06);
    this.dummy.scale.set((1 + squash + load) * pop, (1 - squash * 1.6 - load * 2.1) * pop, (1 + squash + load) * pop);
    this.dummy.updateMatrix();
    torsoMesh.setMatrixAt(teamIndex, this.dummy.matrix);
    torsoMesh.setColorAt(teamIndex, this.flashColor);

    this.dummy.position.set(actor.x, bob + sag, actor.z);
    this.dummy.rotation.set(ko ? -Math.PI / 2.2 : 0, actor.heading, 0);
    this.dummy.scale.set(pop, pop, pop);
    this.dummy.updateMatrix();
    this.heads.setMatrixAt(slot, this.dummy.matrix);
    this.heads.setColorAt(slot, this.flashColor);

    const armLift = carrying ? -2.5 : -0.35;
    for (const side of [-1, 1]) {
      let armX = actor.x + rightX * 0.44 * side;
      const armY = SHOULDER_Y + (carrying ? 0.34 : 0) + bob + sag;
      let armZ = actor.z + rightZ * 0.44 * side;
      let rotX = armLift + (carrying ? 0 : swing * 0.7 * side);
      let armScale = 1;

      if ((actor.melee ?? 0) > 0 && side > 0) {
        const punch = Math.sin((actor.melee ?? 0) * Math.PI) * 1.45;
        armX = actor.x + rightX * 0.44 + forwardX * punch * 0.35;
        armZ = actor.z + rightZ * 0.44 + forwardZ * punch * 0.35;
        rotX = armLift - punch;
        armScale = 1 + punch * 0.25;
      }

      this.dummy.position.set(armX, armY, armZ);
      this.dummy.rotation.set(rotX, actor.heading, side * (carrying ? 0.45 : 0.12));
      this.dummy.scale.set(armScale, armScale, armScale);
      this.dummy.updateMatrix();
      this.arms.setMatrixAt(slot * 2 + (side < 0 ? 0 : 1), this.dummy.matrix);
    }

    for (const side of [-1, 1]) {
      const lift = walking ? Math.max(0, swing * side) * 0.7 : 0;
      this.dummy.position.set(actor.x + rightX * 0.2 * side, HIP_Y + lift * 0.3 + bob, actor.z + rightZ * 0.2 * side);
      this.dummy.rotation.set(-lift, actor.heading, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.boots.setMatrixAt(slot * 2 + (side < 0 ? 0 : 1), this.dummy.matrix);
    }

    this.dummy.position.set(actor.x, 0.03, actor.z);
    this.dummy.rotation.set(0, 0, 0);
    const shadowScale = ko ? 1.3 : 1 - Math.min(0.4, bob * 2);
    this.dummy.scale.set(shadowScale, 1, shadowScale);
    this.dummy.updateMatrix();
    this.shadows.setMatrixAt(slot, this.dummy.matrix);

    if (actor.weapon === 'none' || ko) return;
    const mesh = this.weapons.get(actor.weapon);
    if (!mesh) return;
    const used = weaponUsed.get(actor.weapon) ?? 0;
    if (used >= BUDGET.buddies) return;
    const reach = actor.weapon === 'bazooka' ? 0.2 : 0.34;
    this.dummy.position.set(
      actor.x + forwardX * reach,
      carrying ? 1.9 : SHOULDER_Y - 0.18,
      actor.z + forwardZ * reach
    );
    this.dummy.rotation.set(carrying ? -1.2 : 0, actor.heading, 0);
    this.dummy.scale.set(1, 1, 1);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(used, this.dummy.matrix);
    weaponUsed.set(actor.weapon, used + 1);
  }

  dispose(): void {
    for (const geo of this.geometries) geo.dispose();
    this.group.clear();
  }
}

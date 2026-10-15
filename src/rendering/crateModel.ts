/**
 * 3D Stylized Wooden Crate Compound Model & Visual Physics
 * Tiny Brawlers: Milestone 3
 * 
 * Recreates the high-fidelity cute cartoon wooden supply crate with:
 * - 0.9m x 0.9m x 0.9m warm wood cube body (#b57a38)
 * - Recessed/embossed cross-plank diagonal braces on all 6 faces (#8c5826)
 * - 8 dark metallic corner reinforcement brackets (#2c3e50)
 * - Shared static geometry and material caches preventing GPU memory leaks
 * - Visual walking bob & tumble physics helpers
 */

import * as THREE from 'three';
import { Vector3D } from '../types';

/* =========================================================================
   Palette & Physical Constants
   ========================================================================= */

export const CRATE_DIMENSIONS = {
  width: 0.90,
  height: 0.90,
  depth: 0.90,
  halfSize: 0.45,
  braceWidth: 0.10,
  braceLength: 1.22,
  braceThickness: 0.024,
  cornerSize: 0.16,
  cornerOffset: 0.44
};

export const CRATE_COLORS = {
  woodCore: 0xb57a38,       // Warm golden pine wood
  woodBrace: 0x8c5826,      // Dark aged cross-plank battens
  metalCorner: 0x2c3e50     // Dark gunmetal steel brackets
};

/* =========================================================================
   Geometry & Material Resource Singletons
   ========================================================================= */

export class CrateGeometryCache {
  private static _coreGeo: THREE.BoxGeometry | null = null;
  private static _braceGeo: THREE.BoxGeometry | null = null;
  private static _cornerGeo: THREE.BoxGeometry | null = null;

  public static get core(): THREE.BoxGeometry {
    if (!this._coreGeo) {
      this._coreGeo = new THREE.BoxGeometry(
        CRATE_DIMENSIONS.width,
        CRATE_DIMENSIONS.height,
        CRATE_DIMENSIONS.depth
      );
    }
    return this._coreGeo;
  }

  public static get brace(): THREE.BoxGeometry {
    if (!this._braceGeo) {
      this._braceGeo = new THREE.BoxGeometry(
        CRATE_DIMENSIONS.braceWidth,
        CRATE_DIMENSIONS.braceLength,
        CRATE_DIMENSIONS.braceThickness
      );
    }
    return this._braceGeo;
  }

  public static get corner(): THREE.BoxGeometry {
    if (!this._cornerGeo) {
      this._cornerGeo = new THREE.BoxGeometry(
        CRATE_DIMENSIONS.cornerSize,
        CRATE_DIMENSIONS.cornerSize,
        CRATE_DIMENSIONS.cornerSize
      );
    }
    return this._cornerGeo;
  }

  public static dispose(): void {
    if (this._coreGeo) { this._coreGeo.dispose(); this._coreGeo = null; }
    if (this._braceGeo) { this._braceGeo.dispose(); this._braceGeo = null; }
    if (this._cornerGeo) { this._cornerGeo.dispose(); this._cornerGeo = null; }
  }
}

export class CrateMaterialCache {
  private static _woodCoreMat: THREE.MeshStandardMaterial | null = null;
  private static _woodBraceMat: THREE.MeshStandardMaterial | null = null;
  private static _metalCornerMat: THREE.MeshStandardMaterial | null = null;

  public static get woodCore(): THREE.MeshStandardMaterial {
    if (!this._woodCoreMat) {
      this._woodCoreMat = new THREE.MeshStandardMaterial({
        color: CRATE_COLORS.woodCore,
        roughness: 0.8,
        metalness: 0.0,
        name: 'mat_crate_wood_core'
      });
    }
    return this._woodCoreMat;
  }

  public static get woodBrace(): THREE.MeshStandardMaterial {
    if (!this._woodBraceMat) {
      this._woodBraceMat = new THREE.MeshStandardMaterial({
        color: CRATE_COLORS.woodBrace,
        roughness: 0.9,
        metalness: 0.0,
        name: 'mat_crate_wood_brace'
      });
    }
    return this._woodBraceMat;
  }

  public static get metalCorner(): THREE.MeshStandardMaterial {
    if (!this._metalCornerMat) {
      this._metalCornerMat = new THREE.MeshStandardMaterial({
        color: CRATE_COLORS.metalCorner,
        roughness: 0.4,
        metalness: 0.5,
        name: 'mat_crate_metal_corner'
      });
    }
    return this._metalCornerMat;
  }

  public static dispose(): void {
    if (this._woodCoreMat) { this._woodCoreMat.dispose(); this._woodCoreMat = null; }
    if (this._woodBraceMat) { this._woodBraceMat.dispose(); this._woodBraceMat = null; }
    if (this._metalCornerMat) { this._metalCornerMat.dispose(); this._metalCornerMat = null; }
  }
}

/**
 * Cleanly releases all cached GPU geometries and materials.
 * Call during application teardown or unit testing resets.
 */
export function disposeCrateSharedResources(): void {
  CrateGeometryCache.dispose();
  CrateMaterialCache.dispose();
}

/* =========================================================================
   Compound Crate Mesh Factory
   ========================================================================= */

/**
 * Creates a complete 3D stylized wooden crate compound mesh group.
 * All child meshes share cached geometries and materials for peak GPU performance.
 */
export function createCrateMesh(): THREE.Group {
  const crateGroup = new THREE.Group();
  crateGroup.name = 'crate_compound_root';

  // 1. Main Warm Wood Core Body
  const coreMesh = new THREE.Mesh(
    CrateGeometryCache.core,
    CrateMaterialCache.woodCore
  );
  coreMesh.name = 'crate_body_core';
  coreMesh.castShadow = true;
  coreMesh.receiveShadow = true;
  crateGroup.add(coreMesh);

  // 2. Embossed Cross-Plank Diagonal Braces (All 6 Faces, 2 per face = 12 braces)
  const bracesGroup = new THREE.Group();
  bracesGroup.name = 'crate_braces';

  const braceGeo = CrateGeometryCache.brace;
  const braceMat = CrateMaterialCache.woodBrace;

  const h = CRATE_DIMENSIONS.halfSize;
  const t1 = h + 0.008; // Base embossed plank offset
  const t2 = h + 0.016; // Intersecting plank offset to avoid coplanar z-fighting

  const addFaceBraces = (
    pos1: THREE.Vector3,
    rot1: THREE.Euler,
    pos2: THREE.Vector3,
    rot2: THREE.Euler,
    faceName: string
  ): void => {
    const b1 = new THREE.Mesh(braceGeo, braceMat);
    b1.name = `brace_${faceName}_1`;
    b1.position.copy(pos1);
    b1.rotation.copy(rot1);
    b1.castShadow = true;
    b1.receiveShadow = true;

    const b2 = new THREE.Mesh(braceGeo, braceMat);
    b2.name = `brace_${faceName}_2`;
    b2.position.copy(pos2);
    b2.rotation.copy(rot2);
    b2.castShadow = true;
    b2.receiveShadow = true;

    bracesGroup.add(b1, b2);
  };

  // Front Face (+Z)
  addFaceBraces(
    new THREE.Vector3(0, 0, t1), new THREE.Euler(0, 0, Math.PI / 4),
    new THREE.Vector3(0, 0, t2), new THREE.Euler(0, 0, -Math.PI / 4),
    'front'
  );

  // Back Face (-Z)
  addFaceBraces(
    new THREE.Vector3(0, 0, -t1), new THREE.Euler(0, 0, Math.PI / 4),
    new THREE.Vector3(0, 0, -t2), new THREE.Euler(0, 0, -Math.PI / 4),
    'back'
  );

  // Right Face (+X)
  addFaceBraces(
    new THREE.Vector3(t1, 0, 0), new THREE.Euler(0, Math.PI / 2, Math.PI / 4),
    new THREE.Vector3(t2, 0, 0), new THREE.Euler(0, Math.PI / 2, -Math.PI / 4),
    'right'
  );

  // Left Face (-X)
  addFaceBraces(
    new THREE.Vector3(-t1, 0, 0), new THREE.Euler(0, -Math.PI / 2, Math.PI / 4),
    new THREE.Vector3(-t2, 0, 0), new THREE.Euler(0, -Math.PI / 2, -Math.PI / 4),
    'left'
  );

  // Top Face (+Y)
  addFaceBraces(
    new THREE.Vector3(0, t1, 0), new THREE.Euler(Math.PI / 2, 0, Math.PI / 4),
    new THREE.Vector3(0, t2, 0), new THREE.Euler(Math.PI / 2, 0, -Math.PI / 4),
    'top'
  );

  // Bottom Face (-Y)
  addFaceBraces(
    new THREE.Vector3(0, -t1, 0), new THREE.Euler(-Math.PI / 2, 0, Math.PI / 4),
    new THREE.Vector3(0, -t2, 0), new THREE.Euler(-Math.PI / 2, 0, -Math.PI / 4),
    'bottom'
  );

  crateGroup.add(bracesGroup);

  // 3. 8 Dark Metallic Corner Reinforcement Brackets
  const cornersGroup = new THREE.Group();
  cornersGroup.name = 'crate_corners';

  const cornerGeo = CrateGeometryCache.corner;
  const cornerMat = CrateMaterialCache.metalCorner;
  const cOffset = CRATE_DIMENSIONS.cornerOffset;

  const cornerOffsets: [number, number, number][] = [
    [-cOffset, -cOffset, -cOffset],
    [ cOffset, -cOffset, -cOffset],
    [-cOffset,  cOffset, -cOffset],
    [ cOffset,  cOffset, -cOffset],
    [-cOffset, -cOffset,  cOffset],
    [ cOffset, -cOffset,  cOffset],
    [-cOffset,  cOffset,  cOffset],
    [ cOffset,  cOffset,  cOffset]
  ];

  cornerOffsets.forEach((pos, idx) => {
    const cornerMesh = new THREE.Mesh(cornerGeo, cornerMat);
    cornerMesh.name = `corner_bracket_${idx}`;
    cornerMesh.position.set(pos[0], pos[1], pos[2]);
    cornerMesh.castShadow = true;
    cornerMesh.receiveShadow = true;
    cornersGroup.add(cornerMesh);
  });

  crateGroup.add(cornersGroup);

  return crateGroup;
}

/* =========================================================================
   Head Carry Mounting & Walking Bob Physics Helper
   ========================================================================= */

export interface HeadCarryTransform {
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  rotZ: number;
}

/**
 * Calculates the exact world transform of a carried crate sitting directly on top
 * of a buddy's head socket, incorporating speed-adaptive vertical walking bob
 * and lateral waddle tilt.
 * 
 * Formula: y = carrier.y + 1.15 + sin(walkPhase * 2.0) * 0.05
 */
export function calculateHeadCarryTransform(
  carrierPos: Vector3D,
  facingAngle: number,
  isMoving: boolean,
  walkPhase: number,
  time: number,
  speedRatio: number = 1.0
): HeadCarryTransform {
  let bobY: number;
  let rotZ: number;
  let rotX: number;

  if (isMoving) {
    // Two vertical bounces per complete stride cycle
    bobY = Math.sin(walkPhase * 2.0) * 0.05;
    // Torso waddle sway transferred to crate
    rotZ = Math.sin(walkPhase) * 0.04;
    // Forward lean proportional to speed
    rotX = 0.04 * Math.min(1.0, speedRatio);
  } else {
    // Subtle breathing compression squish
    bobY = Math.sin(time * 4.0) * 0.03;
    rotZ = 0;
    rotX = 0;
  }

  return {
    x: carrierPos.x,
    y: carrierPos.y + 1.15 + bobY,
    z: carrierPos.z,
    rotX,
    rotY: facingAngle,
    rotZ
  };
}

/* =========================================================================
   Throw Flight & Tumble Physics Helpers
   ========================================================================= */

/**
 * Computes initial angular tumble velocity impulse when a crate is thrown.
 * Generates forward tumble around the horizontal lateral axis perpendicular to forward.
 */
export function calculateThrowAngularImpulse(
  forwardDir: Vector3D,
  throwForce: number
): Vector3D {
  // Lateral axis perpendicular to forward: (-fz, 0, fx)
  const tumbleSpeed = 6.0 + throwForce * 0.25;
  const yawSpin = (Math.random() - 0.5) * 2.0;

  return {
    x: -forwardDir.z * tumbleSpeed,
    y: yawSpin,
    z: forwardDir.x * tumbleSpeed
  };
}

/**
 * Updates tumbling angles during flight and smoothly rights the crate
 * to the nearest orthogonal 90-degree flat face upon ground landing.
 */
export function updateCrateTumbleAndSettling(
  rotation: Vector3D,
  angularVelocity: Vector3D,
  isGrounded: boolean,
  linearSpeed: number,
  dt: number
): void {
  if (!isGrounded) {
    // In-flight free rotation integration
    rotation.x += angularVelocity.x * dt;
    rotation.y += angularVelocity.y * dt;
    rotation.z += angularVelocity.z * dt;
  } else {
    // Ground landing friction damping on angular rotation
    angularVelocity.x *= 0.35;
    angularVelocity.y *= 0.50;
    angularVelocity.z *= 0.35;

    // Righting torque towards nearest flat face when sliding/stopped
    if (linearSpeed < 1.5) {
      const snapPitch = Math.round(rotation.x / (Math.PI / 2)) * (Math.PI / 2);
      const snapRoll = Math.round(rotation.z / (Math.PI / 2)) * (Math.PI / 2);

      const rightingFactor = 1.0 - Math.exp(-8.0 * dt);
      rotation.x += (snapPitch - rotation.x) * rightingFactor;
      rotation.z += (snapRoll - rotation.z) * rightingFactor;

      if (linearSpeed < 0.1) {
        angularVelocity.x = 0;
        angularVelocity.y = 0;
        angularVelocity.z = 0;
      }
    }
  }
}

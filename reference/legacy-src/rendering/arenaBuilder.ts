import * as THREE from 'three';
import { TeamId } from '../types';

/**
 * ArenaSceneElements
 * Contract defined in PROJECT.md
 */
export interface ArenaSceneElements {
  islandMesh: THREE.Group;
  waterMesh: THREE.Mesh;
  bunkerMeshes: Record<TeamId, THREE.Group>;
  padMeshes: Record<TeamId, THREE.Group>;
  lightBeamMesh: THREE.Mesh;
  update(time: number, dt: number): void;
  updateBunkerHealth(team: TeamId, hp: number): void;
}

/**
 * Team Palette Hex Matrix
 */
const TEAM_HEX_COLORS: Record<TeamId, number> = {
  red: 0xff4757,
  blue: 0x2ed573,
  yellow: 0xffa502,
  cyan: 0x1e90ff
};

/**
 * Team Base Coordinates on the 64m x 64m Island
 */
export const ARENA_BASE_COORDINATES: Record<TeamId, { x: number; z: number }> = {
  red: { x: -18, z: -18 },
  blue: { x: 18, z: -18 },
  yellow: { x: -18, z: 18 },
  cyan: { x: 18, z: 18 }
};

/**
 * buildStylizedArena
 *
 * Constructs the complete 3D stylized arena environment:
 * 1. Classic Green Grassland Island (64m x 64m, #4cd137) with rounded cliff edges & rock perimeter.
 * 2. Surrounding ocean/moat plane at y = -1.5m (#00a8ff, opacity 0.65) with animated wave vertices & shimmer.
 * 3. 4 3D Base Bunkers (Red, Blue, Yellow, Cyan) with 1000 HP structure, team trims, sandbags & collapse states.
 * 4. 4 2x2x2 Stacking Pads with pulsating team emissive borders & 4 quadrant slot guides.
 * 5. Central Crate Drop Zone with concentric #e67e22 ground rings and pulsing vertical light beam column.
 */
export function buildStylizedArena(scene: THREE.Scene): ArenaSceneElements {
  // Shared Reusable Materials
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x4cd137 });
  const cliffMat = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x7f8c8d, flatShading: true });
  const concreteMat = new THREE.MeshLambertMaterial({ color: 0x2d3436 });
  const sandbagMat = new THREE.MeshLambertMaterial({ color: 0xd2b48c });
  const padPlatformMat = new THREE.MeshLambertMaterial({ color: 0x1e272e });
  const gridLineMat = new THREE.MeshBasicMaterial({ color: 0x718093 });

  // Team materials cache
  const teamMats: Record<TeamId, THREE.MeshLambertMaterial> = {
    red: new THREE.MeshLambertMaterial({ color: TEAM_HEX_COLORS.red }),
    blue: new THREE.MeshLambertMaterial({ color: TEAM_HEX_COLORS.blue }),
    yellow: new THREE.MeshLambertMaterial({ color: TEAM_HEX_COLORS.yellow }),
    cyan: new THREE.MeshLambertMaterial({ color: TEAM_HEX_COLORS.cyan })
  };

  const padBorderMats: Record<TeamId, THREE.MeshStandardMaterial> = {
    red: new THREE.MeshStandardMaterial({
      color: TEAM_HEX_COLORS.red,
      emissive: TEAM_HEX_COLORS.red,
      emissiveIntensity: 0.65,
      roughness: 0.4
    }),
    blue: new THREE.MeshStandardMaterial({
      color: TEAM_HEX_COLORS.blue,
      emissive: TEAM_HEX_COLORS.blue,
      emissiveIntensity: 0.65,
      roughness: 0.4
    }),
    yellow: new THREE.MeshStandardMaterial({
      color: TEAM_HEX_COLORS.yellow,
      emissive: TEAM_HEX_COLORS.yellow,
      emissiveIntensity: 0.65,
      roughness: 0.4
    }),
    cyan: new THREE.MeshStandardMaterial({
      color: TEAM_HEX_COLORS.cyan,
      emissive: TEAM_HEX_COLORS.cyan,
      emissiveIntensity: 0.65,
      roughness: 0.4
    })
  };

  // ==========================================================================
  // 1. LIGHTING
  // ==========================================================================
  const hemiLight = new THREE.HemisphereLight(0xfff7ed, 0x2b3846, 1.4);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xffeed6, 1.8);
  dirLight.position.set(20, 35, 25);
  scene.add(dirLight);

  // ==========================================================================
  // 2. CLASSIC GREEN GRASSLAND ISLAND (64m x 64m)
  // ==========================================================================
  const islandMesh = new THREE.Group();

  // 2.1 Top Grass Surface Slab (64m x 0.5m x 64m, top at y = 0.0)
  const topGrass = new THREE.Mesh(new THREE.BoxGeometry(64, 0.5, 64), grassMat);
  topGrass.position.y = -0.25;
  islandMesh.add(topGrass);

  // 2.2 Cliff Underside Base (62m x 2.0m x 62m extending to y = -2.25m)
  const cliffBase = new THREE.Mesh(new THREE.BoxGeometry(62, 2.0, 62), cliffMat);
  cliffBase.position.y = -1.25;
  islandMesh.add(cliffBase);

  // 2.3 Rounded Cliff Edge Moldings (4 Borders)
  const borderEdges = [
    { pos: [0, -0.05, -32], rot: [0, 0, Math.PI / 2], len: 64 }, // North
    { pos: [0, -0.05, 32], rot: [0, 0, Math.PI / 2], len: 64 },  // South
    { pos: [-32, -0.05, 0], rot: [Math.PI / 2, 0, 0], len: 64 }, // West
    { pos: [32, -0.05, 0], rot: [Math.PI / 2, 0, 0], len: 64 }   // East
  ];

  for (const edge of borderEdges) {
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, edge.len, 12),
      grassMat
    );
    rim.position.set(edge.pos[0], edge.pos[1], edge.pos[2]);
    rim.rotation.set(edge.rot[0], edge.rot[1], edge.rot[2]);
    islandMesh.add(rim);
  }

  // 2.4 Rounded Corner Columns at (±32, y, ±32)
  const cornerCoords = [
    [-32, -32], [32, -32], [-32, 32], [32, 32]
  ];
  for (const [cx, cz] of cornerCoords) {
    const cornerCol = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.8, 1.8, 12),
      cliffMat
    );
    cornerCol.position.set(cx, -1.0, cz);
    islandMesh.add(cornerCol);
  }

  // 2.5 Cobblestone Pathway Strips Radiating from Center to 4 Base Pads
  const pathMat = new THREE.MeshLambertMaterial({ color: 0x8395a7 });
  for (const team of ['red', 'blue', 'yellow', 'cyan'] as TeamId[]) {
    const coord = ARENA_BASE_COORDINATES[team];
    const pathLen = Math.hypot(coord.x, coord.z) - 6.0;
    const pathAngle = Math.atan2(coord.z, coord.x);
    const path = new THREE.Mesh(new THREE.BoxGeometry(pathLen, 0.02, 1.6), pathMat);
    path.position.set(coord.x * 0.45, 0.015, coord.z * 0.45);
    path.rotation.y = -pathAngle;
    islandMesh.add(path);
  }

  // 2.6 Perimeter Cartoon Rocks (Dodecahedrons along borders)
  const rockCoords = [
    // North border
    { x: -26, z: -30.5, r: 1.2 }, { x: -12, z: -31.0, r: 0.9 },
    { x: 4, z: -30.8, r: 1.4 }, { x: 20, z: -31.2, r: 1.0 },
    // South border
    { x: -22, z: 31.0, r: 1.1 }, { x: -6, z: 30.7, r: 1.3 },
    { x: 10, z: 31.2, r: 0.85 }, { x: 24, z: 30.6, r: 1.2 },
    // West border
    { x: -31.0, z: -24, r: 1.0 }, { x: -30.7, z: -8, r: 1.35 },
    { x: -31.2, z: 8, r: 0.9 }, { x: -30.8, z: 22, r: 1.15 },
    // East border
    { x: 30.8, z: -20, r: 1.3 }, { x: 31.2, z: -5, r: 0.95 },
    { x: 30.6, z: 12, r: 1.25 }, { x: 31.0, z: 25, r: 1.05 },
    // Corner clusters
    { x: -29.5, z: -29.5, r: 1.5 }, { x: 29.5, z: -29.5, r: 1.4 },
    { x: -29.5, z: 29.5, r: 1.45 }, { x: 29.5, z: 29.5, r: 1.5 }
  ];

  for (let i = 0; i < rockCoords.length; i++) {
    const rc = rockCoords[i];
    const rockGeo = new THREE.DodecahedronGeometry(rc.r, 0);
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.set(rc.x, rc.r * 0.45, rc.z);
    rock.rotation.set((i * 0.6) % Math.PI, (i * 1.1) % Math.PI, (i * 0.4) % Math.PI);
    rock.scale.set(1.15, 0.85, 0.95);
    islandMesh.add(rock);
  }

  scene.add(islandMesh);

  // ==========================================================================
  // 3. SURROUNDING OCEAN / MOAT PLANE (y = -1.5m, 160m x 160m)
  // ==========================================================================
  const waterGeo = new THREE.PlaneGeometry(160, 160, 32, 32);
  const waterMat = new THREE.MeshLambertMaterial({
    color: 0x00a8ff,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.y = -1.5;
  scene.add(waterMesh);

  // Shoreline foam perimeter strip
  const foamMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide
  });
  const shorelineFoam = new THREE.Mesh(new THREE.RingGeometry(44.5, 46.5, 4), foamMat);
  shorelineFoam.rotation.x = -Math.PI / 2;
  shorelineFoam.position.y = -1.45;
  scene.add(shorelineFoam);

  // Store original water vertex positions for wave displacement
  const originalWaterZ = new Float32Array(waterGeo.attributes.position.count);
  for (let i = 0; i < originalWaterZ.length; i++) {
    originalWaterZ[i] = waterGeo.attributes.position.getZ(i);
  }

  // ==========================================================================
  // 4. 4 3D TEAM BASE BUNKERS (1000 HP, Parapets, Sandbags, Collapse States)
  // ==========================================================================
  const bunkerMeshes = {} as Record<TeamId, THREE.Group>;
  const bunkerFortNodes = {} as Record<TeamId, THREE.Group>;
  const bunkerHpState: Record<TeamId, number> = { red: 1000, blue: 1000, yellow: 1000, cyan: 1000 };

  const teams: TeamId[] = ['red', 'blue', 'yellow', 'cyan'];

  for (const team of teams) {
    const coord = ARENA_BASE_COORDINATES[team];
    const bunkerGroup = new THREE.Group();
    bunkerGroup.position.set(coord.x, 0, coord.z);

    // Direction pointing towards the outer corner
    const cornerDirX = coord.x > 0 ? 1 : -1;
    const cornerDirZ = coord.z > 0 ? 1 : -1;

    // Fort Node (holds fort base, parapets, trims, and sandbags)
    // Offset along corner diagonal by 3.2m so it fortifies the base without obstructing pad at (0, 0)
    const fortNode = new THREE.Group();
    fortNode.position.set(cornerDirX * 3.2, 0, cornerDirZ * 3.2);

    // 4.1 Concrete Fort Base: BoxGeometry(6.0, 2.5, 6.0) at y = 1.25m
    const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(6.0, 2.5, 6.0), concreteMat);
    baseMesh.position.y = 1.25;
    fortNode.add(baseMesh);

    // 4.2 Team-Colored Parapet Trim: BoxGeometry(6.2, 0.2, 6.2) at y = 2.55m
    const trimMesh = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.2, 6.2), teamMats[team]);
    trimMesh.position.y = 2.55;
    fortNode.add(trimMesh);

    // 4.3 4 Corner Parapet Posts & Battlements (y = 2.90m)
    const postGeo = new THREE.BoxGeometry(1.2, 0.7, 1.2);
    const postOffsets = [
      [-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]
    ];
    for (const [px, pz] of postOffsets) {
      const post = new THREE.Mesh(postGeo, concreteMat);
      post.position.set(px, 2.90, pz);
      fortNode.add(post);
    }

    // 4.4 Team Flag Mast on Fort Roof (y = 3.6m)
    const flagMast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8), gridLineMat);
    flagMast.position.set(0, 3.7, 0);
    const flagBanner = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.04), teamMats[team]);
    flagBanner.position.set(0.42, 4.2, 0);
    fortNode.add(flagMast, flagBanner);

    // 4.5 3-Tier Curved Sandbags (Flanking the entrance towards arena center)
    const sandbagArcCenter = { x: -cornerDirX * 2.2, z: -cornerDirZ * 2.2 };
    const sandbagAngle = Math.atan2(-cornerDirZ, -cornerDirX);

    // Tier 1: Bottom 4 sandbags (y = 0.20m)
    for (let s = -1.5; s <= 1.5; s += 1.0) {
      const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.1, 8), sandbagMat);
      const angle = sandbagAngle + s * 0.35;
      bag.position.set(
        sandbagArcCenter.x + Math.cos(angle) * 1.6,
        0.20,
        sandbagArcCenter.z + Math.sin(angle) * 1.6
      );
      bag.rotation.y = -angle;
      bag.rotation.z = Math.PI / 2;
      fortNode.add(bag);
    }

    // Tier 2: Middle 3 sandbags (y = 0.55m, staggered)
    for (let s = -1.0; s <= 1.0; s += 1.0) {
      const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 1.1, 8), sandbagMat);
      const angle = sandbagAngle + s * 0.35;
      bag.position.set(
        sandbagArcCenter.x + Math.cos(angle) * 1.6,
        0.55,
        sandbagArcCenter.z + Math.sin(angle) * 1.6
      );
      bag.rotation.y = -angle;
      bag.rotation.z = Math.PI / 2;
      fortNode.add(bag);
    }

    // Tier 3: Top 2 sandbags (y = 0.85m)
    for (let s = -0.5; s <= 0.5; s += 1.0) {
      const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.0, 8), sandbagMat);
      const angle = sandbagAngle + s * 0.35;
      bag.position.set(
        sandbagArcCenter.x + Math.cos(angle) * 1.6,
        0.85,
        sandbagArcCenter.z + Math.sin(angle) * 1.6
      );
      bag.rotation.y = -angle;
      bag.rotation.z = Math.PI / 2;
      fortNode.add(bag);
    }

    bunkerGroup.add(fortNode);
    scene.add(bunkerGroup);

    bunkerMeshes[team] = bunkerGroup;
    bunkerFortNodes[team] = fortNode;
  }

  // ==========================================================================
  // 5. 4 2x2x2 STACKING PADS (Platforms, Emissive Borders, Quadrant Grid)
  // ==========================================================================
  const padMeshes = {} as Record<TeamId, THREE.Group>;

  for (const team of teams) {
    const coord = ARENA_BASE_COORDINATES[team];
    const padGroup = new THREE.Group();
    padGroup.position.set(coord.x, 0.03, coord.z);

    // 5.1 Main Base Platform: BoxGeometry(4.2, 0.1, 4.2)
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 0.1, 4.2),
      padPlatformMat
    );
    platform.position.y = 0.05;
    padGroup.add(platform);

    // 5.2 Glowing Team-Colored Emissive Border: BoxGeometry(4.4, 0.06, 4.4)
    const border = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 0.06, 4.4),
      padBorderMats[team]
    );
    border.position.y = 0.03;
    padGroup.add(border);

    // 5.3 4 Quadrant Cell Guides on Pad Surface (y = 0.11m)
    // Divider Lines: X divider and Z divider
    const divX = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.02, 0.06), gridLineMat);
    divX.position.y = 0.11;
    const divZ = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 4.0), gridLineMat);
    divZ.position.y = 0.11;
    padGroup.add(divX, divZ);

    // 4 Quadrant Guide Squares corresponding to slots 0..3 (Layer 0)
    const quadOffsets = [
      { x: -0.95, z: -0.95 }, // Slot 0
      { x: 0.95, z: -0.95 },  // Slot 1
      { x: -0.95, z: 0.95 },  // Slot 2
      { x: 0.95, z: 0.95 }    // Slot 3
    ];
    for (const qo of quadOffsets) {
      const quadBox = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.015, 1.8),
        new THREE.MeshLambertMaterial({ color: 0x222f3e })
      );
      quadBox.position.set(qo.x, 0.105, qo.z);
      padGroup.add(quadBox);
    }

    scene.add(padGroup);
    padMeshes[team] = padGroup;
  }

  // ==========================================================================
  // 6. CENTRAL CRATE DROP ZONE & VERTICAL LIGHT BEAM COLUMN
  // ==========================================================================
  const dropZoneGroup = new THREE.Group();
  dropZoneGroup.position.set(0, 0.02, 0);

  // 6.1 Concentric Circular Ground Rings (#e67e22)
  const ring1 = new THREE.Mesh(
    new THREE.RingGeometry(1.8, 2.2, 32),
    new THREE.MeshBasicMaterial({ color: 0xe67e22, side: THREE.DoubleSide, opacity: 0.55, transparent: true })
  );
  ring1.rotation.x = -Math.PI / 2;

  const ring2 = new THREE.Mesh(
    new THREE.RingGeometry(3.8, 4.2, 32),
    new THREE.MeshBasicMaterial({ color: 0xe67e22, side: THREE.DoubleSide, opacity: 0.40, transparent: true })
  );
  ring2.rotation.x = -Math.PI / 2;

  const ring3 = new THREE.Mesh(
    new THREE.RingGeometry(5.8, 6.4, 32),
    new THREE.MeshBasicMaterial({ color: 0xe67e22, side: THREE.DoubleSide, opacity: 0.28, transparent: true })
  );
  ring3.rotation.x = -Math.PI / 2;

  // Crosshair guide bars
  const ch1 = new THREE.Mesh(new THREE.PlaneGeometry(12.8, 0.12), new THREE.MeshBasicMaterial({ color: 0xe67e22, transparent: true, opacity: 0.35 }));
  ch1.rotation.x = -Math.PI / 2;
  const ch2 = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 12.8), new THREE.MeshBasicMaterial({ color: 0xe67e22, transparent: true, opacity: 0.35 }));
  ch2.rotation.x = -Math.PI / 2;

  dropZoneGroup.add(ring1, ring2, ring3, ch1, ch2);
  scene.add(dropZoneGroup);

  // 6.2 Vertical Translucent Glowing Light Beam Column
  // CylinderGeometry(5.0, 5.0, 24, 24, 1, true)
  const beamGeo = new THREE.CylinderGeometry(5.0, 5.0, 24, 24, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff3e0,
    transparent: true,
    opacity: 0.20,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const lightBeamMesh = new THREE.Mesh(beamGeo, beamMat);
  lightBeamMesh.position.set(0, 12.0, 0);
  scene.add(lightBeamMesh);

  // ==========================================================================
  // 7. ARENA SCENE ELEMENTS RETURN OBJECT
  // ==========================================================================
  return {
    islandMesh,
    waterMesh,
    bunkerMeshes,
    padMeshes,
    lightBeamMesh,

    /**
     * Update dynamic procedural environment animations
     */
    update(time: number, dt: number): void {
      // 1. Water Wave Vertices Sine-Wave Animation
      const posAttr = waterGeo.attributes.position as THREE.BufferAttribute;
      const count = posAttr.count;
      for (let i = 0; i < count; i++) {
        const vx = posAttr.getX(i);
        const vy = posAttr.getY(i);
        const wave = Math.sin(time * 2.0 + vx * 0.12) * 0.12 + Math.cos(time * 1.6 + vy * 0.12) * 0.08;
        posAttr.setZ(i, wave);
      }
      posAttr.needsUpdate = true;

      // 2. Water Shimmer & Shoreline Foam Pulse
      waterMat.opacity = 0.65 + Math.sin(time * 2.5) * 0.05;
      foamMat.opacity = 0.35 + Math.sin(time * 3.0) * 0.10;

      // 3. Stacking Pad Glowing Border Pulse
      const padPulse = 0.55 + Math.sin(time * 3.5) * 0.15;
      for (const team of teams) {
        padBorderMats[team].emissiveIntensity = padPulse;
      }

      // 4. Central Drop Light Beam Sine-Wave Opacity & Slow Rotation
      beamMat.opacity = 0.15 + Math.sin(time * 3.0) * 0.08;
      lightBeamMesh.rotation.y = time * 0.20;
    },

    /**
     * Update 3D Base Bunker Health & Visual Damage / Collapse States
     */
    updateBunkerHealth(team: TeamId, hp: number): void {
      const clampedHp = Math.max(0, Math.min(1000, hp));
      bunkerHpState[team] = clampedHp;
      const fort = bunkerFortNodes[team];
      if (!fort) return;

      if (clampedHp > 750) {
        // State 1: Intact (751 - 1000 HP)
        fort.position.y = 0;
        fort.rotation.set(0, 0, 0);
        teamMats[team].color.setHex(TEAM_HEX_COLORS[team]);
      } else if (clampedHp > 400) {
        // State 2: Damaged (401 - 750 HP)
        fort.position.y = -0.08;
        fort.rotation.z = 0.02;
        fort.rotation.x = -0.015;
      } else if (clampedHp > 0) {
        // State 3: Critical (1 - 400 HP)
        fort.position.y = -0.35;
        fort.rotation.z = 0.06;
        fort.rotation.x = 0.04;
      } else {
        // State 4: Destroyed / Collapsed (0 HP)
        fort.position.y = -1.50; // Sunk into rubble
        fort.rotation.z = 0.12;
        fort.rotation.x = -0.08;
        teamMats[team].color.setHex(0x353b48); // Extinguished charred ash
      }
    }
  };
}

import * as THREE from 'three';
import { BuddyClass, TeamId, WeaponType } from '../types';

/* =========================================================================
   Palette & Color Constants
   ========================================================================= */
export const TEAM_COLORS: Record<TeamId, number> = {
  red: 0xff4757,
  blue: 0x2ed573,
  yellow: 0xffa502,
  cyan: 0x1e90ff
};

export const RIG_COLORS = {
  skin: 0xffe2cc,
  blush: 0xff7597,
  dark: 0x1e272e,
  white: 0xffffff,
  sparkle: 0xffffff,
  helmet: 0x3d4b38,
  starGold: 0xffdf8a,
  pinGold: 0xffd32a,
  steel: 0x485460,
  wood: 0xb57a38,
  woodDark: 0x8c5826,
  grenadeGreen: 0x27ae60,
  syringeFluid: 0x2ecc71,
  syringeGlass: 0xecf0f1,
  redCross: 0xff3838,
  constructorOrange: 0xe67e22,
  shadow: 0x000000
} as const;

export type ExpressionType = 'happy' | 'surprise' | 'angry' | 'wink';

/* =========================================================================
   Rig Instance Interface Contract (PROJECT.md)
   ========================================================================= */
export interface ChibiRigInstance {
  root: THREE.Group;
  bodyMesh: THREE.Group;
  faceGroup: THREE.Group;
  helmetGroup: THREE.Group;
  leftHandPivot: THREE.Group;
  rightHandPivot: THREE.Group;
  leftBootPivot: THREE.Group;
  rightBootPivot: THREE.Group;
  shadowMesh: THREE.Mesh;
  weaponSockets: {
    hand: THREE.Group;
    shoulder: THREE.Group;
    head: THREE.Group;
  };
  carriedCrateProp: THREE.Group;
  weapons: Record<WeaponType, THREE.Object3D | null>;
  classType: BuddyClass;
  team: TeamId;
  currentWeapon: WeaponType | 'crate';
  currentExpression: ExpressionType;

  setTeamColor(colorHex: number): void;
  setExpression(expression: ExpressionType): void;
  setEquippedWeapon(weapon: WeaponType | 'crate'): void;
  flashDamage(durationMs?: number): void;
  dispose(): void;
}

/* =========================================================================
   Shared Geometry Singletons (Memory & Draw Call Optimization)
   ========================================================================= */
class GeometryCache {
  // Body Geometries
  public static readonly bodyCylinder = new THREE.CylinderGeometry(0.46, 0.46, 0.48, 18);
  public static readonly bodyCap = new THREE.SphereGeometry(0.46, 18, 14);

  // Face Geometries
  public static readonly eyeSclera = (() => {
    const geo = new THREE.SphereGeometry(0.095, 12, 10);
    geo.scale(1, 1.25, 0.35);
    return geo;
  })();

  public static readonly pupil = (() => {
    const geo = new THREE.SphereGeometry(0.065, 10, 8);
    geo.scale(1, 1.2, 0.3);
    return geo;
  })();

  public static readonly sparkle1 = new THREE.SphereGeometry(0.024, 8, 8);
  public static readonly sparkle2 = new THREE.SphereGeometry(0.012, 6, 6);

  public static readonly blush = (() => {
    const geo = new THREE.SphereGeometry(0.055, 10, 8);
    geo.scale(1.4, 0.8, 0.2);
    return geo;
  })();

  public static readonly mouth = new THREE.TorusGeometry(0.04, 0.012, 8, 12, Math.PI);

  // Helmet Geometries
  public static readonly helmetDome = new THREE.SphereGeometry(0.49, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52);
  public static readonly helmetRim = new THREE.CylinderGeometry(0.52, 0.52, 0.04, 18);
  public static readonly starBadge = new THREE.CylinderGeometry(0.06, 0.06, 0.02, 5);

  // Limbs & Shadow
  public static readonly hand = new THREE.SphereGeometry(0.125, 12, 10);
  public static readonly boot = new THREE.BoxGeometry(0.24, 0.16, 0.32);
  public static readonly shadow = new THREE.CircleGeometry(0.55, 24);

  // Weapon Geometries
  public static readonly pistolBarrel = new THREE.BoxGeometry(0.08, 0.10, 0.24);
  public static readonly pistolGrip = new THREE.BoxGeometry(0.06, 0.14, 0.08);
  public static readonly pistolMuzzle = new THREE.CylinderGeometry(0.025, 0.025, 0.04, 8);

  public static readonly shotgunBarrel = new THREE.CylinderGeometry(0.035, 0.035, 0.44, 8);
  public static readonly shotgunReceiver = new THREE.BoxGeometry(0.09, 0.10, 0.16);
  public static readonly shotgunStock = new THREE.BoxGeometry(0.07, 0.10, 0.22);
  public static readonly shotgunPump = new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8);

  public static readonly grenadeBall = new THREE.SphereGeometry(0.12, 12, 10);
  public static readonly grenadeCap = new THREE.CylinderGeometry(0.04, 0.04, 0.08, 8);
  public static readonly grenadePin = new THREE.TorusGeometry(0.035, 0.008, 6, 12);

  public static readonly syringeTube = new THREE.CylinderGeometry(0.06, 0.06, 0.32, 10);
  public static readonly syringeLiquid = new THREE.CylinderGeometry(0.05, 0.05, 0.22, 10);
  public static readonly syringePlunger = new THREE.CylinderGeometry(0.03, 0.03, 0.18, 8);
  public static readonly syringeFlange = new THREE.CylinderGeometry(0.06, 0.06, 0.02, 8);
  public static readonly syringeTip = new THREE.ConeGeometry(0.02, 0.12, 8);

  public static readonly bazookaTube = new THREE.CylinderGeometry(0.10, 0.10, 0.90, 12);
  public static readonly bazookaCone = new THREE.ConeGeometry(0.13, 0.12, 12);
  public static readonly bazookaCollar = new THREE.CylinderGeometry(0.11, 0.11, 0.06, 12);
  public static readonly bazookaScope = new THREE.BoxGeometry(0.04, 0.06, 0.12);

  public static readonly crateCore = new THREE.BoxGeometry(0.68, 0.68, 0.68);
  public static readonly crateBrace = new THREE.BoxGeometry(0.04, 0.72, 0.015);
  public static readonly crateCorner = new THREE.BoxGeometry(0.12, 0.12, 0.12);
}

/* =========================================================================
   Shared Material Library
   ========================================================================= */
const sharedMats = {
  skin: new THREE.MeshLambertMaterial({ color: RIG_COLORS.skin }),
  blush: new THREE.MeshBasicMaterial({ color: RIG_COLORS.blush, transparent: true, opacity: 0.7 }),
  dark: new THREE.MeshBasicMaterial({ color: RIG_COLORS.dark }),
  white: new THREE.MeshBasicMaterial({ color: RIG_COLORS.white }),
  sparkle: new THREE.MeshBasicMaterial({ color: RIG_COLORS.sparkle }),
  helmet: new THREE.MeshLambertMaterial({ color: RIG_COLORS.helmet }),
  starGold: new THREE.MeshBasicMaterial({ color: RIG_COLORS.starGold }),
  pinGold: new THREE.MeshBasicMaterial({ color: RIG_COLORS.pinGold }),
  steel: new THREE.MeshLambertMaterial({ color: RIG_COLORS.steel }),
  wood: new THREE.MeshLambertMaterial({ color: RIG_COLORS.wood }),
  woodDark: new THREE.MeshLambertMaterial({ color: RIG_COLORS.woodDark }),
  grenade: new THREE.MeshLambertMaterial({ color: RIG_COLORS.grenadeGreen }),
  syringeGlass: new THREE.MeshLambertMaterial({ color: RIG_COLORS.syringeGlass, transparent: true, opacity: 0.85 }),
  syringeFluid: new THREE.MeshBasicMaterial({ color: RIG_COLORS.syringeFluid }),
  redCross: new THREE.MeshBasicMaterial({ color: RIG_COLORS.redCross }),
  constructorOrange: new THREE.MeshBasicMaterial({ color: RIG_COLORS.constructorOrange }),
  shadow: new THREE.MeshBasicMaterial({ color: RIG_COLORS.shadow, transparent: true, opacity: 0.35 })
};

/* =========================================================================
   Procedural 3D Weapon Mesh Builders
   ========================================================================= */

function createPistolMesh(): THREE.Group {
  const pistol = new THREE.Group();
  pistol.name = 'weapon_pistol';

  const barrel = new THREE.Mesh(GeometryCache.pistolBarrel, sharedMats.steel);
  barrel.position.set(0, 0.04, 0.06);

  const grip = new THREE.Mesh(GeometryCache.pistolGrip, sharedMats.dark);
  grip.rotation.x = -0.26;
  grip.position.set(0, -0.06, -0.02);

  const muzzle = new THREE.Mesh(GeometryCache.pistolMuzzle, sharedMats.steel);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, 0.04, 0.18);

  pistol.add(barrel, grip, muzzle);
  pistol.position.set(0.12, -0.02, 0.18);
  pistol.visible = false;
  return pistol;
}

function createShotgunMesh(): THREE.Group {
  const shotgun = new THREE.Group();
  shotgun.name = 'weapon_shotgun';

  const leftBarrel = new THREE.Mesh(GeometryCache.shotgunBarrel, sharedMats.steel);
  leftBarrel.rotation.x = Math.PI / 2;
  leftBarrel.position.set(-0.035, 0.04, 0.16);

  const rightBarrel = new THREE.Mesh(GeometryCache.shotgunBarrel, sharedMats.steel);
  rightBarrel.rotation.x = Math.PI / 2;
  rightBarrel.position.set(0.035, 0.04, 0.16);

  const receiver = new THREE.Mesh(GeometryCache.shotgunReceiver, sharedMats.dark);
  receiver.position.set(0, 0.03, -0.06);

  const stock = new THREE.Mesh(GeometryCache.shotgunStock, sharedMats.wood);
  stock.rotation.x = -0.15;
  stock.position.set(0, -0.04, -0.20);

  const pump = new THREE.Mesh(GeometryCache.shotgunPump, sharedMats.dark);
  pump.rotation.x = Math.PI / 2;
  pump.position.set(0, 0.00, 0.10);

  shotgun.add(leftBarrel, rightBarrel, receiver, stock, pump);
  shotgun.position.set(0.12, 0.00, 0.22);
  shotgun.visible = false;
  return shotgun;
}

function createGrenadeMesh(): THREE.Group {
  const grenade = new THREE.Group();
  grenade.name = 'weapon_grenade';

  const ball = new THREE.Mesh(GeometryCache.grenadeBall, sharedMats.grenade);
  const cap = new THREE.Mesh(GeometryCache.grenadeCap, sharedMats.steel);
  cap.position.y = 0.12;

  const pin = new THREE.Mesh(GeometryCache.grenadePin, sharedMats.pinGold);
  pin.position.set(0.05, 0.14, 0);

  grenade.add(ball, cap, pin);
  grenade.position.set(0.10, 0.00, 0.15);
  grenade.visible = false;
  return grenade;
}

function createMedicSyringeMesh(): THREE.Group {
  const syringe = new THREE.Group();
  syringe.name = 'weapon_medic';

  const tube = new THREE.Mesh(GeometryCache.syringeTube, sharedMats.syringeGlass);
  tube.rotation.z = Math.PI / 2;

  const liquid = new THREE.Mesh(GeometryCache.syringeLiquid, sharedMats.syringeFluid);
  liquid.rotation.z = Math.PI / 2;

  const plunger = new THREE.Mesh(GeometryCache.syringePlunger, sharedMats.steel);
  plunger.rotation.z = Math.PI / 2;
  plunger.position.x = -0.20;

  const flange = new THREE.Mesh(GeometryCache.syringeFlange, sharedMats.steel);
  flange.rotation.z = Math.PI / 2;
  flange.position.x = -0.29;

  const tip = new THREE.Mesh(GeometryCache.syringeTip, sharedMats.steel);
  tip.rotation.z = -Math.PI / 2;
  tip.position.x = 0.22;

  syringe.add(tube, liquid, plunger, flange, tip);
  syringe.position.set(0.12, 0.05, 0.20);
  syringe.visible = false;
  return syringe;
}

function createBazookaMesh(): THREE.Group {
  const bazooka = new THREE.Group();
  bazooka.name = 'weapon_bazooka';

  const tube = new THREE.Mesh(GeometryCache.bazookaTube, sharedMats.helmet);
  tube.rotation.x = Math.PI / 2;

  const exhaust = new THREE.Mesh(GeometryCache.bazookaCone, sharedMats.steel);
  exhaust.rotation.x = -Math.PI / 2;
  exhaust.position.z = -0.45;

  const collar = new THREE.Mesh(GeometryCache.bazookaCollar, sharedMats.steel);
  collar.rotation.x = Math.PI / 2;
  collar.position.z = 0.44;

  const scope = new THREE.Mesh(GeometryCache.bazookaScope, sharedMats.steel);
  scope.position.set(0, 0.12, 0.10);

  bazooka.add(tube, exhaust, collar, scope);
  bazooka.position.set(0.20, 0.15, 0.10);
  bazooka.visible = false;
  return bazooka;
}

function createCratePropMesh(): THREE.Group {
  const crateGroup = new THREE.Group();
  crateGroup.name = 'prop_carried_crate';

  const core = new THREE.Mesh(GeometryCache.crateCore, sharedMats.wood);
  crateGroup.add(core);

  // Cross-plank diagonal battens
  const frontBrace1 = new THREE.Mesh(GeometryCache.crateBrace, sharedMats.woodDark);
  frontBrace1.rotation.z = Math.PI / 4;
  frontBrace1.position.z = 0.345;
  const frontBrace2 = new THREE.Mesh(GeometryCache.crateBrace, sharedMats.woodDark);
  frontBrace2.rotation.z = -Math.PI / 4;
  frontBrace2.position.z = 0.345;
  crateGroup.add(frontBrace1, frontBrace2);

  crateGroup.position.set(0, 1.05, 0);
  crateGroup.visible = false;
  return crateGroup;
}

/* =========================================================================
   Class Badge Helper
   ========================================================================= */
function createClassBadge(classType: BuddyClass): THREE.Object3D {
  const badgeGroup = new THREE.Group();
  badgeGroup.position.set(0, 0.20, 0.47);

  if (classType === 'healer') {
    // Red Cross emblem
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.015, 16),
      sharedMats.white
    );
    disc.rotation.x = Math.PI / 2;

    const vBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, 0.08, 0.02),
      sharedMats.redCross
    );
    const hBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.025, 0.02),
      sharedMats.redCross
    );
    badgeGroup.add(disc, vBar, hBar);
  } else if (classType === 'constructor') {
    // Industrial hexagon / hazard insignia
    const hexBadge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.065, 0.02, 6),
      sharedMats.constructorOrange
    );
    hexBadge.rotation.x = Math.PI / 2;
    badgeGroup.add(hexBadge);
  } else {
    // Default / Fighter: Golden 5-point Star Medallion
    const star = new THREE.Mesh(GeometryCache.starBadge, sharedMats.starGold);
    star.rotation.x = Math.PI / 2;
    badgeGroup.add(star);
  }

  return badgeGroup;
}

/* =========================================================================
   Main Factory Function: createChibiBuddyRig
   ========================================================================= */
export function createChibiBuddyRig(team: TeamId, classType: BuddyClass = 'fighter'): ChibiRigInstance {
  const root = new THREE.Group();
  root.name = `chibi_rig_${team}_${classType}`;

  // 1. Instance Material (Cloned for per-character color and damage flash)
  const baseColor = TEAM_COLORS[team] ?? TEAM_COLORS.red;
  const bodyMat = new THREE.MeshLambertMaterial({ color: baseColor });

  // 2. Body Group (Squash & Stretch Joint at y = 0.70)
  const bodyMesh = new THREE.Group();
  bodyMesh.name = 'bodyMesh';
  bodyMesh.position.y = 0.70;
  root.add(bodyMesh);

  // Plump Capsule: Cylinder + 2 Hemisphere Caps
  const bodyCylinder = new THREE.Mesh(GeometryCache.bodyCylinder, bodyMat);
  const bodyCapTop = new THREE.Mesh(GeometryCache.bodyCap, bodyMat);
  bodyCapTop.position.y = 0.24;
  const bodyCapBottom = new THREE.Mesh(GeometryCache.bodyCap, bodyMat);
  bodyCapBottom.position.y = -0.24;
  bodyMesh.add(bodyCylinder, bodyCapTop, bodyCapBottom);

  // 3. Face Group (Eyes, Dual Sparkles, Blush, Smiling Torus Mouth)
  const faceGroup = new THREE.Group();
  faceGroup.name = 'faceGroup';
  faceGroup.position.set(0, 0.08, 0.38);
  bodyMesh.add(faceGroup);

  // Left Eye
  const leftEye = new THREE.Mesh(GeometryCache.eyeSclera, sharedMats.white);
  leftEye.position.set(-0.15, 0.05, 0.02);
  const leftPupil = new THREE.Mesh(GeometryCache.pupil, sharedMats.dark);
  leftPupil.position.set(-0.15, 0.05, 0.05);
  const leftSp1 = new THREE.Mesh(GeometryCache.sparkle1, sharedMats.sparkle);
  leftSp1.position.set(-0.165, 0.08, 0.075);
  const leftSp2 = new THREE.Mesh(GeometryCache.sparkle2, sharedMats.sparkle);
  leftSp2.position.set(-0.13, 0.025, 0.075);
  faceGroup.add(leftEye, leftPupil, leftSp1, leftSp2);

  // Right Eye
  const rightEye = new THREE.Mesh(GeometryCache.eyeSclera, sharedMats.white);
  rightEye.position.set(0.15, 0.05, 0.02);
  const rightPupil = new THREE.Mesh(GeometryCache.pupil, sharedMats.dark);
  rightPupil.position.set(0.15, 0.05, 0.05);
  const rightSp1 = new THREE.Mesh(GeometryCache.sparkle1, sharedMats.sparkle);
  rightSp1.position.set(0.135, 0.08, 0.075);
  const rightSp2 = new THREE.Mesh(GeometryCache.sparkle2, sharedMats.sparkle);
  rightSp2.position.set(0.17, 0.025, 0.075);
  faceGroup.add(rightEye, rightPupil, rightSp1, rightSp2);

  // Rosy Cheek Blushes
  const leftBlush = new THREE.Mesh(GeometryCache.blush, sharedMats.blush);
  leftBlush.position.set(-0.25, -0.04, 0.03);
  const rightBlush = new THREE.Mesh(GeometryCache.blush, sharedMats.blush);
  rightBlush.position.set(0.25, -0.04, 0.03);
  faceGroup.add(leftBlush, rightBlush);

  // Smiling Torus Mouth
  const mouthMesh = new THREE.Mesh(GeometryCache.mouth, sharedMats.dark);
  mouthMesh.rotation.z = Math.PI; // Inverted half torus = happy smile
  mouthMesh.position.set(0, -0.07, 0.055);
  faceGroup.add(mouthMesh);

  // 4. Military Helmet Group
  const helmetGroup = new THREE.Group();
  helmetGroup.name = 'helmetGroup';
  helmetGroup.position.set(0, 0.32, 0);

  const helmetDome = new THREE.Mesh(GeometryCache.helmetDome, sharedMats.helmet);
  const helmetRim = new THREE.Mesh(GeometryCache.helmetRim, sharedMats.helmet);
  helmetRim.position.y = -0.02;
  const badgeMedallion = createClassBadge(classType);

  helmetGroup.add(helmetDome, helmetRim, badgeMedallion);
  bodyMesh.add(helmetGroup);

  // 5. Chubby Mitten Hands on Pivots
  const leftHandPivot = new THREE.Group();
  leftHandPivot.name = 'leftHandPivot';
  leftHandPivot.position.set(-0.52, -0.02, 0);
  const leftHand = new THREE.Mesh(GeometryCache.hand, sharedMats.skin);
  leftHandPivot.add(leftHand);
  bodyMesh.add(leftHandPivot);

  const rightHandPivot = new THREE.Group();
  rightHandPivot.name = 'rightHandPivot';
  rightHandPivot.position.set(0.52, -0.02, 0);
  const rightHand = new THREE.Mesh(GeometryCache.hand, sharedMats.skin);
  rightHandPivot.add(rightHand);
  bodyMesh.add(rightHandPivot);

  // 6. Combat Boots on Independent Foot Pivots
  const leftBootPivot = new THREE.Group();
  leftBootPivot.name = 'leftBootPivot';
  leftBootPivot.position.set(-0.23, 0.14, 0);
  const leftBoot = new THREE.Mesh(GeometryCache.boot, sharedMats.dark);
  leftBootPivot.add(leftBoot);
  root.add(leftBootPivot);

  const rightBootPivot = new THREE.Group();
  rightBootPivot.name = 'rightBootPivot';
  rightBootPivot.position.set(0.23, 0.14, 0);
  const rightBoot = new THREE.Mesh(GeometryCache.boot, sharedMats.dark);
  rightBootPivot.add(rightBoot);
  root.add(rightBootPivot);

  // 7. Ground Platform Shadow Circle
  const shadowMesh = new THREE.Mesh(GeometryCache.shadow, sharedMats.shadow);
  shadowMesh.name = 'shadowMesh';
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.01;
  root.add(shadowMesh);

  // 8. Sockets & Weapon Meshes
  const handSocket = new THREE.Group();
  handSocket.name = 'socket_hand';
  rightHandPivot.add(handSocket);

  const shoulderSocket = new THREE.Group();
  shoulderSocket.name = 'socket_shoulder';
  bodyMesh.add(shoulderSocket);

  const headSocket = new THREE.Group();
  headSocket.name = 'socket_head';
  bodyMesh.add(headSocket);

  const pistolMesh = createPistolMesh();
  const shotgunMesh = createShotgunMesh();
  const grenadeMesh = createGrenadeMesh();
  const syringeMesh = createMedicSyringeMesh();
  handSocket.add(pistolMesh, shotgunMesh, grenadeMesh, syringeMesh);

  const bazookaMesh = createBazookaMesh();
  shoulderSocket.add(bazookaMesh);

  const carriedCrateProp = createCratePropMesh();
  headSocket.add(carriedCrateProp);

  const weaponsMap: Record<WeaponType, THREE.Object3D | null> = {
    none: null,
    pistol: pistolMesh,
    shotgun: shotgunMesh,
    grenade: grenadeMesh,
    medic: syringeMesh,
    bazooka: bazookaMesh
  };

  // State Tracking
  let activeWeapon: WeaponType | 'crate' = 'none';
  let activeExpr: ExpressionType = 'happy';

  // 9. Methods Implementation
  const setTeamColor = (colorHex: number): void => {
    bodyMat.color.setHex(colorHex);
  };

  const setExpression = (expr: ExpressionType): void => {
    activeExpr = expr;
    switch (expr) {
      case 'happy':
        leftEye.scale.set(1, 1.25, 0.35);
        rightEye.scale.set(1, 1.25, 0.35);
        rightPupil.visible = true;
        rightSp1.visible = true;
        rightSp2.visible = true;
        mouthMesh.scale.set(1, 1, 1);
        mouthMesh.rotation.z = Math.PI; // Smile
        leftBlush.visible = true;
        rightBlush.visible = true;
        break;

      case 'surprise':
        leftEye.scale.set(1.2, 1.4, 0.35);
        rightEye.scale.set(1.2, 1.4, 0.35);
        rightPupil.visible = true;
        rightSp1.visible = true;
        rightSp2.visible = true;
        mouthMesh.scale.set(0.8, 1.6, 1);
        mouthMesh.rotation.z = 0; // O shape
        leftBlush.visible = false;
        rightBlush.visible = false;
        break;

      case 'angry':
        leftEye.scale.set(1, 0.7, 0.35);
        rightEye.scale.set(1, 0.7, 0.35);
        rightPupil.visible = true;
        rightSp1.visible = true;
        rightSp2.visible = true;
        mouthMesh.scale.set(1.2, 0.6, 1);
        mouthMesh.rotation.z = 0; // Flat frown
        leftBlush.visible = false;
        rightBlush.visible = false;
        break;

      case 'wink':
        leftEye.scale.set(1, 1.3, 0.35);
        rightEye.scale.set(1, 0.15, 0.35); // Closed wink line
        rightPupil.visible = false;
        rightSp1.visible = false;
        rightSp2.visible = false;
        mouthMesh.scale.set(1, 1, 1);
        mouthMesh.rotation.z = Math.PI;
        leftBlush.visible = true;
        rightBlush.visible = true;
        break;
    }
  };

  const setEquippedWeapon = (weapon: WeaponType | 'crate'): void => {
    activeWeapon = weapon;
    pistolMesh.visible = (weapon === 'pistol');
    shotgunMesh.visible = (weapon === 'shotgun');
    grenadeMesh.visible = (weapon === 'grenade');
    syringeMesh.visible = (weapon === 'medic');
    bazookaMesh.visible = (weapon === 'bazooka');
    carriedCrateProp.visible = (weapon === 'crate');
  };

  const flashDamage = (durationMs: number = 120): void => {
    const originalColor = bodyMat.color.getHex();
    bodyMat.color.setHex(0xffffff); // White flash
    setTimeout(() => {
      bodyMat.color.setHex(originalColor);
    }, durationMs);
  };

  const dispose = (): void => {
    bodyMat.dispose();
  };

  return {
    root,
    bodyMesh,
    faceGroup,
    helmetGroup,
    leftHandPivot,
    rightHandPivot,
    leftBootPivot,
    rightBootPivot,
    shadowMesh,
    weaponSockets: {
      hand: handSocket,
      shoulder: shoulderSocket,
      head: headSocket
    },
    carriedCrateProp,
    weapons: weaponsMap,
    classType,
    team,
    get currentWeapon() {
      return activeWeapon;
    },
    get currentExpression() {
      return activeExpr;
    },
    setTeamColor,
    setExpression,
    setEquippedWeapon,
    flashDamage,
    dispose
  };
}

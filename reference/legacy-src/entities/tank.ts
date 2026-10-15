import * as THREE from 'three';
import { BuddyEntity } from './buddy';
import { TeamId, Vector3D } from '../types';

/* =========================================================================
   Vehicle Types & Interfaces
   ========================================================================= */

export interface TankDriveInputs {
  throttle: number;  // -1.0 (reverse) to +1.0 (forward)
  steer: number;     // -1.0 (turn left) to +1.0 (turn right)
  aimAngle?: number; // Optional turret aim angle in radians
  fire?: boolean;    // Trigger cannon fire
}

export interface TankShellProjectile {
  id: string;
  team: TeamId;
  ownerId: string;
  position: Vector3D;
  velocity: Vector3D;
  directDamage: number;
  blastRadius: number;
  blastDamage: number;
  lifeTime: number;
  detonated: boolean;
}

export interface TankRigInstance {
  root: THREE.Group;
  hullGroup: THREE.Group;
  turretPivot: THREE.Group;
  recoilGroup: THREE.Group;
  cannonMesh: THREE.Mesh;
  muzzleSocket: THREE.Group;
  driverSeatSocket: THREE.Group;
  leftWheels: THREE.Mesh[];
  rightWheels: THREE.Mesh[];
  shadowMesh: THREE.Mesh;
  particleGroup: THREE.Group;
  flashDamage(durationMs?: number): void;
  playMuzzleFlash(): void;
  playExplosionBurst(): void;
  dispose(): void;
}

/* =========================================================================
   Color Constants & Materials
   ========================================================================= */

export const TANK_TEAM_COLORS: Record<TeamId, { primary: number; secondary: number; accent: number }> = {
  red: { primary: 0xff4757, secondary: 0xc0392b, accent: 0xe74c3c },
  blue: { primary: 0x27ae60, secondary: 0x1e824c, accent: 0x2ecc71 }, // Green/blue palette
  yellow: { primary: 0xffa502, secondary: 0xd35400, accent: 0xf39c12 },
  cyan: { primary: 0x2980b9, secondary: 0x1f618d, accent: 0x3498db }
};

export const TANK_CHASSIS_COLORS = {
  treads: 0x2c3e50,
  treadRubber: 0x1e272e,
  roadWheels: 0x34495e,
  wheelHubs: 0x7f8c8d,
  cannonGunmetal: 0x16a085,
  mantletSteel: 0x2c3e50,
  exhaustPipe: 0x3d3d3d,
  grilleDark: 0x1a1e22,
  muzzleFlash: 0xffaa00,
  smokeParticle: 0xbdc3c7,
  wreckBurnt: 0x2d3436
} as const;

/* =========================================================================
   3D Procedural Tank Model Generator (100% Three.js Primitives)
   ========================================================================= */

export function createTankMesh(tank: HeavyBattleTank): TankRigInstance {
  const root = new THREE.Group();
  root.name = `tank_root_${tank.id}`;
  const palette = TANK_TEAM_COLORS[tank.team] || TANK_TEAM_COLORS.red;

  // Materials
  const armorMat = new THREE.MeshLambertMaterial({ color: palette.primary });
  const darkArmorMat = new THREE.MeshLambertMaterial({ color: palette.secondary });
  const accentMat = new THREE.MeshLambertMaterial({ color: palette.accent });
  const treadMat = new THREE.MeshLambertMaterial({ color: TANK_CHASSIS_COLORS.treads });
  const treadDarkMat = new THREE.MeshBasicMaterial({ color: TANK_CHASSIS_COLORS.treadRubber });
  const wheelMat = new THREE.MeshLambertMaterial({ color: TANK_CHASSIS_COLORS.roadWheels });
  const hubMat = new THREE.MeshBasicMaterial({ color: TANK_CHASSIS_COLORS.wheelHubs });
  const cannonMat = new THREE.MeshLambertMaterial({ color: TANK_CHASSIS_COLORS.cannonGunmetal });
  const mantletMat = new THREE.MeshLambertMaterial({ color: TANK_CHASSIS_COLORS.mantletSteel });
  const exhaustMat = new THREE.MeshLambertMaterial({ color: TANK_CHASSIS_COLORS.exhaustPipe });
  const grilleMat = new THREE.MeshBasicMaterial({ color: TANK_CHASSIS_COLORS.grilleDark });

  // 1. HULL & CHASSIS (BoxGeometry 2.4 x 0.9 x 3.2)
  const hullGroup = new THREE.Group();
  hullGroup.name = 'tank_hull_group';
  root.add(hullGroup);

  const chassisMesh = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.9, 3.2),
    darkArmorMat
  );
  chassisMesh.position.set(0, 0.65, 0);
  chassisMesh.castShadow = true;
  chassisMesh.receiveShadow = true;
  hullGroup.add(chassisMesh);

  // Sloped Front Glacis Plate
  const glacisPlate = new THREE.Mesh(
    new THREE.BoxGeometry(2.36, 0.18, 1.15),
    armorMat
  );
  glacisPlate.position.set(0, 0.88, 1.25);
  glacisPlate.rotation.x = -0.42;
  glacisPlate.castShadow = true;
  hullGroup.add(glacisPlate);

  // Side Armor Skirts (Left and Right)
  const leftSkirt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.58, 3.1), armorMat);
  leftSkirt.position.set(-1.22, 0.62, 0);
  const rightSkirt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.58, 3.1), armorMat);
  rightSkirt.position.set(1.22, 0.62, 0);
  hullGroup.add(leftSkirt, rightSkirt);

  // Rear Engine Grille and Dual Exhausts
  const engineGrille = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.95), grilleMat);
  engineGrille.position.set(0, 1.12, -0.9);
  hullGroup.add(engineGrille);

  const exhaustGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.45, 12);
  const leftExhaust = new THREE.Mesh(exhaustGeo, exhaustMat);
  leftExhaust.position.set(-0.85, 0.85, -1.62);
  leftExhaust.rotation.x = 0.3;
  const rightExhaust = new THREE.Mesh(exhaustGeo, exhaustMat);
  rightExhaust.position.set(0.85, 0.85, -1.62);
  rightExhaust.rotation.x = 0.3;
  hullGroup.add(leftExhaust, rightExhaust);

  // 2. CATERPILLAR TREADS & ROAD WHEELS
  const tracksGroup = new THREE.Group();
  tracksGroup.name = 'tank_tracks_group';
  hullGroup.add(tracksGroup);

  const leftWheels: THREE.Mesh[] = [];
  const rightWheels: THREE.Mesh[] = [];

  const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.44, 16);
  const hubGeo = new THREE.CylinderGeometry(0.10, 0.10, 0.46, 10);
  const sprocketGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.44, 16);

  const trackSides = [
    { x: -1.22, wheels: leftWheels },
    { x: 1.22, wheels: rightWheels }
  ];

  for (const side of trackSides) {
    const sideGroup = new THREE.Group();
    sideGroup.position.set(side.x, 0, 0);
    tracksGroup.add(sideGroup);

    const beltMesh = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.65, 3.3), treadDarkMat);
    beltMesh.position.set(0, 0.42, 0);
    sideGroup.add(beltMesh);

    const topTread = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.06, 3.34), treadMat);
    topTread.position.set(0, 0.74, 0);
    const bottomTread = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.06, 3.34), treadMat);
    bottomTread.position.set(0, 0.10, 0);
    sideGroup.add(topTread, bottomTread);

    const wheelZOffsets = [-1.05, -0.35, 0.35, 1.05];
    for (const wz of wheelZOffsets) {
      const wheelMesh = new THREE.Mesh(wheelGeo, wheelMat);
      wheelMesh.rotation.z = Math.PI / 2;
      wheelMesh.position.set(0, 0.36, wz);

      const hubMesh = new THREE.Mesh(hubGeo, hubMat);
      hubMesh.rotation.z = Math.PI / 2;
      hubMesh.position.set(0, 0.36, wz);

      sideGroup.add(wheelMesh, hubMesh);
      side.wheels.push(wheelMesh);
    }

    const frontSprocket = new THREE.Mesh(sprocketGeo, wheelMat);
    frontSprocket.rotation.z = Math.PI / 2;
    frontSprocket.position.set(0, 0.52, 1.50);
    const rearIdler = new THREE.Mesh(sprocketGeo, wheelMat);
    rearIdler.rotation.z = Math.PI / 2;
    rearIdler.position.set(0, 0.52, -1.50);
    sideGroup.add(frontSprocket, rearIdler);
    side.wheels.push(frontSprocket, rearIdler);
  }

  // 3. ROTATING TURRET DOME
  const turretPivot = new THREE.Group();
  turretPivot.name = 'tank_turret_pivot';
  turretPivot.position.set(0, 1.10, -0.10);
  root.add(turretPivot);

  const turretBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 1.15, 0.65, 18),
    armorMat
  );
  turretBase.position.set(0, 0.32, 0);
  turretBase.castShadow = true;
  turretPivot.add(turretBase);

  const turretDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.94, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
    accentMat
  );
  turretDome.position.set(0, 0.64, 0);
  turretPivot.add(turretDome);

  const hatchRing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.38, 0.12, 16),
    mantletMat
  );
  hatchRing.position.set(0, 0.76, -0.25);
  turretPivot.add(hatchRing);

  const hatchCover = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.36, 0.04, 16),
    darkArmorMat
  );
  hatchCover.position.set(0, 0.84, -0.42);
  hatchCover.rotation.x = -0.55;
  turretPivot.add(hatchCover);

  const driverSeatSocket = new THREE.Group();
  driverSeatSocket.name = 'tank_driver_seat_socket';
  driverSeatSocket.position.set(0, 0.65, -0.25);
  turretPivot.add(driverSeatSocket);

  const mantlet = new THREE.Mesh(
    new THREE.BoxGeometry(0.70, 0.48, 0.50),
    mantletMat
  );
  mantlet.position.set(0, 0.35, 1.05);
  turretPivot.add(mantlet);

  // 4. CANNON BARREL & RECOIL ASSEMBLY
  const recoilGroup = new THREE.Group();
  recoilGroup.name = 'tank_recoil_group';
  recoilGroup.position.set(0, 0.35, 1.25);
  turretPivot.add(recoilGroup);

  const barrelGeo = new THREE.CylinderGeometry(0.13, 0.16, 2.4, 16);
  barrelGeo.rotateX(Math.PI / 2);
  const cannonMesh = new THREE.Mesh(barrelGeo, cannonMat);
  cannonMesh.position.set(0, 0, 1.20);
  cannonMesh.castShadow = true;
  recoilGroup.add(cannonMesh);

  const ringGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.10, 16);
  ringGeo.rotateX(Math.PI / 2);
  const ring1 = new THREE.Mesh(ringGeo, mantletMat);
  ring1.position.set(0, 0, 0.70);
  const ring2 = new THREE.Mesh(ringGeo, mantletMat);
  ring2.position.set(0, 0, 1.80);
  recoilGroup.add(ring1, ring2);

  const muzzleBrake = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.26, 0.38),
    mantletMat
  );
  muzzleBrake.position.set(0, 0, 2.45);
  recoilGroup.add(muzzleBrake);

  const muzzleSocket = new THREE.Group();
  muzzleSocket.name = 'tank_muzzle_socket';
  muzzleSocket.position.set(0, 0, 2.70);
  recoilGroup.add(muzzleSocket);

  // 5. GROUND SHADOW & PARTICLE GROUP
  const shadowGeo = new THREE.PlaneGeometry(3.2, 4.4);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.42,
    depthWrite: false
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.set(0, 0.02, 0);
  root.add(shadowMesh);

  const particleGroup = new THREE.Group();
  root.add(particleGroup);

  // 6. VISUAL FEEDBACK HELPERS
  const flashDamage = (durationMs: number = 140): void => {
    const origArmor = armorMat.color.getHex();
    const origDark = darkArmorMat.color.getHex();
    armorMat.color.setHex(0xffffff);
    darkArmorMat.color.setHex(0xffffff);
    setTimeout(() => {
      armorMat.color.setHex(origArmor);
      darkArmorMat.color.setHex(origDark);
    }, durationMs);
  };

  const playMuzzleFlash = (): void => {
    const flashMat = new THREE.MeshBasicMaterial({
      color: TANK_CHASSIS_COLORS.muzzleFlash,
      transparent: true,
      opacity: 0.95
    });
    const flashMesh = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), flashMat);
    muzzleSocket.add(flashMesh);

    const smokeGeo = new THREE.SphereGeometry(0.24, 8, 8);
    const smokeMat = new THREE.MeshBasicMaterial({
      color: TANK_CHASSIS_COLORS.smokeParticle,
      transparent: true,
      opacity: 0.75
    });
    const smokeMesh = new THREE.Mesh(smokeGeo, smokeMat);
    smokeMesh.position.set(0, 0, 0.2);
    muzzleSocket.add(smokeMesh);

    setTimeout(() => {
      muzzleSocket.remove(flashMesh);
      flashMat.dispose();
    }, 80);

    setTimeout(() => {
      muzzleSocket.remove(smokeMesh);
      smokeMat.dispose();
    }, 280);
  };

  const playExplosionBurst = (): void => {
    armorMat.color.setHex(TANK_CHASSIS_COLORS.wreckBurnt);
    darkArmorMat.color.setHex(TANK_CHASSIS_COLORS.wreckBurnt);
    accentMat.color.setHex(TANK_CHASSIS_COLORS.wreckBurnt);
  };

  const dispose = (): void => {
    armorMat.dispose();
    darkArmorMat.dispose();
    accentMat.dispose();
    treadMat.dispose();
    treadDarkMat.dispose();
    wheelMat.dispose();
    hubMat.dispose();
    cannonMat.dispose();
    mantletMat.dispose();
    exhaustMat.dispose();
    grilleMat.dispose();
    shadowMat.dispose();
  };

  return {
    root,
    hullGroup,
    turretPivot,
    recoilGroup,
    cannonMesh,
    muzzleSocket,
    driverSeatSocket,
    leftWheels,
    rightWheels,
    shadowMesh,
    particleGroup,
    flashDamage,
    playMuzzleFlash,
    playExplosionBurst,
    dispose
  };
}

/* =========================================================================
   HeavyBattleTank Entity Logic
   ========================================================================= */

export class HeavyBattleTank {
  public id: string;
  public team: TeamId;
  public hp: number;
  public maxHp: number = 500;
  public position: Vector3D;
  public velocity: Vector3D;
  public heading: number;      // Body yaw in radians (0 = pointing +Z)
  public turretAngle: number;  // Turret yaw in radians
  public driverId: string | null = null;
  public isDestroyed: boolean = false;

  // Vehicle Dynamics
  public readonly maxSpeed: number = 6.0;      // m/s forward
  public readonly reverseSpeed: number = 3.5;  // m/s reverse
  public readonly turnRate: number = 2.0;      // rad/s steering yaw rate

  // Cannon Ballistics
  public readonly cannonDirectDamage: number = 80;
  public readonly cannonBlastRadius: number = 3.5;
  public readonly cannonBlastDamage: number = 60;
  public readonly cannonCooldownTime: number = 1.2; // seconds
  public fireCooldown: number = 0;
  public recoilOffset: number = 0; // Negative offset along Z when recoiling

  // Track Distance for Wheel Animation
  public trackDistance: number = 0;

  constructor(id: string, team: TeamId, startPos: Vector3D = { x: 0, y: 0, z: 0 }, initialHeading: number = 0) {
    this.id = id;
    this.team = team;
    this.hp = this.maxHp;
    this.position = { ...startPos };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.heading = initialHeading;
    this.turretAngle = initialHeading;
  }

  public get isOccupied(): boolean {
    return this.driverId !== null;
  }

  public mount(buddy: BuddyEntity): boolean {
    if (this.isDestroyed || this.isOccupied || buddy.isKnocked || buddy.isCarryingCrate) {
      return false;
    }

    this.driverId = buddy.id;
    buddy.isInTank = true;
    buddy.mountedTankId = this.id;
    buddy.drivingVehicleId = this.id;

    buddy.position.x = this.position.x;
    buddy.position.y = this.position.y;
    buddy.position.z = this.position.z;
    buddy.velocity.x = 0;
    buddy.velocity.z = 0;

    return true;
  }

  public dismount(forced: boolean = false, allBuddies?: BuddyEntity[]): BuddyEntity | null {
    if (!this.driverId) return null;

    let driver: BuddyEntity | null = null;
    if (allBuddies) {
      driver = allBuddies.find((b) => b.id === this.driverId) || null;
    }

    if (driver) {
      driver.isInTank = false;
      driver.mountedTankId = null;
      driver.drivingVehicleId = null;

      if (forced) {
        // Ejection damage on tank destruction (30 HP)
        driver.takeDamage(30);

        // Knockback ejection impulse: upward and outward
        const scatterAngle = Math.random() * Math.PI * 2;
        driver.velocity.y = 6.0;
        driver.velocity.x = Math.cos(scatterAngle) * 5.0;
        driver.velocity.z = Math.sin(scatterAngle) * 5.0;
        driver.position.x = this.position.x + Math.cos(scatterAngle) * 1.8;
        driver.position.y = 1.2;
        driver.position.z = this.position.z + Math.sin(scatterAngle) * 1.8;
      } else {
        // Safe dismount: place beside tank flank
        const sideOffset = Math.sin(this.heading + Math.PI / 2) * 1.8;
        const frontOffset = Math.cos(this.heading + Math.PI / 2) * 1.8;
        driver.position.x = this.position.x + sideOffset;
        driver.position.y = 0.7;
        driver.position.z = this.position.z + frontOffset;
        driver.velocity.x = 0;
        driver.velocity.y = 0;
        driver.velocity.z = 0;
      }
    }

    this.driverId = null;
    return driver;
  }

  public takeDamage(amount: number, allBuddies?: BuddyEntity[]): number {
    if (this.isDestroyed || amount <= 0) return 0;

    const actual = Math.min(this.hp, Math.max(0, amount));
    this.hp -= actual;

    if (this.hp <= 0) {
      this.hp = 0;
      this.isDestroyed = true;
      if (this.driverId) {
        this.dismount(true, allBuddies);
      }
    }

    return actual;
  }

  public repair(amount: number): number {
    if (this.isDestroyed || amount <= 0) return 0;
    const prev = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - prev;
  }

  public update(dt: number, inputs: TankDriveInputs, allBuddies?: BuddyEntity[]): void {
    if (this.isDestroyed) {
      this.velocity.x = 0;
      this.velocity.z = 0;
      return;
    }

    const safeDt = Math.max(0, dt);

    // Cooldown countdown
    if (this.fireCooldown > 0) {
      this.fireCooldown = Math.max(0, this.fireCooldown - safeDt);
    }

    // Recoil recovery with stable exponential decay
    if (Math.abs(this.recoilOffset) > 0.001) {
      this.recoilOffset *= Math.exp(-8.0 * safeDt);
    } else {
      this.recoilOffset = 0;
    }

    // Steering Yaw Rate (2.0 rad/s)
    const steer = Math.max(-1.0, Math.min(1.0, inputs.steer || 0));
    if (Math.abs(steer) > 0.01) {
      this.heading -= steer * this.turnRate * safeDt;
      this.heading = Math.atan2(Math.sin(this.heading), Math.cos(this.heading));
    }

    // Turret Aim Orientation
    if (inputs.aimAngle !== undefined) {
      this.turretAngle = inputs.aimAngle;
    } else {
      this.turretAngle = this.heading;
    }

    // Forward/Backward Throttle Speed (6.0 m/s max forward, -3.5 m/s reverse)
    const throttle = Math.max(-1.0, Math.min(1.0, inputs.throttle || 0));
    let targetSpeed = 0;
    if (throttle > 0.05) {
      targetSpeed = throttle * this.maxSpeed;
    } else if (throttle < -0.05) {
      targetSpeed = throttle * this.reverseSpeed;
    }

    const forwardX = Math.sin(this.heading);
    const forwardZ = Math.cos(this.heading);

    this.velocity.x = forwardX * targetSpeed;
    this.velocity.z = forwardZ * targetSpeed;

    this.position.x += this.velocity.x * safeDt;
    this.position.z += this.velocity.z * safeDt;

    this.trackDistance += targetSpeed * safeDt;

    // Arena boundary clamp [-30, +30]
    const boundHalfSize = 30.0;
    this.position.x = Math.max(-boundHalfSize, Math.min(boundHalfSize, this.position.x));
    this.position.z = Math.max(-boundHalfSize, Math.min(boundHalfSize, this.position.z));

    // Synchronize driver position
    if (this.driverId && allBuddies) {
      const driver = allBuddies.find((b) => b.id === this.driverId);
      if (driver) {
        driver.position.x = this.position.x;
        driver.position.y = this.position.y;
        driver.position.z = this.position.z;
        driver.velocity.x = this.velocity.x;
        driver.velocity.z = this.velocity.z;
      }
    }
  }

  public canFire(): boolean {
    return !this.isDestroyed && this.fireCooldown <= 0;
  }

  public fireCannon(driverMultiplier: number = 1.0): TankShellProjectile | null {
    if (!this.canFire()) return null;

    this.fireCooldown = this.cannonCooldownTime;
    this.recoilOffset = -0.35;

    const dirX = Math.sin(this.turretAngle);
    const dirZ = Math.cos(this.turretAngle);

    const muzzleDist = 3.8;
    const muzzlePos: Vector3D = {
      x: this.position.x + dirX * muzzleDist,
      y: 1.45,
      z: this.position.z + dirZ * muzzleDist
    };

    const shellSpeed = 26.0;
    const shell: TankShellProjectile = {
      id: `shell_${this.id}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      team: this.team,
      ownerId: this.driverId || this.id,
      position: muzzlePos,
      velocity: {
        x: dirX * shellSpeed,
        y: 0.4,
        z: dirZ * shellSpeed
      },
      directDamage: Math.round(this.cannonDirectDamage * driverMultiplier),
      blastRadius: this.cannonBlastRadius,
      blastDamage: Math.round(this.cannonBlastDamage * driverMultiplier),
      lifeTime: 2.2,
      detonated: false
    };

    return shell;
  }
}

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { HeavyBattleTank, createTankMesh, TANK_TEAM_COLORS, TANK_CHASSIS_COLORS } from '../src/entities/tank';
import { BuddyEntity } from '../src/entities/buddy';
import { StackingPad } from '../src/entities/basePad';
import { PhysicsEngine } from '../src/engine/physics';
import { CLASS_PROPERTIES, TeamId } from '../src/types';

describe('Milestone 3 Empirical Stress Test: HeavyBattleTank System', () => {
  let redTank: HeavyBattleTank;
  let blueTank: HeavyBattleTank;
  let fighterBuddy: BuddyEntity;
  let healerBuddy: BuddyEntity;
  let constructorBuddy: BuddyEntity;

  beforeEach(() => {
    redTank = new HeavyBattleTank('tank_red_stress', 'red', { x: 0, y: 0, z: 0 }, 0);
    blueTank = new HeavyBattleTank('tank_blue_stress', 'blue', { x: 10, y: 0, z: 10 }, Math.PI / 4);
    fighterBuddy = new BuddyEntity('buddy_fighter', 'red', 'fighter', { x: 0, y: 0.7, z: 0 });
    healerBuddy = new BuddyEntity('buddy_healer', 'red', 'healer', { x: 2, y: 0.7, z: 0 });
    constructorBuddy = new BuddyEntity('buddy_constructor', 'red', 'constructor', { x: -2, y: 0.7, z: 0 });
  });

  /* =========================================================================
     1. Procedural 3D Model Hierarchy & Materials Stress Test
     ========================================================================= */
  describe('1. Procedural 3D Model Hierarchy & Scene Graph', () => {
    it('constructs complete physical scene graph hierarchy with all required components', () => {
      const rig = createTankMesh(redTank);

      // Verify root group
      expect(rig.root).toBeInstanceOf(THREE.Group);
      expect(rig.root.name).toBe(`tank_root_${redTank.id}`);

      // Verify hull group and sub-assemblies
      expect(rig.hullGroup).toBeInstanceOf(THREE.Group);
      expect(rig.hullGroup.name).toBe('tank_hull_group');

      // Check chassis box geometry dimensions (2.4 x 0.9 x 3.2)
      const chassisMesh = rig.hullGroup.children.find(
        (c) => c instanceof THREE.Mesh && c.geometry instanceof THREE.BoxGeometry
      ) as THREE.Mesh;
      expect(chassisMesh).toBeDefined();
      const chassisGeo = chassisMesh.geometry as THREE.BoxGeometry;
      expect(chassisGeo.parameters.width).toBeCloseTo(2.4, 1);
      expect(chassisGeo.parameters.height).toBeCloseTo(0.9, 1);
      expect(chassisGeo.parameters.depth).toBeCloseTo(3.2, 1);

      // Check sloped front glacis plate
      const glacisMesh = rig.hullGroup.children.find(
        (c) => c instanceof THREE.Mesh && Math.abs(c.rotation.x - (-0.42)) < 0.01
      ) as THREE.Mesh;
      expect(glacisMesh).toBeDefined();

      // Check tracks group and road wheels (minimum 4 road wheels + 2 sprockets per side = 6 wheels per side)
      expect(rig.leftWheels.length).toBeGreaterThanOrEqual(6);
      expect(rig.rightWheels.length).toBeGreaterThanOrEqual(6);

      for (const wheel of [...rig.leftWheels, ...rig.rightWheels]) {
        expect(wheel).toBeInstanceOf(THREE.Mesh);
        expect(wheel.geometry).toBeInstanceOf(THREE.CylinderGeometry);
      }

      // Check rotating turret dome assembly
      expect(rig.turretPivot).toBeInstanceOf(THREE.Group);
      expect(rig.turretPivot.name).toBe('tank_turret_pivot');
      expect(rig.driverSeatSocket).toBeInstanceOf(THREE.Group);
      expect(rig.driverSeatSocket.name).toBe('tank_driver_seat_socket');

      // Check recoil cannon assembly
      expect(rig.recoilGroup).toBeInstanceOf(THREE.Group);
      expect(rig.recoilGroup.name).toBe('tank_recoil_group');
      expect(rig.cannonMesh).toBeInstanceOf(THREE.Mesh);
      expect(rig.muzzleSocket).toBeInstanceOf(THREE.Group);
      expect(rig.muzzleSocket.name).toBe('tank_muzzle_socket');

      // Check shadow mesh plane
      expect(rig.shadowMesh).toBeInstanceOf(THREE.Mesh);
      expect(rig.shadowMesh.geometry).toBeInstanceOf(THREE.PlaneGeometry);

      // Verify proper cleanup
      expect(() => rig.dispose()).not.toThrow();
    });

    it('renders distinct team colors across all four team palettes and fallback', () => {
      const teams: TeamId[] = ['red', 'blue', 'yellow', 'cyan'];
      for (const team of teams) {
        const tank = new HeavyBattleTank(`tank_${team}`, team);
        const rig = createTankMesh(tank);
        expect(rig.root).toBeDefined();
        rig.dispose();
      }

      // Fallback team
      const fallbackTank = new HeavyBattleTank('tank_fallback', 'invalid' as TeamId);
      const fallbackRig = createTankMesh(fallbackTank);
      expect(fallbackRig.root).toBeDefined();
      fallbackRig.dispose();
    });

    it('handles visual feedback functions (flashDamage, playMuzzleFlash, playExplosionBurst) safely', () => {
      const rig = createTankMesh(redTank);
      expect(() => rig.flashDamage(50)).not.toThrow();
      expect(() => rig.playMuzzleFlash()).not.toThrow();
      expect(() => rig.playExplosionBurst()).not.toThrow();
      rig.dispose();
    });
  });

  /* =========================================================================
     2. Structural Health, Damage & Repair Stress Testing
     ========================================================================= */
  describe('2. Structural Health & Damage Clamping', () => {
    it('strictly clamps 500 HP max structural health and prevents negative HP', () => {
      expect(redTank.hp).toBe(500);
      expect(redTank.maxHp).toBe(500);

      // Normal damage
      const dmg1 = redTank.takeDamage(120);
      expect(dmg1).toBe(120);
      expect(redTank.hp).toBe(380);
      expect(redTank.isDestroyed).toBe(false);

      // Extreme overkill damage: 1,000,000 HP
      const dmgOverkill = redTank.takeDamage(1_000_000);
      expect(dmgOverkill).toBe(380); // Can only take what is left
      expect(redTank.hp).toBe(0);   // Strictly clamped to 0, NEVER negative
      expect(redTank.isDestroyed).toBe(true);

      // Subsequent damage to destroyed tank must return 0
      const dmgPost = redTank.takeDamage(100);
      expect(dmgPost).toBe(0);
      expect(redTank.hp).toBe(0);
    });

    it('safely handles zero and negative damage inputs without state corruption', () => {
      expect(redTank.takeDamage(0)).toBe(0);
      expect(redTank.hp).toBe(500);

      expect(redTank.takeDamage(-50)).toBe(0);
      expect(redTank.hp).toBe(500);

      expect(redTank.takeDamage(-Infinity)).toBe(0);
      expect(redTank.hp).toBe(500);
    });

    it('accumulates fractional damage precision over 1,000 iterations without drifting below 0', () => {
      const microDamage = 0.25;
      for (let i = 0; i < 1000; i++) {
        redTank.takeDamage(microDamage);
      }
      expect(redTank.hp).toBeCloseTo(250, 1);
      expect(redTank.isDestroyed).toBe(false);

      // Finish off with remaining damage
      redTank.takeDamage(300);
      expect(redTank.hp).toBe(0);
      expect(redTank.isDestroyed).toBe(true);
    });

    it('repairs structural HP up to max 500, but rejects repairs on destroyed tanks', () => {
      redTank.takeDamage(300);
      expect(redTank.hp).toBe(200);

      // Partial repair
      const rep1 = redTank.repair(150);
      expect(rep1).toBe(150);
      expect(redTank.hp).toBe(350);

      // Over-repair clamping to maxHp
      const rep2 = redTank.repair(500);
      expect(rep2).toBe(150); // Only healed up to 500
      expect(redTank.hp).toBe(500);

      // Repair when full returns 0
      expect(redTank.repair(100)).toBe(0);
      expect(redTank.hp).toBe(500);

      // Negative or zero repair returns 0
      expect(redTank.repair(0)).toBe(0);
      expect(redTank.repair(-100)).toBe(0);

      // Destroy tank then attempt repair
      redTank.takeDamage(500);
      expect(redTank.isDestroyed).toBe(true);
      expect(redTank.repair(200)).toBe(0);
      expect(redTank.hp).toBe(0);
      expect(redTank.isDestroyed).toBe(true); // Cannot resurrect destroyed tank via repair
    });
  });

  /* =========================================================================
     3. Rapid Mounting, Dismounting & Kinematics Under Extreme Conditions
     ========================================================================= */
  describe('3. Mounting, Dismounting & Kinematics Stress', () => {
    it('survives 1,000 rapid mount and voluntary dismount cycles without state corruption', () => {
      const allBuddies = [fighterBuddy];
      const initialHp = fighterBuddy.hp;

      for (let i = 0; i < 1000; i++) {
        const mounted = redTank.mount(fighterBuddy);
        expect(mounted).toBe(true);
        expect(redTank.isOccupied).toBe(true);
        expect(redTank.driverId).toBe(fighterBuddy.id);
        expect(fighterBuddy.isInTank).toBe(true);
        expect(fighterBuddy.mountedTankId).toBe(redTank.id);

        const dismounted = redTank.dismount(false, allBuddies);
        expect(dismounted).toBe(fighterBuddy);
        expect(redTank.isOccupied).toBe(false);
        expect(redTank.driverId).toBeNull();
        expect(fighterBuddy.isInTank).toBe(false);
        expect(fighterBuddy.mountedTankId).toBeNull();
        expect(fighterBuddy.hp).toBe(initialHp);
      }
    });

    it('handles multiple buddies attempting to mount the same tank concurrently', () => {
      expect(redTank.mount(fighterBuddy)).toBe(true);
      expect(redTank.mount(healerBuddy)).toBe(false);
      expect(redTank.mount(constructorBuddy)).toBe(false);
      expect(redTank.driverId).toBe(fighterBuddy.id);
    });

    it('rejects mounting under invalid buddy or tank states (knocked, carrying crate, destroyed)', () => {
      // 1. Knocked buddy
      fighterBuddy.takeDamage(fighterBuddy.maxHp);
      expect(fighterBuddy.isKnocked).toBe(true);
      expect(redTank.mount(fighterBuddy)).toBe(false);

      // 2. Carrying crate
      healerBuddy.isCarryingCrate = true;
      expect(redTank.mount(healerBuddy)).toBe(false);

      // 3. Destroyed tank
      redTank.takeDamage(500);
      expect(redTank.mount(constructorBuddy)).toBe(false);
    });

    it('driving kinematics with safeDt clamping handles zero, negative, and tab-freeze timeout dt', () => {
      redTank.mount(fighterBuddy);
      const allBuddies = [fighterBuddy];

      // dt = 0: no movement, no NaN
      redTank.update(0, { throttle: 1.0, steer: 0 }, allBuddies);
      expect(redTank.position.z).toBe(0);
      expect(redTank.trackDistance).toBe(0);
      expect(Number.isNaN(redTank.position.z)).toBe(false);

      // negative dt: safeDt = Math.max(0, dt) prevents reverse movement
      redTank.update(-1.0, { throttle: 1.0, steer: 0 }, allBuddies);
      expect(redTank.position.z).toBe(0);
      expect(redTank.trackDistance).toBe(0);

      // Tab freeze timeout: huge dt = 60.0s (e.g. background tab)
      // Max forward speed 6.0 m/s * 60s would be 360m, but arena clamps strictly to [-30, +30]
      redTank.update(60.0, { throttle: 1.0, steer: 0 }, allBuddies);
      expect(redTank.position.z).toBe(30.0);
      expect(fighterBuddy.position.z).toBe(30.0);
      expect(redTank.position.x).toBe(0);
    });

    it('strictly clamps tank to arena boundary [-30, +30] across all 4 corner collisions', () => {
      // Drive toward Northeast (+X, +Z)
      redTank.position = { x: 28, y: 0, z: 28 };
      redTank.heading = Math.PI / 4; // 45 degrees
      redTank.update(2.0, { throttle: 1.0, steer: 0 });
      expect(redTank.position.x).toBe(30.0);
      expect(redTank.position.z).toBe(30.0);

      // Drive toward Northwest (-X, +Z)
      redTank.position = { x: -28, y: 0, z: 28 };
      redTank.heading = -Math.PI / 4;
      redTank.update(2.0, { throttle: 1.0, steer: 0 });
      expect(redTank.position.x).toBe(-30.0);
      expect(redTank.position.z).toBe(30.0);

      // Drive toward Southwest (-X, -Z)
      redTank.position = { x: -28, y: 0, z: -28 };
      redTank.heading = -3 * Math.PI / 4;
      redTank.update(2.0, { throttle: 1.0, steer: 0 });
      expect(redTank.position.x).toBe(-30.0);
      expect(redTank.position.z).toBe(-30.0);

      // Drive toward Southeast (+X, -Z)
      redTank.position = { x: 28, y: 0, z: -28 };
      redTank.heading = 3 * Math.PI / 4;
      redTank.update(2.0, { throttle: 1.0, steer: 0 });
      expect(redTank.position.x).toBe(30.0);
      expect(redTank.position.z).toBe(-30.0);
    });

    it('continuously normalizes heading within [-PI, PI] over 1,000 steering updates', () => {
      for (let i = 0; i < 1000; i++) {
        redTank.update(0.05, { throttle: 0, steer: 1.0 });
        expect(redTank.heading).toBeGreaterThanOrEqual(-Math.PI);
        expect(redTank.heading).toBeLessThanOrEqual(Math.PI);
        expect(Number.isNaN(redTank.heading)).toBe(false);
      }
    });

    it('enforces forward (6.0 m/s), reverse (-3.5 m/s), and throttle deadband (±0.05)', () => {
      // Forward
      redTank.heading = 0; // Pointing +Z
      redTank.update(1.0, { throttle: 1.0, steer: 0 });
      expect(redTank.velocity.z).toBeCloseTo(6.0, 1);

      // Reverse
      redTank.position = { x: 0, y: 0, z: 0 };
      redTank.update(1.0, { throttle: -1.0, steer: 0 });
      expect(redTank.velocity.z).toBeCloseTo(-3.5, 1);

      // Deadband: throttle = 0.04 (within ±0.05)
      redTank.position = { x: 0, y: 0, z: 0 };
      redTank.update(1.0, { throttle: 0.04, steer: 0 });
      expect(redTank.velocity.z).toBe(0);

      // Deadband: throttle = -0.04
      redTank.update(1.0, { throttle: -0.04, steer: 0 });
      expect(redTank.velocity.z).toBe(0);
    });
  });

  /* =========================================================================
     4. Cannon Combat, Shell Ballistics, Cooldown & Recoil Decay
     ========================================================================= */
  describe('4. Cannon Ballistics, Cooldown & Recoil Dynamics', () => {
    it('fires shell with 80 base direct damage and applies Fighter 1.25x boost to 100 damage', () => {
      // Base / Healer / Constructor multiplier (1.0x)
      const baseShell = redTank.fireCannon(1.0);
      expect(baseShell).not.toBeNull();
      expect(baseShell!.directDamage).toBe(80);
      expect(baseShell!.blastDamage).toBe(60);
      expect(baseShell!.blastRadius).toBe(3.5);
      expect(baseShell!.velocity.y).toBe(0.4);
      expect(Math.hypot(baseShell!.velocity.x, baseShell!.velocity.z)).toBeCloseTo(26.0, 1);

      // Reset cooldown
      redTank.fireCooldown = 0;

      // Fighter multiplier (1.25x)
      const fighterMult = CLASS_PROPERTIES.fighter.damageMultiplier;
      const fighterShell = redTank.fireCannon(fighterMult);
      expect(fighterShell).not.toBeNull();
      expect(fighterShell!.directDamage).toBe(100);
      expect(fighterShell!.blastDamage).toBe(75);
    });

    it('strictly enforces 1.2s rate-of-fire cooldown', () => {
      const shell1 = redTank.fireCannon();
      expect(shell1).not.toBeNull();
      expect(redTank.fireCooldown).toBe(1.2);
      expect(redTank.canFire()).toBe(false);

      // Immediate re-fire rejected
      expect(redTank.fireCannon()).toBeNull();

      // At 0.6s rejected
      redTank.update(0.6, { throttle: 0, steer: 0 });
      expect(redTank.fireCooldown).toBeCloseTo(0.6, 2);
      expect(redTank.canFire()).toBe(false);
      expect(redTank.fireCannon()).toBeNull();

      // At 1.19s rejected
      redTank.update(0.59, { throttle: 0, steer: 0 });
      expect(redTank.fireCooldown).toBeCloseTo(0.01, 2);
      expect(redTank.canFire()).toBe(false);
      expect(redTank.fireCannon()).toBeNull();

      // At 1.20s allowed
      redTank.update(0.02, { throttle: 0, steer: 0 });
      expect(redTank.fireCooldown).toBe(0);
      expect(redTank.canFire()).toBe(true);

      const shell2 = redTank.fireCannon();
      expect(shell2).not.toBeNull();
    });

    it('exponential recoil decay settles to 0 monotonically without positive overshoot', () => {
      redTank.fireCannon();
      expect(redTank.recoilOffset).toBe(-0.35);

      let prevRecoil = redTank.recoilOffset;
      const dt = 0.016; // 60 FPS frame

      for (let i = 0; i < 60; i++) {
        redTank.update(dt, { throttle: 0, steer: 0 });
        // Recoil should decay toward 0 (increasing from -0.35 toward 0)
        expect(redTank.recoilOffset).toBeGreaterThanOrEqual(prevRecoil);
        // Recoil should NEVER overshoot 0 into positive values
        expect(redTank.recoilOffset).toBeLessThanOrEqual(0);
        prevRecoil = redTank.recoilOffset;
      }

      // After 1 full second, recoil must settle squarely to 0
      redTank.update(1.0, { throttle: 0, steer: 0 });
      expect(redTank.recoilOffset).toBe(0);
    });

    it('evaluates AoE blast damage falloff across 100 radial steps up to 3.5m', () => {
      const center = { x: 0, y: 0, z: 0 };
      const blastRadius = 3.5;
      const maxBlastDamage = 60;

      let prevDamage = maxBlastDamage;

      for (let i = 0; i <= 100; i++) {
        const dist = (i / 100) * 5.0; // 0m to 5.0m
        const targetPos = { x: dist, y: 0, z: 0 };
        const dmg = PhysicsEngine.calculateAreaDamage(center, targetPos, maxBlastDamage, blastRadius);

        if (dist >= blastRadius) {
          expect(dmg).toBe(0);
        } else {
          const expected = Math.round(maxBlastDamage * (1 - dist / blastRadius));
          expect(dmg).toBe(expected);
          expect(dmg).toBeLessThanOrEqual(prevDamage);
          prevDamage = dmg;
        }
      }
    });
  });

  /* =========================================================================
     5. Tank Destruction, Fatal Damage Ejection & Knockback
     ========================================================================= */
  describe('5. Destruction & Driver Ejection Mechanics', () => {
    it('destroys tank on fatal damage, clamps HP to 0, and ejects driver with 30 HP damage & vertical knockback', () => {
      redTank.mount(fighterBuddy);
      const allBuddies = [fighterBuddy, healerBuddy];
      const initialBuddyHp = fighterBuddy.hp;

      // Tank takes fatal damage (500 HP)
      const dmg = redTank.takeDamage(500, allBuddies);
      expect(dmg).toBe(500);
      expect(redTank.hp).toBe(0);
      expect(redTank.isDestroyed).toBe(true);
      expect(redTank.isOccupied).toBe(false);
      expect(redTank.driverId).toBeNull();

      // Driver verification
      expect(fighterBuddy.isInTank).toBe(false);
      expect(fighterBuddy.mountedTankId).toBeNull();
      expect(fighterBuddy.drivingVehicleId).toBeNull();
      expect(fighterBuddy.hp).toBe(initialBuddyHp - 30); // Suffers 30 HP ejection damage
      expect(fighterBuddy.velocity.y).toBe(6.0);         // +6.0 m/s vertical impulse
      expect(Math.hypot(fighterBuddy.velocity.x, fighterBuddy.velocity.z)).toBeCloseTo(5.0, 1); // 5.0 m/s radial
      expect(fighterBuddy.position.y).toBe(1.2);
    });

    it('knocks down driver if buddy health was <= 30 upon tank destruction', () => {
      fighterBuddy.hp = 25; // Less than 30 HP
      redTank.mount(fighterBuddy);
      const allBuddies = [fighterBuddy];

      redTank.takeDamage(500, allBuddies);
      expect(redTank.isDestroyed).toBe(true);
      expect(fighterBuddy.hp).toBe(0);
      expect(fighterBuddy.isKnocked).toBe(true);
    });

    it('safely destroys an unoccupied tank without error', () => {
      expect(() => redTank.takeDamage(500)).not.toThrow();
      expect(redTank.isDestroyed).toBe(true);
      expect(redTank.hp).toBe(0);
      expect(redTank.driverId).toBeNull();
    });

    it('strictly freezes kinematics and firing on destroyed tanks', () => {
      redTank.takeDamage(500);
      redTank.update(1.0, { throttle: 1.0, steer: 1.0 });

      expect(redTank.velocity.x).toBe(0);
      expect(redTank.velocity.z).toBe(0);
      expect(redTank.canFire()).toBe(false);
      expect(redTank.fireCannon()).toBeNull();
      expect(redTank.mount(fighterBuddy)).toBe(false);
    });
  });

  /* =========================================================================
     6. StackingPad 8-Crate Cube Recipe & Vehicle Category
     ========================================================================= */
  describe('6. StackingPad 8-Crate Recipe & Vehicle Category', () => {
    it('evaluates full 2x2x2 cube (8 crates) to Heavy Battle Tank with vehicle category and 980 DPS', () => {
      const pad = new StackingPad('cyan', 18, 18);
      for (let i = 0; i < 8; i++) {
        pad.setSlot(i, true);
      }

      const recipe = pad.evaluateRecipe();
      expect(recipe.itemType).toBe('tank');
      expect(recipe.category).toBe('vehicle');
      expect(recipe.title).toBe('Heavy Battle Tank');
      expect(recipe.dps).toBe(980);
      expect(pad.totalCrates).toBe(8);
    });
  });
});

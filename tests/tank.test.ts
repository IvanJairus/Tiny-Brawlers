import { describe, it, expect, beforeEach } from 'vitest';
import { HeavyBattleTank, createTankMesh } from '../src/entities/tank';
import { BuddyEntity } from '../src/entities/buddy';
import { StackingPad } from '../src/entities/basePad';
import { PhysicsEngine } from '../src/engine/physics';
import { CLASS_PROPERTIES } from '../src/types';

describe('HeavyBattleTank Entity & Vehicle Mechanics', () => {
  let redTank: HeavyBattleTank;
  let fighterBuddy: BuddyEntity;
  let healerBuddy: BuddyEntity;

  beforeEach(() => {
    redTank = new HeavyBattleTank('tank_red_1', 'red', { x: 0, y: 0, z: 0 }, 0);
    fighterBuddy = new BuddyEntity('buddy_f', 'red', 'fighter', { x: 0, y: 0.7, z: 0 });
    healerBuddy = new BuddyEntity('buddy_h', 'red', 'healer', { x: 2, y: 0.7, z: 0 });
  });

  describe('1. Instantiation & Initial State', () => {
    it('initializes with 500 HP, maxHp 500, unmounted state, and correct team', () => {
      expect(redTank.id).toBe('tank_red_1');
      expect(redTank.team).toBe('red');
      expect(redTank.hp).toBe(500);
      expect(redTank.maxHp).toBe(500);
      expect(redTank.isOccupied).toBe(false);
      expect(redTank.driverId).toBeNull();
      expect(redTank.isDestroyed).toBe(false);
      expect(redTank.heading).toBe(0);
      expect(redTank.turretAngle).toBe(0);
    });

    it('generates 3D procedural mesh hierarchy with hull, tracks, turret, and cannon', () => {
      const rig = createTankMesh(redTank);
      expect(rig.root).toBeDefined();
      expect(rig.hullGroup).toBeDefined();
      expect(rig.turretPivot).toBeDefined();
      expect(rig.recoilGroup).toBeDefined();
      expect(rig.cannonMesh).toBeDefined();
      expect(rig.muzzleSocket).toBeDefined();
      expect(rig.driverSeatSocket).toBeDefined();
      expect(rig.leftWheels.length).toBeGreaterThanOrEqual(4);
      expect(rig.rightWheels.length).toBeGreaterThanOrEqual(4);
      expect(rig.shadowMesh).toBeDefined();
      expect(() => rig.dispose()).not.toThrow();
    });
  });

  describe('2. Mounting and Dismounting Mechanics', () => {
    it('allows a healthy buddy to mount an unoccupied tank', () => {
      const mounted = redTank.mount(fighterBuddy);
      expect(mounted).toBe(true);
      expect(redTank.isOccupied).toBe(true);
      expect(redTank.driverId).toBe(fighterBuddy.id);
      expect(fighterBuddy.isInTank).toBe(true);
      expect(fighterBuddy.mountedTankId).toBe(redTank.id);
      expect(fighterBuddy.drivingVehicleId).toBe(redTank.id);
    });

    it('rejects mounting if tank is already occupied', () => {
      redTank.mount(fighterBuddy);
      const secondMount = redTank.mount(healerBuddy);
      expect(secondMount).toBe(false);
      expect(redTank.driverId).toBe(fighterBuddy.id);
    });

    it('rejects mounting if buddy is knocked down', () => {
      fighterBuddy.takeDamage(fighterBuddy.maxHp);
      expect(fighterBuddy.isKnocked).toBe(true);
      const mounted = redTank.mount(fighterBuddy);
      expect(mounted).toBe(false);
      expect(redTank.isOccupied).toBe(false);
    });

    it('rejects mounting if buddy is currently carrying a crate', () => {
      fighterBuddy.isCarryingCrate = true;
      const mounted = redTank.mount(fighterBuddy);
      expect(mounted).toBe(false);
      expect(redTank.isOccupied).toBe(false);
    });

    it('rejects mounting if tank is destroyed', () => {
      redTank.takeDamage(500);
      expect(redTank.isDestroyed).toBe(true);
      const mounted = redTank.mount(fighterBuddy);
      expect(mounted).toBe(false);
    });

    it('performs voluntary safe dismount without damage', () => {
      redTank.mount(fighterBuddy);
      const allBuddies = [fighterBuddy, healerBuddy];
      const initialHp = fighterBuddy.hp;
      const dismounted = redTank.dismount(false, allBuddies);

      expect(dismounted).toBe(fighterBuddy);
      expect(redTank.isOccupied).toBe(false);
      expect(redTank.driverId).toBeNull();
      expect(fighterBuddy.isInTank).toBe(false);
      expect(fighterBuddy.mountedTankId).toBeNull();
      expect(fighterBuddy.drivingVehicleId).toBeNull();
      expect(fighterBuddy.hp).toBe(initialHp);
    });
  });

  describe('3. Movement & Steering Dynamics', () => {
    it('drives forward at maxSpeed (6.0 m/s) when throttle is 1.0', () => {
      redTank.mount(fighterBuddy);
      const allBuddies = [fighterBuddy];
      redTank.update(0.5, { throttle: 1.0, steer: 0 }, allBuddies);

      expect(redTank.velocity.z).toBeCloseTo(6.0, 1);
      expect(redTank.position.z).toBeCloseTo(3.0, 1);
      expect(fighterBuddy.position.z).toBeCloseTo(3.0, 1);
      expect(redTank.trackDistance).toBeCloseTo(3.0, 1);
    });

    it('drives backward at reverseSpeed (3.5 m/s) when throttle is -1.0', () => {
      redTank.update(1.0, { throttle: -1.0, steer: 0 });
      expect(redTank.velocity.z).toBeCloseTo(-3.5, 1);
      expect(redTank.position.z).toBeCloseTo(-3.5, 1);
    });

    it('rotates heading at turnRate (2.0 rad/s) when steering', () => {
      redTank.update(0.5, { throttle: 0, steer: 1.0 });
      expect(redTank.heading).toBeCloseTo(-1.0, 2);

      redTank.update(0.5, { throttle: 0, steer: -1.0 });
      expect(redTank.heading).toBeCloseTo(0.0, 2);
    });

    it('clamps tank within arena bounds (-30 to +30)', () => {
      redTank.position.x = 29.5;
      redTank.heading = Math.PI / 2;
      redTank.update(1.0, { throttle: 1.0, steer: 0 });
      expect(redTank.position.x).toBe(30.0);
    });
  });

  describe('4. Heavy Cannon Firing & Shell Ballistics', () => {
    it('fires heavy explosive shell with 80 direct damage and 3.5m blast radius', () => {
      const shell = redTank.fireCannon(1.0);
      expect(shell).not.toBeNull();
      expect(shell!.directDamage).toBe(80);
      expect(shell!.blastRadius).toBe(3.5);
      expect(shell!.blastDamage).toBe(60);
      expect(shell!.team).toBe('red');
      expect(redTank.recoilOffset).toBe(-0.35);
      expect(redTank.fireCooldown).toBe(1.2);
    });

    it('applies Fighter class 1.25x damage multiplier to cannon shell (100 direct dmg)', () => {
      const shell = redTank.fireCannon(CLASS_PROPERTIES.fighter.damageMultiplier);
      expect(shell).not.toBeNull();
      expect(shell!.directDamage).toBe(100);
      expect(shell!.blastDamage).toBe(75);
    });

    it('enforces firing rate cooldown preventing immediate re-fire', () => {
      const shell1 = redTank.fireCannon();
      expect(shell1).not.toBeNull();

      const shell2 = redTank.fireCannon();
      expect(shell2).toBeNull();

      redTank.update(1.25, { throttle: 0, steer: 0 });
      expect(redTank.canFire()).toBe(true);

      const shell3 = redTank.fireCannon();
      expect(shell3).not.toBeNull();
    });

    it('recovers cannon recoil offset smoothly over time', () => {
      redTank.fireCannon();
      expect(redTank.recoilOffset).toBe(-0.35);

      redTank.update(0.2, { throttle: 0, steer: 0 });
      expect(redTank.recoilOffset).toBeGreaterThan(-0.35);
      expect(redTank.recoilOffset).toBeLessThan(0);

      redTank.update(0.5, { throttle: 0, steer: 0 });
      expect(redTank.recoilOffset).toBeCloseTo(0, 2);
    });

    it('calculates blast area damage with linear falloff up to 3.5m', () => {
      const center = { x: 0, y: 0.2, z: 0 };
      const pointDirect = { x: 0, y: 0.2, z: 0 };
      const pointMid = { x: 1.75, y: 0.2, z: 0 };
      const pointEdge = { x: 3.5, y: 0.2, z: 0 };

      const dmgDirect = PhysicsEngine.calculateAreaDamage(center, pointDirect, 80, 3.5);
      const dmgMid = PhysicsEngine.calculateAreaDamage(center, pointMid, 80, 3.5);
      const dmgEdge = PhysicsEngine.calculateAreaDamage(center, pointEdge, 80, 3.5);

      expect(dmgDirect).toBe(80);
      expect(dmgMid).toBe(40);
      expect(dmgEdge).toBe(0);
    });
  });

  describe('5. Damage, Destruction & Driver Ejection', () => {
    it('tracks damage and reduces structural HP', () => {
      const taken = redTank.takeDamage(150);
      expect(taken).toBe(150);
      expect(redTank.hp).toBe(350);
      expect(redTank.isDestroyed).toBe(false);
    });

    it('allows repairs up to maximum structural HP (500)', () => {
      redTank.takeDamage(200);
      expect(redTank.hp).toBe(300);

      const healed = redTank.repair(150);
      expect(healed).toBe(150);
      expect(redTank.hp).toBe(450);

      const overHealed = redTank.repair(100);
      expect(overHealed).toBe(50);
      expect(redTank.hp).toBe(500);
    });

    it('destroys tank when HP reaches 0 and ejects driver with 30 HP damage & knockback', () => {
      redTank.mount(fighterBuddy);
      const allBuddies = [fighterBuddy];

      const initialBuddyHp = fighterBuddy.hp;
      redTank.takeDamage(500, allBuddies);

      expect(redTank.hp).toBe(0);
      expect(redTank.isDestroyed).toBe(true);
      expect(redTank.isOccupied).toBe(false);
      expect(redTank.driverId).toBeNull();
      expect(fighterBuddy.hp).toBe(initialBuddyHp - 30);
      expect(fighterBuddy.velocity.y).toBe(6.0);
      expect(Math.hypot(fighterBuddy.velocity.x, fighterBuddy.velocity.z)).toBeGreaterThan(0);
    });

    it('prevents destroyed tank from driving or firing cannon', () => {
      redTank.takeDamage(500);
      redTank.update(1.0, { throttle: 1.0, steer: 1.0 });

      expect(redTank.velocity.x).toBe(0);
      expect(redTank.velocity.z).toBe(0);
      expect(redTank.canFire()).toBe(false);
      expect(redTank.fireCannon()).toBeNull();
    });
  });

  describe('6. StackingPad 8-Crate Recipe Evaluation & Build Integration', () => {
    it('evaluates 8 crates as Heavy Battle Tank with 980 DPS vehicle category', () => {
      const pad = new StackingPad('red', -18, -18);
      for (let i = 0; i < 8; i++) {
        pad.setSlot(i, true);
      }
      const res = pad.evaluate();

      expect(res.itemType).toBe('tank');
      expect(res.category).toBe('vehicle');
      expect(res.dps).toBe(980);
      expect(res.title).toBe('Heavy Battle Tank');
    });
  });
});

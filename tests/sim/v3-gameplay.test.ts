import { describe, expect, it } from 'vitest';
import { createWorld, setInput } from '../../src/sim/core/world';
import { stepWorld } from '../../src/sim/core/step';
import { createSoloSession } from '../../src/sim/net/session';
import { makeBuddy, speedOf } from '../../src/sim/domain/buddy';
import { attachCrateToBuddy, makeCrate, placeCrateOnPad } from '../../src/sim/domain/crate';
import { padOrigin } from '../../src/sim/domain/pad';
import { makeProjectile, type ProjectileRec } from '../../src/sim/domain/projectile';
import { tickRespawns } from '../../src/sim/domain/match';
import { brickStageOf, damageObstacle } from '../../src/sim/domain/obstacles';
import { encodeInput } from '../../src/sim/input/actions';
import { NO_ENTITY, type EntityId } from '../../src/sim/core/ids';
import type { TeamId } from '../../src/sim/domain/teams';

function createBullet(
  id: number,
  team: TeamId,
  x: number,
  z: number,
  vx: number,
  vz: number,
  fuse = 1.0,
  damage = 15
): ProjectileRec {
  return makeProjectile(
    {
      kind: 'bullet',
      team,
      owner: 1 as EntityId,
      x,
      y: 0.5,
      z,
      vx,
      vy: 0,
      vz,
      fuse,
      damage,
      radius: 0
    },
    id as EntityId
  );
}

describe('v3.0 gameplay features', () => {
  describe('1. Initial Crate Seeding & Multi-Crate Wave Drops', () => {
    it('starts with at least 14 crates on the field immediately', () => {
      const session = createSoloSession(42, 'fighter');
      expect(session.world.crates.length).toBeGreaterThanOrEqual(14);
    });

    it('drops a wave of 3 to 5 crates when crateTimer expires, even when crates are on pad', () => {
      const w = createWorld({ seed: 42 });

      // Support 2-argument int(min, max) if rng only supports bound
      const origInt = w.rngWorld.int.bind(w.rngWorld);
      w.rngWorld.int = (minOrBound: number, max?: number) => {
        if (max === undefined) return origInt(minOrBound);
        return minOrBound + Math.floor(w.rngWorld.next() * (max - minOrBound + 1));
      };

      w.pads.red = 0xff; // 8 crates on red pad
      const origin = padOrigin('red');
      for (let i = 0; i < 8; i++) {
        const c = makeCrate(w.ids.alloc(), origin.x, 0.5, origin.z);
        placeCrateOnPad(c, 'red', i, origin.x, 0.5, origin.z);
        w.crates.push(c);
      }

      w.crateTimer = 0.01;
      const initialCount = w.crates.length;
      stepWorld(w, 0.05);

      const newDrops = w.crates.length - initialCount;
      expect(newDrops).toBeGreaterThanOrEqual(3);
      expect(newDrops).toBeLessThanOrEqual(5);
    });
  });

  describe('2. Bare-Handed Melee Punch, Disarming Crate Carrier & Pop-the-Pad', () => {
    it('punches adjacent enemy, deals damage, applies knockback, and disarms carried crate', () => {
      const w = createWorld({ seed: 42 });
      const b = makeBuddy(1 as EntityId, 'red', 'fighter', 0, 0, false);
      b.heading = 0; // facing +Z
      b.weapon = 'none';

      const foe = makeBuddy(2 as EntityId, 'blue', 'fighter', 0, 1.2, false);
      foe.hp = 130;
      const carried = makeCrate(3 as EntityId, 0, 1.2, 1.2);
      attachCrateToBuddy(carried, foe.id);
      foe.carryCrate = carried.id;

      w.buddies.push(b, foe);
      w.crates.push(carried);

      setInput(
        w,
        b.id,
        encodeInput(1, {
          moveX: 0,
          moveY: 0,
          aimX: 0,
          aimY: 1,
          attack: true,
          grab: false,
          build: false,
          zoom: 0
        })
      );

      stepWorld(w, 0.033);

      expect(foe.hp).toBeLessThan(130);
      expect(foe.z).toBeGreaterThan(1.2); // knocked back along +Z
      expect(foe.carryCrate).toBe(NO_ENTITY); // carrier disarmed
      expect(carried.heldBy).toBe(NO_ENTITY);

      // Settle crate to loose ground
      for (let i = 0; i < 20 && carried.state !== 'loose'; i++) {
        stepWorld(w, 0.033);
      }
      expect(carried.state).toBe('loose');
    });

    it('pops the pad when punching near own stacked pad and builds the recipe', () => {
      const w = createWorld({ seed: 42 });
      const origin = padOrigin('red');
      const b = makeBuddy(1 as EntityId, 'red', 'fighter', origin.x, origin.z, false);
      b.weapon = 'none';
      w.buddies.push(b);

      // Single crate on pad = pistol recipe
      w.pads.red = 0x01;
      const padCrate = makeCrate(2 as EntityId, origin.x, 0.55, origin.z);
      placeCrateOnPad(padCrate, 'red', 0, origin.x, 0.55, origin.z);
      w.crates.push(padCrate);

      setInput(
        w,
        b.id,
        encodeInput(1, {
          moveX: 0,
          moveY: 0,
          aimX: 0,
          aimY: 1,
          attack: true,
          grab: false,
          build: false,
          zoom: 0
        })
      );

      stepWorld(w, 0.033);

      expect(w.pads.red).toBe(0);
      expect(b.weapon).toBe('pistol');
    });
  });

  describe('3. No Unexplained AoE Explosion on Bullets & 100% Respawn HP', () => {
    it('does not explode AoE or harm nearby foes when a bullet expires in mid-air', () => {
      const w = createWorld({ seed: 42 });
      const foe = makeBuddy(2 as EntityId, 'blue', 'fighter', 5, 5, false);
      foe.hp = 100;
      w.buddies.push(foe);

      // Bullet expiring 1.5m away from foe (outside 0.9m direct hit, inside old 2.2m AoE radius)
      const bullet = createBullet(10, 'red', 5, 3.5, 0, 0, 0.02);
      w.projectiles.push(bullet);

      stepWorld(w, 0.05);

      expect(foe.hp).toBe(100);
      const explosions = w.events.filter((e) => e.kind === 'explosion');
      expect(explosions.length).toBe(0);
    });

    it('respawns knocked-out buddies with 100% maxHp', () => {
      const w = createWorld({ seed: 42 });
      const b = makeBuddy(1 as EntityId, 'red', 'fighter', 0, 0, false);
      b.state = 'ko';
      b.hp = 0;
      b.koTimer = 0;
      w.buddies.push(b);

      tickRespawns(w, 0.05);

      expect(b.state).toBe('idle');
      expect(b.hp).toBe(b.maxHp);
      expect(b.hp).toBe(130);
    });
  });

  describe('4. Multi-Lane Obstacles (tembok_keras & 3-Stage bata_lunak)', () => {
    it('tembok_keras blocks bullets without breaking', () => {
      const w = createWorld({ seed: 42 });
      const hardObs = w.obstacles.find((o) => o.kind === 'hard')!;
      const initialHp = hardObs.hp;

      const bullet = createBullet(10, 'red', hardObs.x - 1, hardObs.z, 20, 0, 1.0);
      w.projectiles.push(bullet);

      stepWorld(w, 0.1);

      expect(bullet.dead).toBe(true);
      expect(hardObs.hp).toBe(initialHp);
      expect(hardObs.dead).toBe(false);
    });

    it('bata_lunak transitions through intact -> cracked -> broken stages and breaks at 0 HP', () => {
      const w = createWorld({ seed: 42 });
      const softObs = w.obstacles.find((o) => o.kind === 'soft')!;

      expect(brickStageOf(softObs.hp, softObs.maxHp)).toBe('intact');

      damageObstacle(softObs, 25);
      expect(brickStageOf(softObs.hp, softObs.maxHp)).toBe('cracked');

      damageObstacle(softObs, 20);
      expect(brickStageOf(softObs.hp, softObs.maxHp)).toBe('broken');

      const broke = damageObstacle(softObs, 20);
      expect(broke).toBe(true);
      expect(softObs.hp).toBe(0);
      expect(softObs.dead).toBe(true);
    });

    it('punching soft brick damages it and emits brickBreak upon destruction', () => {
      const w = createWorld({ seed: 42 });
      const softObs = w.obstacles.find((o) => o.kind === 'soft')!;
      softObs.hp = 15; // 1 punch (30 dmg) will break it

      const b = makeBuddy(1 as EntityId, 'red', 'fighter', softObs.x, softObs.z - 1.2, false);
      b.heading = 0; // facing +Z towards obstacle
      b.weapon = 'none';
      w.buddies.push(b);

      setInput(
        w,
        b.id,
        encodeInput(1, {
          moveX: 0,
          moveY: 0,
          aimX: 0,
          aimY: 1,
          attack: true,
          grab: false,
          build: false,
          zoom: 0
        })
      );

      stepWorld(w, 0.033);

      expect(softObs.dead).toBe(true);
      expect(w.events.some((e) => e.kind === 'brickBreak' && e.entity === softObs.id)).toBe(true);
    });
  });

  describe('5. Power-Up Pickup Buffs', () => {
    it('applies shieldHp = 60 on up_perisai pickup', () => {
      const w = createWorld({ seed: 42 });
      const b = makeBuddy(1 as EntityId, 'red', 'fighter', 0, 0, false);
      w.buddies.push(b);
      w.powerups.push({
        id: 99 as EntityId,
        kind: 'up_perisai',
        x: 0,
        z: 0,
        y: 0.5,
        spin: 0,
        life: 10,
        dead: false
      });

      stepWorld(w, 0.033);

      expect(b.shieldHp).toBe(60);
      expect(b.shieldTimer).toBeGreaterThan(0);
    });

    it('applies fireTimer > 0 on up_api pickup', () => {
      const w = createWorld({ seed: 42 });
      const b = makeBuddy(1 as EntityId, 'red', 'fighter', 0, 0, false);
      w.buddies.push(b);
      w.powerups.push({
        id: 100 as EntityId,
        kind: 'up_api',
        x: 0,
        z: 0,
        y: 0.5,
        spin: 0,
        life: 10,
        dead: false
      });

      stepWorld(w, 0.033);

      expect(b.fireTimer).toBeGreaterThan(0);
    });

    it('boosts speed by 1.3x on up_lari pickup', () => {
      const w = createWorld({ seed: 42 });
      const b = makeBuddy(1 as EntityId, 'red', 'fighter', 0, 0, false);
      const baseSpeed = speedOf(b);
      w.buddies.push(b);
      w.powerups.push({
        id: 101 as EntityId,
        kind: 'up_lari',
        x: 0,
        z: 0,
        y: 0.5,
        spin: 0,
        life: 10,
        dead: false
      });

      stepWorld(w, 0.033);

      expect(b.speedTimer).toBeGreaterThan(0);
      expect(speedOf(b)).toBeCloseTo(baseSpeed * 1.3, 2);
    });

    it('increases grenades on up_bom pickup', () => {
      const w = createWorld({ seed: 42 });
      const b = makeBuddy(1 as EntityId, 'red', 'fighter', 0, 0, false);
      const initialGrenades = b.grenades;
      w.buddies.push(b);
      w.powerups.push({
        id: 102 as EntityId,
        kind: 'up_bom',
        x: 0,
        z: 0,
        y: 0.5,
        spin: 0,
        life: 10,
        dead: false
      });

      stepWorld(w, 0.033);

      expect(b.grenades).toBe(initialGrenades + 3);
      expect(b.weapon).toBe('grenade');
    });

    it('heals hp on up_hati pickup', () => {
      const w = createWorld({ seed: 42 });
      const b = makeBuddy(1 as EntityId, 'red', 'fighter', 0, 0, false);
      b.hp = 50;
      w.buddies.push(b);
      w.powerups.push({
        id: 103 as EntityId,
        kind: 'up_hati',
        x: 0,
        z: 0,
        y: 0.5,
        spin: 0,
        life: 10,
        dead: false
      });

      stepWorld(w, 0.033);

      expect(b.hp).toBe(100);
    });
  });
});

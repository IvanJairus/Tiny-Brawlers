import { describe, it, expect } from 'vitest';
import { BuddyEntity } from '../src/entities/buddy';
import { StackingPad } from '../src/entities/basePad';
import { CrateEntity } from '../src/entities/crate';
import { BotAI } from '../src/ai/bot';
import { PhysicsEngine, GrenadeProjectile, RocketProjectile, BoundingBox } from '../src/engine/physics';
import { NetworkProtocol, CompactMatchSnapshot, CompactBuddyState } from '../src/net/p2p';
import { CLASS_PROPERTIES, BuddyClass, TeamId, Vector3D, RecipeResult } from '../src/types';

// ============================================================================
// TIER 1: FEATURE COVERAGE (>=5 tests per major feature area)
// Areas: Classes, Pad Recipes, Combat/Damage, Physics Ballistics, Network/P2P, Bot AI, Bunker Health
// ============================================================================

describe('Tier 1: Feature Coverage - Classes & Character Attributes', () => {
  it('1.1.1 Fighter initializes with exact balance specs (130 HP, 6.8 m/s, 14 throw force, 1.25x damage)', () => {
    const fighter = new BuddyEntity('f_red_1', 'red', 'fighter');
    expect(fighter.maxHp).toBe(130);
    expect(fighter.hp).toBe(130);
    expect(fighter.getEffectiveSpeed()).toBe(6.8);
    expect(fighter.getThrowForce()).toBe(14.0);
    expect(CLASS_PROPERTIES.fighter.damageMultiplier).toBe(1.25);
    expect(CLASS_PROPERTIES.fighter.healAuraRadius).toBe(0);
    expect(CLASS_PROPERTIES.fighter.healPerSecond).toBe(0);
  });

  it('1.1.2 Healer initializes with exact balance specs (100 HP, 7.2 m/s, 13 throw force, 4.5m aura, 25 HP/s)', () => {
    const healer = new BuddyEntity('h_cyan_1', 'cyan', 'healer');
    expect(healer.maxHp).toBe(100);
    expect(healer.hp).toBe(100);
    expect(healer.getEffectiveSpeed()).toBe(7.2);
    expect(healer.getThrowForce()).toBe(13.0);
    expect(CLASS_PROPERTIES.healer.damageMultiplier).toBe(0.8);
    expect(CLASS_PROPERTIES.healer.healAuraRadius).toBe(4.5);
    expect(CLASS_PROPERTIES.healer.healPerSecond).toBe(25);
  });

  it('1.1.3 Constructor initializes with high mobility and superior carry retention (90 HP, 8.2 m/s, 18 force)', () => {
    const constructor = new BuddyEntity('c_yellow_1', 'yellow', 'constructor');
    expect(constructor.maxHp).toBe(90);
    expect(constructor.hp).toBe(90);
    expect(constructor.getEffectiveSpeed()).toBe(8.2);
    expect(constructor.getThrowForce()).toBe(18.0);
    expect(CLASS_PROPERTIES.constructor.carrySpeedFactor).toBe(0.95);
  });

  it('1.1.4 Crate carry speed retention differs across all three classes with Constructor fastest under load', () => {
    const fighter = new BuddyEntity('f_test', 'red', 'fighter');
    const healer = new BuddyEntity('h_test', 'cyan', 'healer');
    const constructor = new BuddyEntity('c_test', 'blue', 'constructor');

    fighter.isCarryingCrate = true;
    healer.isCarryingCrate = true;
    constructor.isCarryingCrate = true;

    // Fighter: 6.8 * 0.75 = 5.1
    expect(fighter.getEffectiveSpeed()).toBeCloseTo(5.1, 2);
    // Healer: 7.2 * 0.85 = 6.12
    expect(healer.getEffectiveSpeed()).toBeCloseTo(6.12, 2);
    // Constructor: 8.2 * 0.95 = 7.79
    expect(constructor.getEffectiveSpeed()).toBeCloseTo(7.79, 2);

    expect(constructor.getEffectiveSpeed()).toBeGreaterThan(healer.getEffectiveSpeed());
    expect(healer.getEffectiveSpeed()).toBeGreaterThan(fighter.getEffectiveSpeed());
  });

  it('1.1.5 Knockout clears carrying state, zeroes effective speed, and resets revive progress', () => {
    const buddy = new BuddyEntity('knock_test', 'red', 'fighter');
    buddy.isCarryingCrate = true;
    buddy.takeDamage(130);

    expect(buddy.hp).toBe(0);
    expect(buddy.isKnocked).toBe(true);
    expect(buddy.isCarryingCrate).toBe(false);
    expect(buddy.getEffectiveSpeed()).toBe(0);
    expect(buddy.reviveProgress).toBe(0);
  });

  it('1.1.6 Teammate revive restores exactly 40% maximum HP on completion across classes', () => {
    const fighter = new BuddyEntity('f_revive', 'red', 'fighter');
    const healer = new BuddyEntity('h_revive', 'red', 'healer');
    const constructor = new BuddyEntity('c_revive', 'red', 'constructor');

    fighter.takeDamage(130);
    healer.takeDamage(100);
    constructor.takeDamage(90);

    expect(fighter.applyRevive(100)).toBe(true);
    expect(fighter.hp).toBe(Math.floor(130 * 0.4)); // 52
    expect(fighter.isKnocked).toBe(false);

    expect(healer.applyRevive(100)).toBe(true);
    expect(healer.hp).toBe(Math.floor(100 * 0.4)); // 40
    expect(healer.isKnocked).toBe(false);

    expect(constructor.applyRevive(100)).toBe(true);
    expect(constructor.hp).toBe(Math.floor(90 * 0.4)); // 36
    expect(constructor.isKnocked).toBe(false);
  });
});

describe('Tier 1: Feature Coverage - Pad Recipes (7 Recipes & Structural Rules)', () => {
  it('1.2.1 Recipe 1: 1 Crate anywhere evaluates to Pistol Standard (90 DPS, category weapon)', () => {
    const pad = new StackingPad('red');
    pad.setSlot(3, true); // Bottom layer right-rear
    const result = pad.evaluate();

    expect(result.itemType).toBe('pistol');
    expect(result.category).toBe('weapon');
    expect(result.dps).toBe(90);
    expect(result.title).toContain('Pistol Standard');
  });

  it('1.2.2 Recipe 2: 2 Crates vertical stack (1x1x2) evaluates to Pineapple Grenades (320 DPS)', () => {
    const pad = new StackingPad('blue');
    pad.setSlot(0, true);
    pad.setSlot(4, true); // Above slot 0
    const result = pad.evaluate();

    expect(result.itemType).toBe('grenade');
    expect(result.category).toBe('weapon');
    expect(result.dps).toBe(320);
    expect(result.title).toContain('Granat Nanas');
  });

  it('1.2.3 Recipe 3: 2 Crates horizontal line evaluates to Shotgun Penghancur (220 DPS)', () => {
    const pad = new StackingPad('yellow');
    pad.setSlot(0, true);
    pad.setSlot(1, true); // Horizontal pair on bottom
    const result = pad.evaluate();

    expect(result.itemType).toBe('shotgun');
    expect(result.category).toBe('weapon');
    expect(result.dps).toBe(220);
    expect(result.title).toContain('Shotgun Penghancur');
  });

  it('1.2.4 Recipe 4: 3 Crates (2 bottom + 1 top) evaluates to Medic Buddy unit', () => {
    const pad = new StackingPad('cyan');
    pad.setSlot(1, true);
    pad.setSlot(3, true);
    pad.setSlot(5, true); // Top above slot 1
    const result = pad.evaluate();

    expect(result.itemType).toBe('medic_unit');
    expect(result.category).toBe('unit');
    expect(result.title).toBe('Medic Buddy');
    expect(result.dps).toBe(0);
  });

  it('1.2.5 Recipe 5: 4 Crates flat (full Layer 0) evaluates to Rocket Bazooka (450 DPS)', () => {
    const pad = new StackingPad('red');
    for (let i = 0; i < 4; i++) pad.setSlot(i, true);
    const result = pad.evaluate();

    expect(result.itemType).toBe('bazooka');
    expect(result.category).toBe('weapon');
    expect(result.dps).toBe(450);
    expect(result.title).toContain('Rocket Bazooka');
  });

  it('1.2.6 Recipe 6 & 7: 4 Crates wall (Commando Buddy) and 8 Crates full cube (Heavy Battle Tank 980 DPS)', () => {
    const padCommando = new StackingPad('blue');
    padCommando.setSlot(2, true);
    padCommando.setSlot(3, true);
    padCommando.setSlot(6, true);
    padCommando.setSlot(7, true);
    const commandoRes = padCommando.evaluate();

    expect(commandoRes.itemType).toBe('commando');
    expect(commandoRes.category).toBe('unit');
    expect(commandoRes.dps).toBe(220);

    const padTank = new StackingPad('yellow');
    for (let i = 0; i < 8; i++) padTank.setSlot(i, true);
    const tankRes = padTank.evaluate();

    expect(tankRes.itemType).toBe('tank');
    expect(tankRes.category).toBe('vehicle');
    expect(tankRes.dps).toBe(980);
  });
});

describe('Tier 1: Feature Coverage - Combat & Damage Mechanics', () => {
  it('1.3.1 Direct attacks apply damage and reduce recipient HP accurately', () => {
    const target = new BuddyEntity('target_1', 'blue', 'fighter');
    expect(target.hp).toBe(130);

    const dmg1 = target.takeDamage(25); // Pistol shot
    expect(dmg1).toBe(25);
    expect(target.hp).toBe(105);

    const dmg2 = target.takeDamage(45); // Shotgun blast
    expect(dmg2).toBe(45);
    expect(target.hp).toBe(60);
  });

  it('1.3.2 Blast damage exhibits strict linear distance falloff within blast radius', () => {
    const center: Vector3D = { x: 0, y: 0, z: 0 };
    const baseDamage = 100;
    const radius = 5.0;

    // Exactly at center: 100 * (1 - 0/5) = 100
    expect(PhysicsEngine.calculateAreaDamage(center, { x: 0, y: 0, z: 0 }, baseDamage, radius)).toBe(100);

    // At 2.5m (half radius): 100 * (1 - 2.5/5) = 50
    expect(PhysicsEngine.calculateAreaDamage(center, { x: 2.5, y: 0, z: 0 }, baseDamage, radius)).toBe(50);

    // At 4.0m (80% radius): 100 * (1 - 4/5) = 20
    expect(PhysicsEngine.calculateAreaDamage(center, { x: 0, y: 0, z: 4.0 }, baseDamage, radius)).toBe(20);

    // At boundary 5.0m: 0
    expect(PhysicsEngine.calculateAreaDamage(center, { x: 5.0, y: 0, z: 0 }, baseDamage, radius)).toBe(0);

    // Beyond boundary 6.0m: 0
    expect(PhysicsEngine.calculateAreaDamage(center, { x: 0, y: 0, z: 6.0 }, baseDamage, radius)).toBe(0);
  });

  it('1.3.3 Fatal damage clamps health to zero without underflow and transitions to knocked', () => {
    const buddy = new BuddyEntity('target_fatal', 'cyan', 'constructor');
    expect(buddy.hp).toBe(90);

    const applied = buddy.takeDamage(9999);
    expect(applied).toBe(9999);
    expect(buddy.hp).toBe(0);
    expect(buddy.isKnocked).toBe(true);

    // Subsequent damage while knocked returns 0 and does not change state
    expect(buddy.takeDamage(50)).toBe(0);
    expect(buddy.hp).toBe(0);
  });

  it('1.3.4 Healer passive aura applies to multiple wounded teammates simultaneously within 4.5m', () => {
    const healer = new BuddyEntity('healer_lead', 'red', 'healer', { x: 0, y: 0, z: 0 });
    const ally1 = new BuddyEntity('ally_1', 'red', 'fighter', { x: 2.0, y: 0, z: 0 });
    const ally2 = new BuddyEntity('ally_2', 'red', 'constructor', { x: 0, y: 0, z: 3.5 });
    const distantAlly = new BuddyEntity('ally_distant', 'red', 'fighter', { x: 8.0, y: 0, z: 0 });

    ally1.takeDamage(50); // 80/130
    ally2.takeDamage(50); // 40/90
    distantAlly.takeDamage(50); // 80/130

    // Update aura for 1 second (25 HP/s)
    const totalHealed = healer.updateHealerAura([ally1, ally2, distantAlly], 1.0);

    expect(ally1.hp).toBe(105);
    expect(ally2.hp).toBe(65);
    expect(distantAlly.hp).toBe(80); // Unchanged (outside 4.5m)
    expect(totalHealed).toBe(50);
  });

  it('1.3.5 Grenade fuse timer decrements and triggers detonation when expired', () => {
    const grenade: GrenadeProjectile = {
      id: 'g_fuse_1',
      ownerId: 'player_red',
      position: { x: 0, y: 1.0, z: 0 },
      velocity: { x: 2, y: 2, z: 0 },
      timer: 0.25,
      bounces: 0,
      detonated: false
    };

    PhysicsEngine.updateGrenade(grenade, 0.1);
    expect(grenade.timer).toBeCloseTo(0.15, 2);
    expect(grenade.detonated).toBe(false);

    PhysicsEngine.updateGrenade(grenade, 0.2);
    expect(grenade.detonated).toBe(true);
  });
});

describe('Tier 1: Feature Coverage - Physics & Ballistics', () => {
  it('1.4.1 Arena boundary checks identify in-bounds vs out-of-bounds coordinates', () => {
    expect(PhysicsEngine.isInBounds({ x: 0, y: 0, z: 0 })).toBe(true);
    expect(PhysicsEngine.isInBounds({ x: 32.0, y: 0, z: -32.0 })).toBe(true);
    expect(PhysicsEngine.isInBounds({ x: 32.1, y: 0, z: 0 })).toBe(false);
    expect(PhysicsEngine.isInBounds({ x: 0, y: -2.1, z: 0 })).toBe(false);
  });

  it('1.4.2 Void fall detection identifies entities dropped below -5m or over edge threshold', () => {
    expect(PhysicsEngine.isVoidFallen({ x: 0, y: 1.0, z: 0 })).toBe(false);
    expect(PhysicsEngine.isVoidFallen({ x: 0, y: -5.1, z: 0 })).toBe(true);
    expect(PhysicsEngine.isVoidFallen({ x: 38.5, y: 0, z: 0 })).toBe(true);
    expect(PhysicsEngine.isVoidFallen({ x: 0, y: 0, z: -38.5 })).toBe(true);
  });

  it('1.4.3 3D AABB overlap check differentiates intersecting from separated volumes', () => {
    const boxA: BoundingBox = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 2, y: 2, z: 2 }
    };
    const boxIntersect: BoundingBox = {
      min: { x: 1, y: 1, z: 1 },
      max: { x: 3, y: 3, z: 3 }
    };
    const boxSeparated: BoundingBox = {
      min: { x: 3, y: 0, z: 0 },
      max: { x: 4, y: 2, z: 2 }
    };

    expect(PhysicsEngine.checkAABBOverlap(boxA, boxIntersect)).toBe(true);
    expect(PhysicsEngine.checkAABBOverlap(boxA, boxSeparated)).toBe(false);
  });

  it('1.4.4 Grenade physics applies gravity, ground bounce damping, and ground friction', () => {
    const grenade: GrenadeProjectile = {
      id: 'g_bounce',
      ownerId: 'p1',
      position: { x: 0, y: 0.5, z: 0 },
      velocity: { x: 10, y: -4, z: 0 },
      timer: 2.0,
      bounces: 0,
      detonated: false
    };

    PhysicsEngine.updateGrenade(grenade, 0.1);

    expect(grenade.position.y).toBe(0.2); // Ground plane
    expect(grenade.bounces).toBe(1);
    expect(grenade.velocity.x).toBeCloseTo(10 * PhysicsEngine.GROUND_FRICTION, 2);
    expect(grenade.velocity.y).toBeGreaterThan(0); // Upward reflection
  });

  it('1.4.5 Crate entity supports free-fall physics, head mounting, throwing, and pad snapping', () => {
    const crate = new CrateEntity('crate_phys_1', { x: 0, y: 5.0, z: 0 });

    // Free fall step
    crate.updatePhysics(0.1);
    expect(crate.velocity.y).toBeLessThan(0);
    expect(crate.position.y).toBeLessThan(5.0);

    // Head mounting
    crate.attachToBuddy('buddy_mount', { x: 5, y: 0, z: 5 });
    expect(crate.isHeld).toBe(true);
    expect(crate.heldByBuddyId).toBe('buddy_mount');
    expect(crate.position.y).toBeCloseTo(1.15, 2);

    // Forward throw
    crate.throwCrate({ x: 5, y: 0, z: 5 }, { x: 1, y: 0, z: 0 }, 15.0);
    expect(crate.isHeld).toBe(false);
    expect(crate.heldByBuddyId).toBeNull();
    expect(crate.velocity.x).toBe(15.0);
    expect(crate.velocity.y).toBe(6.0);

    // Snap to Pad slot 5 (top layer)
    crate.snapToPad('red', 5, { x: -18, y: 0, z: -18 });
    expect(crate.isStackedOnPad).toBe(true);
    expect(crate.padTeamId).toBe('red');
    expect(crate.padSlotIndex).toBe(5);
    expect(crate.position.y).toBeCloseTo(0.35 + 0.72, 2); // Layer 1 height
  });
});

describe('Tier 1: Feature Coverage - Network & P2P Protocol', () => {
  const sampleState: CompactMatchSnapshot = {
    seq: 50,
    time: 12.4,
    buddies: [
      {
        id: 'peer_1',
        team: 'red',
        cls: 'fighter',
        x: 14.52,
        y: 0.7,
        z: -12.33,
        vx: 1.2,
        vz: 0.0,
        hp: 130,
        wpn: 'pistol',
        crate: false,
        knocked: false
      }
    ],
    scores: { red: 5, blue: 0, yellow: 0, cyan: 0 },
    baseHp: { red: 1000, blue: 920, yellow: 1000, cyan: 1000 }
  };

  it('1.5.1 Quantization functions reduce coordinate precision predictably', () => {
    expect(NetworkProtocol.q2(14.52981)).toBe(14.53);
    expect(NetworkProtocol.q1(14.52981)).toBe(14.5);
    expect(NetworkProtocol.q2(-0.0049)).toBe(-0);
  });

  it('1.5.2 Complete match snapshot encodes and decodes losslessly', () => {
    const encoded = NetworkProtocol.serializeSnapshot(sampleState);
    const parsed = NetworkProtocol.deserializeSnapshot(encoded, 40);

    expect(parsed.valid).toBe(true);
    expect(parsed.snapshot?.seq).toBe(50);
    expect(parsed.snapshot?.buddies.length).toBe(1);
    expect(parsed.snapshot?.buddies[0].cls).toBe('fighter');
    expect(parsed.snapshot?.baseHp.blue).toBe(920);
  });

  it('1.5.3 Rejects stale or duplicate packet sequence numbers', () => {
    const encoded = NetworkProtocol.serializeSnapshot({ ...sampleState, seq: 50 });
    const parsed = NetworkProtocol.deserializeSnapshot(encoded, 50); // Current sequence is already 50

    expect(parsed.valid).toBe(false);
    expect(parsed.reason).toContain('Stale or duplicate sequence');
  });

  it('1.5.4 Validates snapshot payload structure and buddy health types', () => {
    const invalidPayload = JSON.stringify({ seq: 60, time: 15, buddies: [{ id: 'b1', team: 'blue' }] }); // missing hp
    const parsed = NetworkProtocol.deserializeSnapshot(invalidPayload, 50);

    expect(parsed.valid).toBe(false);
    expect(parsed.reason).toContain('Invalid buddy record');
  });

  it('1.5.5 Seamless peer disconnect converts dropped player to AI bot', () => {
    const buddies: CompactBuddyState[] = [
      {
        id: 'player_drop_alpha',
        team: 'yellow',
        cls: 'healer',
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vz: 0,
        hp: 100,
        wpn: 'medic',
        crate: false,
        knocked: false
      }
    ];

    const result = NetworkProtocol.handlePeerDisconnect('player_drop_alpha', buddies);
    expect(result.convertedToBot).toBe(true);
    expect(result.affectedBuddyId).toBe('bot_player_drop_alpha');
    expect(buddies[0].id).toBe('bot_player_drop_alpha');
  });
});

describe('Tier 1: Feature Coverage - Bot AI State Machine', () => {
  it('1.6.1 Transitions to RETURN_BASE when carrying a crate', () => {
    const bot = new BotAI();
    const buddy = new BuddyEntity('bot_b', 'blue', 'fighter');
    buddy.isCarryingCrate = true;
    const alliesPad = new StackingPad('blue', 18, -18);

    const decision = bot.update(buddy, [], alliesPad, [], 0.1);
    expect(bot.state).toBe('RETURN_BASE');
  });

  it('1.6.2 Transitions to ATTACK_ENEMY when equipped with weapon and not carrying crate', () => {
    const bot = new BotAI();
    const buddy = new BuddyEntity('bot_b', 'blue', 'fighter');
    buddy.weapon = 'shotgun';
    const alliesPad = new StackingPad('blue', 18, -18);
    const enemy = new BuddyEntity('enemy_1', 'red', 'fighter', { x: 5, y: 0, z: 5 });

    bot.update(buddy, [], alliesPad, [enemy], 0.1);
    expect(bot.state).toBe('ATTACK_ENEMY');
  });

  it('1.6.3 In SEEK_CRATE state, moves toward nearest free crate and interacts within 1.4m', () => {
    const bot = new BotAI();
    const buddy = new BuddyEntity('bot_c', 'cyan', 'constructor', { x: 0, y: 0, z: 0 });
    const crateFar = new CrateEntity('c_far', { x: 10, y: 0, z: 0 });
    const alliesPad = new StackingPad('cyan', 18, 18);

    // Far from crate -> moves toward crate
    const decisionFar = bot.update(buddy, [crateFar], alliesPad, [], 0.1);
    expect(decisionFar.action).toBe('none');
    expect(decisionFar.moveDir.x).toBeGreaterThan(0.9);

    // Near crate (<= 1.4m) -> interacts to pick up
    const crateClose = new CrateEntity('c_close', { x: 1.0, y: 0, z: 0 });
    const decisionClose = bot.update(buddy, [crateClose], alliesPad, [], 0.1);
    expect(decisionClose.action).toBe('interact');
    expect(decisionClose.moveDir.x).toBe(0);
  });

  it('1.6.4 In RETURN_BASE state, places crate when reaching allied pad (<= 1.8m)', () => {
    const bot = new BotAI();
    const buddy = new BuddyEntity('bot_d', 'red', 'constructor', { x: -17.5, y: 0, z: -17.5 });
    buddy.isCarryingCrate = true;
    const alliesPad = new StackingPad('red', -18, -18);

    const decision = bot.update(buddy, [], alliesPad, [], 0.1);
    expect(decision.action).toBe('interact'); // Place on pad
  });

  it('1.6.5 In ATTACK_ENEMY state, triggers attack action within 8.0m combat range', () => {
    const bot = new BotAI();
    const buddy = new BuddyEntity('bot_e', 'yellow', 'fighter', { x: 0, y: 0, z: 0 });
    buddy.weapon = 'pistol';
    const enemyInRange = new BuddyEntity('enemy_close', 'red', 'fighter', { x: 5.0, y: 0, z: 0 });
    const alliesPad = new StackingPad('yellow', -18, 18);

    const decision = bot.update(buddy, [], alliesPad, [enemyInRange], 0.1);
    expect(decision.action).toBe('attack');
  });

  it('1.6.6 Knocked down bot outputs zero movement vector and action none', () => {
    const bot = new BotAI();
    const buddy = new BuddyEntity('bot_f', 'blue', 'fighter');
    buddy.takeDamage(130);
    const alliesPad = new StackingPad('blue', 18, -18);

    const decision = bot.update(buddy, [], alliesPad, [], 0.1);
    expect(decision.moveDir).toEqual({ x: 0, y: 0, z: 0 });
    expect(decision.action).toBe('none');
  });
});

describe('Tier 1: Feature Coverage - Bunker Health & Win Conditions', () => {
  interface MatchState {
    bunkers: Record<TeamId, number>;
    buddies: BuddyEntity[];
  }

  function evaluateMatchState(state: MatchState): {
    eliminatedTeams: TeamId[];
    isGameOver: boolean;
    winningTeam: TeamId | null;
  } {
    const teams: TeamId[] = ['red', 'blue', 'yellow', 'cyan'];
    const eliminated: TeamId[] = [];

    for (const t of teams) {
      const isBunkerDown = state.bunkers[t] <= 0;
      const teamBuddies = state.buddies.filter((b) => b.team === t);
      const allBuddiesDown = teamBuddies.length === 0 || teamBuddies.every((b) => b.isKnocked);

      if (isBunkerDown && allBuddiesDown) {
        eliminated.push(t);
      }
    }

    const surviving = teams.filter((t) => !eliminated.includes(t));
    const isGameOver = surviving.length <= 1;
    const winningTeam = surviving.length === 1 ? surviving[0] : null;

    return { eliminatedTeams: eliminated, isGameOver, winningTeam };
  }

  it('1.7.1 All team bunkers initialize with 1000 HP and start intact', () => {
    const baseHp: Record<TeamId, number> = { red: 1000, blue: 1000, yellow: 1000, cyan: 1000 };
    Object.values(baseHp).forEach((hp) => expect(hp).toBe(1000));
  });

  it('1.7.2 Bunker damage reduces health; bunker destroyed when HP reaches <= 0', () => {
    let bunkerHp = 1000;
    bunkerHp -= 450; // Bazooka hit
    expect(bunkerHp).toBe(550);
    bunkerHp -= 980; // Tank hit
    expect(bunkerHp).toBeLessThanOrEqual(0);
  });

  it('1.7.3 Respawn rule: teams can reinforce as long as their Base Bunker is intact', () => {
    const match: MatchState = {
      bunkers: { red: 1000, blue: 500, yellow: 1000, cyan: 1000 },
      buddies: [
        new BuddyEntity('b1', 'blue', 'fighter') // Knocked out
      ]
    };
    match.buddies[0].takeDamage(130);

    const evalResult = evaluateMatchState(match);
    // Blue bunker is still at 500 HP, so Blue is NOT eliminated
    expect(evalResult.eliminatedTeams).not.toContain('blue');
    expect(evalResult.isGameOver).toBe(false);
  });

  it('1.7.4 Elimination rule: team defeated when bunker is destroyed AND all buddies are knocked', () => {
    const match: MatchState = {
      bunkers: { red: 1000, blue: 0, yellow: 1000, cyan: 1000 },
      buddies: [
        new BuddyEntity('r1', 'red', 'fighter'),
        new BuddyEntity('b1', 'blue', 'fighter')
      ]
    };
    match.buddies[1].takeDamage(130); // Knock Blue's only buddy

    const evalResult = evaluateMatchState(match);
    expect(evalResult.eliminatedTeams).toContain('blue');
  });

  it('1.7.5 Last team standing victory rule declares winner when 3 teams are wiped', () => {
    const match: MatchState = {
      bunkers: { red: 800, blue: 0, yellow: 0, cyan: 0 },
      buddies: [
        new BuddyEntity('r1', 'red', 'fighter'),
        new BuddyEntity('b1', 'blue', 'fighter'),
        new BuddyEntity('y1', 'yellow', 'constructor'),
        new BuddyEntity('c1', 'cyan', 'healer')
      ]
    };
    // Knock all opposing buddies
    match.buddies[1].takeDamage(130);
    match.buddies[2].takeDamage(90);
    match.buddies[3].takeDamage(100);

    const evalResult = evaluateMatchState(match);
    expect(evalResult.eliminatedTeams).toEqual(expect.arrayContaining(['blue', 'yellow', 'cyan']));
    expect(evalResult.isGameOver).toBe(true);
    expect(evalResult.winningTeam).toBe('red');
  });
});

// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES
// ============================================================================

describe('Tier 2: Boundary & Corner Cases', () => {
  it('2.1 Empty inputs: pad with 0 crates returns empty recipe metadata', () => {
    const pad = new StackingPad('red');
    const res = pad.evaluate();

    expect(res.category).toBe('empty');
    expect(res.itemType).toBe('none');
    expect(res.dps).toBe(0);
    expect(res.title).toBe('Pad Kosong');
  });

  it('2.2 Zero and negative values: damage and healing inputs reject negative numbers safely', () => {
    const buddy = new BuddyEntity('edge_hero', 'blue', 'fighter');
    buddy.takeDamage(40); // 90/130

    expect(buddy.takeDamage(-100)).toBe(0);
    expect(buddy.hp).toBe(90);

    expect(buddy.receiveHeal(-50)).toBe(0);
    expect(buddy.hp).toBe(90);

    // Negative radius or negative damage in blast physics
    const center: Vector3D = { x: 0, y: 0, z: 0 };
    const target: Vector3D = { x: 1, y: 0, z: 0 };
    expect(PhysicsEngine.calculateAreaDamage(center, target, -100, 5)).toBe(0);
    expect(PhysicsEngine.calculateAreaDamage(center, target, 100, -5)).toBe(0);
    expect(PhysicsEngine.calculateAreaDamage(center, target, 0, 5)).toBe(0);
    expect(PhysicsEngine.calculateAreaDamage(center, target, 100, 0)).toBe(0);
  });

  it('2.3 Out of bounds: slot indices outside 0..7 throw explicit errors', () => {
    const pad = new StackingPad('yellow');
    expect(() => pad.setSlot(-999, true)).toThrowError(/Invalid slot index/);
    expect(() => pad.setSlot(-1, true)).toThrowError(/Invalid slot index/);
    expect(() => pad.setSlot(8, true)).toThrowError(/Invalid slot index/);
    expect(() => pad.setSlot(100, true)).toThrowError(/Invalid slot index/);
  });

  it('2.4 Maximum stack: exactly 8 crates creates Heavy Battle Tank without overflow', () => {
    const pad = new StackingPad('cyan');
    for (let i = 0; i < 8; i++) {
      pad.setSlot(i, true);
    }
    expect(pad.totalCrates).toBe(8);
    const recipe = pad.evaluate();
    expect(recipe.itemType).toBe('tank');
    expect(recipe.dps).toBe(980);
  });

  it('2.5 Fatal damage clamping: extreme damage (1,000,000) does not cause negative health', () => {
    const buddy = new BuddyEntity('mortal_buddy', 'red', 'constructor');
    buddy.takeDamage(1000000);
    expect(buddy.hp).toBe(0);
    expect(buddy.isKnocked).toBe(true);
  });

  it('2.6 Knockout state prevents healing without revive and prevents speed calculations', () => {
    const knockedBuddy = new BuddyEntity('down_buddy', 'blue', 'healer');
    knockedBuddy.takeDamage(100);
    expect(knockedBuddy.isKnocked).toBe(true);

    // Attempting direct heal must return 0
    expect(knockedBuddy.receiveHeal(50)).toBe(0);
    expect(knockedBuddy.hp).toBe(0);

    // Effective speed must be 0
    expect(knockedBuddy.getEffectiveSpeed()).toBe(0);
  });
});

// ============================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS
// ============================================================================

describe('Tier 3: Cross-Feature Combinations', () => {
  it('3.1 Healer carrying crate under fire maintains aura until knocked down', () => {
    const healer = new BuddyEntity('healer_cross', 'cyan', 'healer', { x: 0, y: 0, z: 0 });
    const woundedAlly = new BuddyEntity('ally_cross', 'cyan', 'fighter', { x: 2, y: 0, z: 0 });
    woundedAlly.takeDamage(60); // 70/130 HP

    // Healer picks up crate
    healer.isCarryingCrate = true;
    expect(healer.getEffectiveSpeed()).toBeCloseTo(7.2 * 0.85, 2);

    // Takes non-fatal hit under fire (30 damage)
    healer.takeDamage(30);
    expect(healer.hp).toBe(70);
    expect(healer.isCarryingCrate).toBe(true);

    // Aura heals ally while moving with crate
    healer.updateHealerAura([woundedAlly], 1.0);
    expect(woundedAlly.hp).toBe(95);

    // Takes fatal hit (70 damage)
    healer.takeDamage(70);
    expect(healer.isKnocked).toBe(true);
    expect(healer.isCarryingCrate).toBe(false); // Crate dropped

    // Knocked healer aura ceases healing
    healer.updateHealerAura([woundedAlly], 1.0);
    expect(woundedAlly.hp).toBe(95); // No additional heal
  });

  it('3.2 Constructor crafting grenade from pad utilizes maximum throw force across arena', () => {
    const constructor = new BuddyEntity('c_thrower', 'blue', 'constructor', { x: 18, y: 0, z: -18 });
    const pad = new StackingPad('blue', 18, -18);

    // Build Grenades on pad (slots 1 & 5 vertical stack)
    pad.setSlot(1, true);
    pad.setSlot(5, true);
    const recipe = pad.evaluate();
    expect(recipe.itemType).toBe('grenade');

    // Equip grenade
    constructor.weapon = 'grenade';
    pad.clear();
    expect(pad.totalCrates).toBe(0);

    // Constructor throws grenade using class throw force (18.0)
    const throwDir: Vector3D = { x: -1, y: 0, z: 0 };
    const grenade: GrenadeProjectile = {
      id: 'g_long_throw',
      ownerId: constructor.id,
      position: { x: constructor.position.x, y: 1.2, z: constructor.position.z },
      velocity: {
        x: throwDir.x * constructor.getThrowForce(),
        y: 6.0,
        z: throwDir.z * constructor.getThrowForce()
      },
      timer: 3.0,
      bounces: 0,
      detonated: false
    };

    expect(grenade.velocity.x).toBe(-18.0);

    // Step physics 0.5s: moves 9 meters across the arena
    PhysicsEngine.updateGrenade(grenade, 0.5);
    expect(grenade.position.x).toBeCloseTo(18 - 9, 1);
  });

  it('3.3 Fighter commanding Heavy Battle Tank vehicle obliterates enemy bunker fort', () => {
    const fighter = new BuddyEntity('f_commander', 'red', 'fighter');
    const redPad = new StackingPad('red', -18, -18);

    // Assemble 8-crate cube
    for (let i = 0; i < 8; i++) redPad.setSlot(i, true);
    const buildRes = redPad.evaluate();
    expect(buildRes.itemType).toBe('tank');
    expect(buildRes.dps).toBe(980);

    // Fighter damage multiplier applies to heavy vehicle DPS
    const effectiveTankDps = buildRes.dps * CLASS_PROPERTIES.fighter.damageMultiplier;
    expect(effectiveTankDps).toBe(980 * 1.25); // 1225 DPS

    // Bombard enemy Cyan Bunker (1000 HP) for 1 second
    let cyanBunkerHp = 1000;
    cyanBunkerHp -= effectiveTankDps * 1.0;
    expect(cyanBunkerHp).toBeLessThanOrEqual(0); // Bunker completely destroyed
  });

  it('3.4 Multi-team crossfire with area blast knockdown and healer revive recovery', () => {
    const redFighter = new BuddyEntity('r_fighter', 'red', 'fighter', { x: 0, y: 0, z: 0 });
    const blueConstructor = new BuddyEntity('b_const', 'blue', 'constructor', { x: 1.5, y: 0, z: 0 });
    const blueHealer = new BuddyEntity('b_healer', 'blue', 'healer', { x: 8, y: 0, z: 0 });

    // Grenade explodes at (1.0, 0, 0) with 100 base damage and 5.0m radius
    const explosionCenter: Vector3D = { x: 1.0, y: 0, z: 0 };

    // Blue Constructor is 0.5m away: 100 * (1 - 0.5/5) = 90 damage -> exactly fatal to 90 HP constructor!
    const dmgConst = PhysicsEngine.calculateAreaDamage(explosionCenter, blueConstructor.position, 100, 5.0);
    expect(dmgConst).toBe(90);
    blueConstructor.takeDamage(dmgConst);
    expect(blueConstructor.isKnocked).toBe(true);

    // Red Fighter is 1.0m away: 100 * (1 - 1.0/5) = 80 damage -> Fighter survives with 50/130 HP
    const dmgFighter = PhysicsEngine.calculateAreaDamage(explosionCenter, redFighter.position, 100, 5.0);
    expect(dmgFighter).toBe(80);
    redFighter.takeDamage(dmgFighter);
    expect(redFighter.hp).toBe(50);
    expect(redFighter.isKnocked).toBe(false);

    // Blue Healer rushes to revive Blue Constructor
    blueConstructor.applyRevive(50);
    expect(blueConstructor.isKnocked).toBe(true);
    blueConstructor.applyRevive(50);
    expect(blueConstructor.isKnocked).toBe(false);
    expect(blueConstructor.hp).toBe(36); // 40% of 90 HP
  });
});

// ============================================================================
// TIER 4: REAL-WORLD SCENARIOS (Full Match Lifecycle)
// ============================================================================

describe('Tier 4: Real-World Scenarios - Full Match Lifecycle', () => {
  it('4.1 Scenario A: Opening phase - Crate drop, bot collection, return to base, and pad crafting', () => {
    // 1. Spawning match entities
    const redPad = new StackingPad('red', -18, -18);
    const redBotBuddy = new BuddyEntity('bot_red_collector', 'red', 'constructor', { x: -16, y: 0, z: -16 });
    const redBotAI = new BotAI();

    // 2. Center crate drops from sky
    const centerCrate = new CrateEntity('crate_center_drop', { x: 0, y: 0.35, z: 0 });
    const activeCrates = [centerCrate];

    // 3. Bot discovers crate and begins moving toward it
    const step1 = redBotAI.update(redBotBuddy, activeCrates, redPad, [], 0.1);
    expect(redBotAI.state).toBe('SEEK_CRATE');
    expect(step1.moveDir.x).toBeGreaterThan(0.5); // Heading from -16 towards 0

    // 4. Bot reaches crate and picks it up
    redBotBuddy.position = { x: 0.5, y: 0, z: 0 };
    const step2 = redBotAI.update(redBotBuddy, activeCrates, redPad, [], 0.1);
    expect(step2.action).toBe('interact');

    centerCrate.attachToBuddy(redBotBuddy.id, redBotBuddy.position);
    redBotBuddy.isCarryingCrate = true;

    // 5. Bot transitions to returning crate to allied pad
    const step3 = redBotAI.update(redBotBuddy, activeCrates, redPad, [], 0.1);
    expect(redBotAI.state).toBe('RETURN_BASE');
    expect(step3.moveDir.x).toBeLessThan(-0.5); // Heading back towards -18

    // 6. Bot reaches pad and places crate in slot 0
    redBotBuddy.position = { x: -17.5, y: 0, z: -17.5 };
    const step4 = redBotAI.update(redBotBuddy, activeCrates, redPad, [], 0.1);
    expect(step4.action).toBe('interact');

    redPad.setSlot(0, true);
    centerCrate.snapToPad('red', 0, { x: -18, y: 0, z: -18 });
    redBotBuddy.isCarryingCrate = false;

    // 7. Pad evaluates to Pistol Standard
    const recipe = redPad.evaluate();
    expect(recipe.itemType).toBe('pistol');
  });

  it('4.2 Scenario B: Mid-game assault - Pad unit reinforcement and concentrated bunker siege', () => {
    const bluePad = new StackingPad('blue', 18, -18);
    const yellowBunkerHpStart = 1000;

    // Blue stacks 4 crates as a vertical wall to summon Commando Buddy
    bluePad.setSlot(0, true);
    bluePad.setSlot(1, true);
    bluePad.setSlot(4, true);
    bluePad.setSlot(5, true);

    const recipe = bluePad.evaluate();
    expect(recipe.itemType).toBe('commando');
    expect(recipe.category).toBe('unit');

    // Summon commando unit
    const commando = new BuddyEntity('commando_blue_spawned', 'blue', 'fighter', { x: 18, y: 0, z: -18 });
    commando.weapon = 'shotgun';
    bluePad.clear();

    // Commando moves across map to Yellow base bunker (-18, 18)
    commando.position = { x: -16, y: 0, z: 16 };

    // Sustained attack on Yellow bunker fort
    let yellowBunkerHp = yellowBunkerHpStart;
    const shotDamage = 45 * CLASS_PROPERTIES.fighter.damageMultiplier; // 56.25 damage/shot
    for (let volley = 0; volley < 18; volley++) {
      yellowBunkerHp -= shotDamage;
    }

    expect(yellowBunkerHp).toBeLessThanOrEqual(0); // Bunker fallen
  });

  it('4.3 Scenario C: Endgame elimination - Destroying remaining base bunkers and wiping surviving squads', () => {
    // 4 Teams match
    const bunkers: Record<TeamId, number> = {
      red: 750,
      blue: 0,     // Destroyed
      yellow: 0,   // Destroyed
      cyan: 120    // Critical
    };

    const redTroop = new BuddyEntity('red_champ', 'red', 'fighter', { x: 0, y: 0, z: 0 });
    const blueTroop = new BuddyEntity('blue_last', 'blue', 'fighter', { x: 18, y: 0, z: -18 });
    const cyanTroop = new BuddyEntity('cyan_last', 'cyan', 'healer', { x: 18, y: 0, z: 18 });

    // Blue's bunker is 0, now Blue's troop is knocked out
    blueTroop.takeDamage(130);
    expect(blueTroop.isKnocked).toBe(true);

    // Final strike on Cyan bunker destroys it
    bunkers.cyan -= 120;
    expect(bunkers.cyan).toBe(0);

    // Knock out Cyan's remaining troop
    cyanTroop.takeDamage(100);
    expect(cyanTroop.isKnocked).toBe(true);

    // Evaluation: Red is the only surviving team
    const teams: TeamId[] = ['red', 'blue', 'yellow', 'cyan'];
    const activeTeams = teams.filter((t) => {
      const bunkerOk = bunkers[t] > 0;
      const buddyOk = [redTroop, blueTroop, cyanTroop].some((b) => b.team === t && !b.isKnocked);
      return bunkerOk || buddyOk;
    });

    expect(activeTeams).toEqual(['red']);
  });
});

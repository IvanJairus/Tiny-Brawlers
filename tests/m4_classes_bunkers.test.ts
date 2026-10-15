import { describe, it, expect, beforeEach } from 'vitest';
import { TinyBrawlersGame } from '../src/game';
import { BuddyEntity } from '../src/entities/buddy';
import { StackingPad } from '../src/entities/basePad';
import { CrateEntity } from '../src/entities/crate';
import { BotAI } from '../src/ai/bot';
import { CLASS_PROPERTIES, TeamId } from '../src/types';

describe('Milestone 4: Classes, Tactical AI & Base Bunker Destruction', () => {
  let game: TinyBrawlersGame;

  beforeEach(() => {
    // Construct in headless test mode
    game = new TinyBrawlersGame(null as any, 'fighter');
  });

  describe('4.1 Class Combat Properties & Multipliers', () => {
    it('Fighter class applies 1.25x damage multiplier', () => {
      expect(CLASS_PROPERTIES.fighter.damageMultiplier).toBe(1.25);
      expect(CLASS_PROPERTIES.fighter.maxHp).toBe(130);
      expect(CLASS_PROPERTIES.fighter.throwForce).toBe(14.0);

      const fighter = new BuddyEntity('f1', 'red', 'fighter');
      const target = new BuddyEntity('t1', 'blue', 'fighter');

      const baseDmg = 40;
      const dealt = target.takeDamage(baseDmg * CLASS_PROPERTIES[fighter.classType].damageMultiplier);
      expect(dealt).toBe(50);
      expect(target.hp).toBe(130 - 50);
    });

    it('Constructor class has 0.95 carry factor and 18.0 throw force', () => {
      expect(CLASS_PROPERTIES.constructor.carrySpeedFactor).toBe(0.95);
      expect(CLASS_PROPERTIES.constructor.moveSpeed).toBe(8.2);
      expect(CLASS_PROPERTIES.constructor.throwForce).toBe(18.0);

      const builder = new BuddyEntity('c1', 'yellow', 'constructor');
      builder.isCarryingCrate = true;
      expect(builder.getEffectiveSpeed()).toBeCloseTo(8.2 * 0.95, 2);
      expect(builder.getThrowForce()).toBe(18.0);
    });

    it('Healer class has 4.5m aura, 25 HP/s heal rate, and 0.8 damage factor', () => {
      expect(CLASS_PROPERTIES.healer.healAuraRadius).toBe(4.5);
      expect(CLASS_PROPERTIES.healer.healPerSecond).toBe(25);
      expect(CLASS_PROPERTIES.healer.damageMultiplier).toBe(0.8);

      const healer = new BuddyEntity('h1', 'cyan', 'healer', { x: 0, y: 0, z: 0 });
      const wounded = new BuddyEntity('w1', 'cyan', 'fighter', { x: 2, y: 0, z: 0 });
      wounded.takeDamage(60); // 70/130 HP

      const healed = healer.updateHealerAura([wounded], 1.0);
      expect(healed).toBe(25);
      expect(wounded.hp).toBe(95);
    });
  });

  describe('4.2 Base Bunker Durability & Damage Mechanics', () => {
    it('Initializes 4 team bunkers with 1000 HP at designated arena coordinates', () => {
      const teams: TeamId[] = ['red', 'blue', 'yellow', 'cyan'];
      for (const t of teams) {
        expect(game.getBunkerHealth(t)).toBe(1000);
        expect(game.bunkerPositions[t]).toBeDefined();
        expect(Math.abs(game.bunkerPositions[t].x)).toBeCloseTo(21.2, 1);
        expect(Math.abs(game.bunkerPositions[t].z)).toBeCloseTo(21.2, 1);
      }
    });

    it('damageBunker reduces health, clamps at zero, and returns actual damage applied', () => {
      const dealt1 = game.damageBunker('blue', 450);
      expect(dealt1).toBe(450);
      expect(game.getBunkerHealth('blue')).toBe(550);

      const dealt2 = game.damageBunker('blue', 600);
      expect(dealt2).toBe(550);
      expect(game.getBunkerHealth('blue')).toBe(0);

      // Subsequent damage on destroyed bunker yields 0
      const dealt3 = game.damageBunker('blue', 200);
      expect(dealt3).toBe(0);
      expect(game.getBunkerHealth('blue')).toBe(0);
    });

    it('Player attack hits enemy bunker when no enemy buddy is nearby', () => {
      game.player.position = { x: 20.0, y: 0, z: -20.0 }; // Near Blue bunker (21.2, -21.2)
      game.player.weapon = 'shotgun';

      // Move opposing bots far away
      for (const b of game.buddies) {
        if (b.team !== 'red') {
          b.position = { x: -100, y: 0, z: -100 };
        }
      }

      const initialHp = game.getBunkerHealth('blue');
      game.handlePlayerAttack();
      expect(game.getBunkerHealth('blue')).toBeLessThan(initialHp);
    });
  });

  describe('4.3 Respawn Mechanics with Bunker Intact vs Destroyed', () => {
    it('Knocked buddy respawns at allied base after 5.0 seconds when bunker is intact', () => {
      const bot = game.buddies.find((b) => b.team === 'blue')!;
      bot.takeDamage(999);
      expect(bot.isKnocked).toBe(true);
      expect(bot.hp).toBe(0);

      // Simulate 3 seconds (not yet ready to respawn)
      game.updateRespawns(3.0);
      expect(bot.isKnocked).toBe(true);

      // Simulate 2.5 additional seconds (total 5.5s >= 5.0s)
      game.updateRespawns(2.5);
      expect(bot.isKnocked).toBe(false);
      expect(bot.hp).toBe(bot.maxHp);
      expect(bot.position.x).toBe(game.pads.blue.origin.x);
      expect(bot.position.z).toBe(game.pads.blue.origin.z);
    });

    it('Knocked buddy DOES NOT respawn if team bunker has been destroyed', () => {
      // Destroy Yellow bunker
      game.damageBunker('yellow', 1000);
      expect(game.getBunkerHealth('yellow')).toBe(0);

      const yellowBot = game.buddies.find((b) => b.team === 'yellow')!;
      yellowBot.takeDamage(999);
      expect(yellowBot.isKnocked).toBe(true);

      // Simulate 10 seconds of respawn updates
      game.updateRespawns(10.0);
      expect(yellowBot.isKnocked).toBe(true);
      expect(yellowBot.hp).toBe(0);
    });
  });

  describe('4.4 Troop Reinforcements Spawning', () => {
    it('Spawns reinforcement buddy if active squad is below limit and bunker is intact', () => {
      const initialCount = game.buddies.filter((b) => b.team === 'cyan').length;

      // Force reinforcement timer to expire
      game.updateReinforcements(25.0);

      const newCount = game.buddies.filter((b) => b.team === 'cyan').length;
      expect(newCount).toBeGreaterThan(initialCount);
    });

    it('Does not spawn reinforcements if bunker is destroyed', () => {
      game.damageBunker('cyan', 1000);
      const countBefore = game.buddies.filter((b) => b.team === 'cyan').length;

      game.updateReinforcements(25.0);
      const countAfter = game.buddies.filter((b) => b.team === 'cyan').length;
      expect(countAfter).toBe(countBefore);
    });
  });

  describe('4.5 Team Elimination & Victory Win Condition', () => {
    it('Eliminates team only when bunker is destroyed AND all team buddies are down', () => {
      // Destroy blue bunker but keep buddy alive
      game.damageBunker('blue', 1000);
      const blueBuddy = game.buddies.find((b) => b.team === 'blue')!;
      expect(blueBuddy.isKnocked).toBe(false);

      let matchState = game.evaluateMatchState();
      expect(matchState.eliminatedTeams).not.toContain('blue');

      // Now knock out blue buddy
      blueBuddy.takeDamage(999);
      matchState = game.evaluateMatchState();
      expect(matchState.eliminatedTeams).toContain('blue');
      expect(game.isTeamEliminated('blue')).toBe(true);
    });

    it('Declares victory for the last standing team when all 3 rival teams are wiped', () => {
      // Wipe Blue
      game.damageBunker('blue', 1000);
      game.buddies.filter((b) => b.team === 'blue').forEach((b) => b.takeDamage(999));

      // Wipe Yellow
      game.damageBunker('yellow', 1000);
      game.buddies.filter((b) => b.team === 'yellow').forEach((b) => b.takeDamage(999));

      // Wipe Cyan
      game.damageBunker('cyan', 1000);
      game.buddies.filter((b) => b.team === 'cyan').forEach((b) => b.takeDamage(999));

      const matchState = game.evaluateMatchState();
      expect(matchState.isGameOver).toBe(true);
      expect(matchState.winningTeam).toBe('red');
      expect(game.getSurvivingTeams()).toEqual(['red']);
    });
  });

  describe('4.6 Tactical AI Bot Behaviors', () => {
    it('Bot attacks nearest enemy bunker when all enemy buddies are down', () => {
      const bot = new BotAI();
      const buddy = new BuddyEntity('bot_attacker', 'blue', 'fighter', { x: 10, y: 0, z: 10 });
      buddy.weapon = 'shotgun';
      const alliesPad = new StackingPad('blue', 18, -18);

      const enemyBunkers = [
        { team: 'red' as TeamId, pos: { x: -21.2, y: 0, z: -21.2 }, hp: 1000 },
        { team: 'cyan' as TeamId, pos: { x: 12.0, y: 0, z: 12.0 }, hp: 500 } // Near cyan bunker
      ];

      const decision = bot.update(buddy, [], alliesPad, [], 0.1, enemyBunkers);
      expect(decision.action).toBe('attack');
      expect(bot.targetType).toBe('bunker');
      expect(decision.targetPos).toEqual({ x: 12.0, y: 0, z: 12.0 });
    });

    it('Bot returns to base and triggers interact when pad has a craftable recipe', () => {
      const bot = new BotAI();
      const buddy = new BuddyEntity('bot_builder', 'yellow', 'constructor', { x: -17.5, y: 0, z: 17.5 });
      const alliesPad = new StackingPad('yellow', -18, 18);
      alliesPad.setSlot(0, true); // 1 crate -> Pistol recipe

      const decision = bot.update(buddy, [], alliesPad, [], 0.1);
      expect(bot.state).toBe('RETURN_BASE');
      expect(decision.action).toBe('interact');
    });
  });
});

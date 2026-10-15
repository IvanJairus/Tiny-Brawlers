import { describe, it, expect, beforeEach } from 'vitest';
import { TinyBrawlersGame } from '../src/game';
import { StackingPad } from '../src/entities/basePad';
import { BuddyEntity } from '../src/entities/buddy';
import { TeamId } from '../src/types';

describe('Milestone 5: HUD Scoreboard, 2x2x2 Pad Visualizer & Touch Controls', () => {
  let game: TinyBrawlersGame;

  beforeEach(() => {
    // Construct headless game instance for test verification
    game = new TinyBrawlersGame(null as any, 'fighter');
  });

  describe('5.1 Bunker Scoreboard & Health Tracking', () => {
    it('Calculates bunker HP percentage correctly for HUD width bars', () => {
      const teams: TeamId[] = ['red', 'blue', 'yellow', 'cyan'];
      for (const t of teams) {
        expect(game.baseHp[t]).toBe(1000);
        const percent = (game.baseHp[t] / 1000) * 100;
        expect(percent).toBe(100);
      }

      // Damage Red bunker by 350
      game.damageBunker('red', 350);
      expect(game.baseHp['red']).toBe(650);
      const redPercent = (game.baseHp['red'] / 1000) * 100;
      expect(redPercent).toBe(65);

      // Overkill damage clamps cleanly to 0
      game.damageBunker('yellow', 1500);
      expect(game.baseHp['yellow']).toBe(0);
      const yellowPercent = (Math.max(0, game.baseHp['yellow']) / 1000) * 100;
      expect(yellowPercent).toBe(0);
    });

    it('Rounds bunker HP to integer ceiling for readable HUD labels', () => {
      game.damageBunker('blue', 123.45);
      const rounded = Math.ceil(game.baseHp['blue']);
      expect(rounded).toBe(877);
    });
  });

  describe('5.2 2x2x2 Pad Visualizer Grid State Mapping', () => {
    it('Reflects empty status on 0 crates', () => {
      const redPad = game.pads['red'];
      redPad.clear();
      expect(redPad.totalCrates).toBe(0);
      const recipe = redPad.evaluate();
      expect(recipe.title).toBe('Pad Kosong');
      expect(recipe.category).toBe('empty');
      expect(recipe.dps).toBe(0);
      for (let i = 0; i < 8; i++) {
        expect(redPad.slots[i]).toBe(false);
      }
    });

    it('Maps Layer 0 slots (0 to 3) and reflects flat 2x2 Bazooka recipe', () => {
      const redPad = game.pads['red'];
      redPad.clear();
      redPad.setSlot(0, true);
      redPad.setSlot(1, true);
      redPad.setSlot(2, true);
      redPad.setSlot(3, true);

      expect(redPad.totalCrates).toBe(4);
      expect(redPad.isFlat2x2()).toBe(true);

      const recipe = redPad.evaluate();
      expect(recipe.title).toBe('Rocket Bazooka');
      expect(recipe.category).toBe('weapon');
      expect(recipe.itemType).toBe('bazooka');
      expect(recipe.dps).toBe(450);

      // Verify slot booleans for UI elements
      expect(redPad.slots[0]).toBe(true);
      expect(redPad.slots[1]).toBe(true);
      expect(redPad.slots[2]).toBe(true);
      expect(redPad.slots[3]).toBe(true);
      expect(redPad.slots[4]).toBe(false);
      expect(redPad.slots[5]).toBe(false);
      expect(redPad.slots[6]).toBe(false);
      expect(redPad.slots[7]).toBe(false);
    });

    it('Maps Layer 1 top slots and reflects full 8-crate Heavy Battle Tank', () => {
      const redPad = game.pads['red'];
      for (let i = 0; i < 8; i++) {
        redPad.setSlot(i, true);
      }

      expect(redPad.totalCrates).toBe(8);
      const recipe = redPad.evaluate();
      expect(recipe.title).toBe('Heavy Battle Tank');
      expect(recipe.category).toBe('vehicle');
      expect(recipe.itemType).toBe('tank');
      expect(recipe.dps).toBe(980);

      for (let i = 0; i < 8; i++) {
        expect(redPad.slots[i]).toBe(true);
      }
    });

    it('Displays Medic Buddy recipe when 3-crate configuration is placed', () => {
      const redPad = game.pads['red'];
      redPad.clear();
      redPad.setSlot(0, true);
      redPad.setSlot(1, true);
      redPad.setSlot(4, true); // Over slot 0

      expect(redPad.totalCrates).toBe(3);
      const recipe = redPad.evaluate();
      expect(recipe.title).toBe('Medic Buddy');
      expect(recipe.category).toBe('unit');
    });
  });

  describe('5.3 Camera Zoom Mechanics & Handlers', () => {
    it('Increases camera distance on positive wheel delta up to maximum clamp', () => {
      const isoCam = game.getIsoCamera();
      const initialDist = isoCam.getCurrentDistance();
      game.handleWheel(100);
      expect(isoCam.getCurrentDistance()).toBeGreaterThan(initialDist);

      // Zoom far out repeatedly
      for (let i = 0; i < 20; i++) {
        game.handleWheel(300);
      }
      expect(isoCam.getCurrentDistance()).toBeLessThanOrEqual(22.0);
    });

    it('Decreases camera distance on negative wheel delta down to minimum clamp', () => {
      const isoCam = game.getIsoCamera();
      game.handleWheel(-100);
      for (let i = 0; i < 20; i++) {
        game.handleWheel(-300);
      }
      expect(isoCam.getCurrentDistance()).toBeGreaterThanOrEqual(6.0);
    });

    it('Handles mobile pinch zoom ratio changes smoothly', () => {
      const isoCam = game.getIsoCamera();
      const initialDist = isoCam.getCurrentDistance();
      // Pinch in (ratio > 1 zooms in, reducing distance)
      game.handlePinch(1.2);
      expect(isoCam.getCurrentDistance()).toBeLessThan(initialDist);

      // Pinch out (ratio < 1 zooms out, increasing distance)
      const zoomedInDist = isoCam.getCurrentDistance();
      game.handlePinch(0.8);
      expect(isoCam.getCurrentDistance()).toBeGreaterThan(zoomedInDist);
    });
  });

  describe('5.4 Virtual Joystick & Mobile Input Processing', () => {
    it('Converts analog drag vectors within max radius to normalized directional input', () => {
      const maxR = 40;
      const testCases = [
        { dx: 40, dy: 0, expectedX: 1.0, expectedY: 0.0 },
        { dx: 0, dy: -40, expectedX: 0.0, expectedY: -1.0 },
        { dx: -20, dy: 0, expectedX: -0.5, expectedY: 0.0 },
      ];

      for (const tc of testCases) {
        const dist = Math.hypot(tc.dx, tc.dy);
        const clampedR = Math.min(dist, maxR);
        const angle = Math.atan2(tc.dy, tc.dx);
        const kx = Math.cos(angle) * clampedR;
        const ky = Math.sin(angle) * clampedR;

        const vecX = kx / maxR;
        const vecY = ky / maxR;

        expect(vecX).toBeCloseTo(tc.expectedX, 2);
        expect(vecY).toBeCloseTo(tc.expectedY, 2);
      }
    });

    it('Clamps joystick drags extending beyond outer circle boundary', () => {
      const maxR = 40;
      const dx = 100;
      const dy = 0;
      const dist = Math.hypot(dx, dy);
      const clampedR = Math.min(dist, maxR);
      const angle = Math.atan2(dy, dx);
      const kx = Math.cos(angle) * clampedR;
      const ky = Math.sin(angle) * clampedR;

      expect(kx).toBe(40);
      expect(ky).toBe(0);
      expect(kx / maxR).toBe(1.0);
    });

    it('Updates game.joystickVector and translates into player movement velocities', () => {
      game.joystickVector = { x: 0.707, y: -0.707 };
      expect(game.joystickVector.x).toBeCloseTo(0.707, 3);
      expect(game.joystickVector.y).toBeCloseTo(-0.707, 3);

      // Releasing thumb sets vector back to zero
      game.joystickVector = { x: 0, y: 0 };
      expect(game.joystickVector.x).toBe(0);
      expect(game.joystickVector.y).toBe(0);
    });
  });

  describe('5.5 Match End Presentation & Victory Defeat Evaluation', () => {
    it('Detects game over and awards Victory to Red team when all opposing bunkers fall', () => {
      // Destroy opposing bunkers
      game.damageBunker('blue', 1000);
      game.damageBunker('yellow', 1000);
      game.damageBunker('cyan', 1000);

      // Knock out all opposing buddies
      for (const b of game.buddies) {
        if (b.team !== 'red') {
          b.takeDamage(999);
        }
      }

      game.evaluateMatchState();
      expect(game.isGameOver).toBe(true);
      expect(game.winningTeam).toBe('red');

      // HUD modal status
      const isPlayerWin = game.winningTeam === game.player.team;
      expect(isPlayerWin).toBe(true);
    });

    it('Detects Defeat when Red player base bunker is destroyed and Red squad wiped', () => {
      // Destroy Red, Yellow, Cyan bunkers
      game.damageBunker('red', 1000);
      game.damageBunker('yellow', 1000);
      game.damageBunker('cyan', 1000);

      // Knock out Red, Yellow, Cyan buddies
      for (const b of game.buddies) {
        if (b.team !== 'blue') {
          b.takeDamage(999);
        }
      }

      game.evaluateMatchState();
      expect(game.isGameOver).toBe(true);
      expect(game.winningTeam).toBe('blue');

      const isPlayerWin = game.winningTeam === game.player.team;
      expect(isPlayerWin).toBe(false);
    });
  });
});

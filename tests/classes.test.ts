import { describe, it, expect } from 'vitest';
import { BuddyEntity } from '../src/entities/buddy';

describe('Buddy Classes & Combat Mechanics (Normal Flow)', () => {
  it('Fighter class initializes with 130 HP and heavy throw force', () => {
    const fighter = new BuddyEntity('f1', 'red', 'fighter');
    expect(fighter.maxHp).toBe(130);
    expect(fighter.hp).toBe(130);
    expect(fighter.getThrowForce()).toBe(14);
  });

  it('Constructor class has highest mobility when carrying crates', () => {
    const builder = new BuddyEntity('c1', 'blue', 'constructor');
    expect(builder.getEffectiveSpeed()).toBe(8.2);

    builder.isCarryingCrate = true;
    // 8.2 * 0.95 = 7.79
    expect(builder.getEffectiveSpeed()).toBeCloseTo(7.79, 2);
    expect(builder.getThrowForce()).toBe(18); // Longest throw
  });

  it('Healer aura heals nearby wounded teammates proportionally', () => {
    const healer = new BuddyEntity('h1', 'cyan', 'healer', { x: 0, y: 0, z: 0 });
    const woundedMate = new BuddyEntity('w1', 'cyan', 'fighter', { x: 2, y: 0, z: 0 }); // 2m away (within 4.5m)
    woundedMate.takeDamage(50); // HP now 80/130

    // 1 second of aura heal (25 HP/s)
    healer.updateHealerAura([woundedMate], 1.0);
    expect(woundedMate.hp).toBe(105);
  });

  it('Revive mechanism brings knocked buddy back with 40% health', () => {
    const buddy = new BuddyEntity('b1', 'yellow', 'fighter');
    buddy.takeDamage(130); // Knocked
    expect(buddy.isKnocked).toBe(true);
    expect(buddy.hp).toBe(0);

    // Apply 50% revive progress
    expect(buddy.applyRevive(50)).toBe(false);
    expect(buddy.isKnocked).toBe(true);

    // Complete revive
    expect(buddy.applyRevive(50)).toBe(true);
    expect(buddy.isKnocked).toBe(false);
    expect(buddy.hp).toBe(Math.floor(130 * 0.4)); // 52 HP
  });
});

describe('Buddy Classes & Combat Mechanics (Abnormal & Edge-Case Flow)', () => {
  it('clamps health to 0 without going negative on fatal damage', () => {
    const buddy = new BuddyEntity('b2', 'red', 'constructor');
    const dmg = buddy.takeDamage(999);
    expect(dmg).toBe(999);
    expect(buddy.hp).toBe(0);
    expect(buddy.isKnocked).toBe(true);
  });

  it('drops carried crate immediately upon being knocked out', () => {
    const buddy = new BuddyEntity('b3', 'blue', 'constructor');
    buddy.isCarryingCrate = true;
    buddy.takeDamage(100);
    expect(buddy.isKnocked).toBe(true);
    expect(buddy.isCarryingCrate).toBe(false);
  });

  it('ignores negative damage and negative healing inputs', () => {
    const buddy = new BuddyEntity('b4', 'cyan', 'fighter');
    buddy.takeDamage(30); // 100/130
    expect(buddy.takeDamage(-20)).toBe(0);
    expect(buddy.hp).toBe(100);

    expect(buddy.receiveHeal(-15)).toBe(0);
    expect(buddy.hp).toBe(100);
  });

  it('prevents overhealing beyond maximum HP', () => {
    const buddy = new BuddyEntity('b5', 'yellow', 'healer');
    buddy.takeDamage(10); // 90/100
    const healed = buddy.receiveHeal(50);
    expect(healed).toBe(10);
    expect(buddy.hp).toBe(100);
  });

  it('does not allow healer aura to heal enemy teams or knocked teammates', () => {
    const healer = new BuddyEntity('h2', 'red', 'healer', { x: 0, y: 0, z: 0 });
    const enemy = new BuddyEntity('e1', 'blue', 'fighter', { x: 1, y: 0, z: 0 });
    const knockedMate = new BuddyEntity('km', 'red', 'constructor', { x: 1, y: 0, z: 0 });

    enemy.takeDamage(40);
    knockedMate.takeDamage(100); // Knocked

    healer.updateHealerAura([enemy, knockedMate], 1.0);

    expect(enemy.hp).toBe(90); // Not healed
    expect(knockedMate.hp).toBe(0); // Knocked unit cannot receive aura heal
  });

  it('returns effective speed of 0 when knocked down', () => {
    const buddy = new BuddyEntity('b6', 'red', 'fighter');
    buddy.takeDamage(150);
    expect(buddy.getEffectiveSpeed()).toBe(0);
  });

  it('rejects revive on a buddy who is currently healthy/alive', () => {
    const buddy = new BuddyEntity('b7', 'red', 'healer');
    expect(buddy.applyRevive(50)).toBe(false);
    expect(buddy.hp).toBe(buddy.maxHp);
  });
});

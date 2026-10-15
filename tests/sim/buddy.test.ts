import { describe, expect, it } from 'vitest';
import { applyDamage, distance, heal, isOutOfBounds, knockout, revive, speedOf, stepBuddy } from '../../src/sim/domain/buddy';
import { CLASS_STATS } from '../../src/sim/domain/classes';
import { NO_ENTITY, type EntityId } from '../../src/sim/core/ids';
import { makeBuddy } from '../../src/sim/domain/buddy';

const buddy = (cls: 'fighter' | 'healer' | 'constructor') =>
  makeBuddy(1 as EntityId, 'red', cls, 0, 0, false);

describe('class stats', () => {
  it('matches the documented triangle', () => {
    expect(CLASS_STATS.fighter.maxHp).toBe(130);
    expect(CLASS_STATS.healer.maxHp).toBe(100);
    expect(CLASS_STATS.constructor.maxHp).toBe(90);
    expect(CLASS_STATS.constructor.moveSpeed).toBe(8.2);
    expect(CLASS_STATS.healer.healAuraRadius).toBe(4.5);
    expect(CLASS_STATS.healer.healPerSecond).toBe(25);
  });

  it('slows a carrier by its own class factor', () => {
    const f = buddy('fighter');
    expect(speedOf(f)).toBe(6.8);
    f.carryCrate = 42 as EntityId;
    expect(speedOf(f)).toBeCloseTo(6.8 * 0.75, 5);
    const c = buddy('constructor');
    c.carryCrate = 42 as EntityId;
    expect(speedOf(c)).toBeCloseTo(8.2 * 0.95, 5);
  });

  it('keeps the constructor the fastest carrier', () => {
    const speeds = (['fighter', 'healer', 'constructor'] as const).map((cls) => {
      const b = buddy(cls);
      b.carryCrate = 1 as EntityId;
      return speedOf(b);
    });
    expect(speeds.indexOf(Math.max(...speeds))).toBe(2);
  });
});

describe('buddy movement', () => {
  it('moves along the input direction at class speed', () => {
    const b = buddy('fighter');
    stepBuddy(b, { x: 0, y: 1 }, 1 / 30);
    expect(b.z).toBeCloseTo(6.8 / 30, 5);
    expect(b.state).toBe('walk');
  });

  it('faces where it walks', () => {
    const b = buddy('fighter');
    stepBuddy(b, { x: 1, y: 0 }, 1 / 30);
    expect(b.heading).toBeCloseTo(Math.PI / 2, 5);
  });

  it('treats a small stick deflection as standing still', () => {
    const b = buddy('fighter');
    stepBuddy(b, { x: 0.004, y: 0.004 }, 1 / 30);
    expect(b.vx).toBe(0);
    expect(b.state).toBe('idle');
  });

  it('normalises a diagonal so cornering is not a speed boost', () => {
    const straight = buddy('fighter');
    const diagonal = buddy('fighter');
    stepBuddy(straight, { x: 0, y: 1 }, 1 / 30);
    stepBuddy(diagonal, { x: 1, y: 1 }, 1 / 30);
    expect(Math.hypot(diagonal.vx, diagonal.vz)).toBeCloseTo(Math.abs(straight.vz), 5);
  });

  it('never leaves the island through the grass', () => {
    const b = buddy('constructor');
    for (let i = 0; i < 4000; i++) stepBuddy(b, { x: 1, y: 1 }, 1 / 30);
    expect(Math.abs(b.x)).toBeLessThanOrEqual(31);
    expect(isOutOfBounds(b)).toBe(false);
  });

  it('cannot walk while knocked out', () => {
    const b = buddy('fighter');
    knockout(b, 5);
    stepBuddy(b, { x: 1, y: 0 }, 1 / 30);
    expect(b.x).toBe(0);
    expect(b.state).toBe('ko');
  });
});

describe('damage and healing', () => {
  it('ignores non-positive damage', () => {
    const b = buddy('fighter');
    expect(applyDamage(b, -30)).toBe(0);
    expect(applyDamage(b, 0)).toBe(0);
    expect(b.hp).toBe(130);
  });

  it('spends invulnerability before damage lands', () => {
    const b = buddy('fighter');
    b.invuln = 1;
    expect(applyDamage(b, 50)).toBe(0);
    stepBuddy(b, { x: 0, y: 0 }, 1.1);
    expect(applyDamage(b, 50)).toBe(50);
  });

  it('caps damage at remaining health', () => {
    const b = buddy('healer');
    expect(applyDamage(b, 999)).toBe(100);
    expect(b.hp).toBe(0);
  });

  it('refuses overheal', () => {
    const b = buddy('healer');
    applyDamage(b, 10);
    expect(heal(b, 900)).toBe(10);
    expect(b.hp).toBe(100);
  });

  it('revives at 40 percent with brief invulnerability', () => {
    const b = buddy('fighter');
    knockout(b, 5);
    revive(b);
    expect(b.state).toBe('idle');
    expect(b.hp).toBe(52);
    expect(b.invuln).toBeGreaterThan(0);
  });

  it('measures ground distance only', () => {
    expect(distance({ x: 0, z: 0 } as never, { x: 3, z: 4 } as never)).toBe(5);
  });
});

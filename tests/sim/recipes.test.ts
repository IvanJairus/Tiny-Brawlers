import { describe, expect, it } from 'vitest';
import { evaluatePad, RECIPES } from '../../src/sim/domain/recipes';
import { canOccupy, maskOf, totalCrates } from '../../src/sim/domain/pad';

function legalMasks(): number[] {
  const out: number[] = [];
  for (let m = 0; m < 256; m++) {
    let legal = true;
    for (let s = 4; s < 8; s++) {
      if ((m & (1 << s)) && !(m & (1 << (s - 4)))) legal = false;
    }
    if (legal) out.push(m);
  }
  return out;
}

describe('pad recipes', () => {
  const masks = legalMasks();

  it('only considers gravity-legal masks', () => {
    expect(masks.length).toBe(81);
  });

  it('maps every legal mask to exactly one recipe', () => {
    for (const m of masks) {
      const recipe = evaluatePad(m);
      expect(recipe.id).toMatch(/^[a-zA-Z_]+$/);
      expect(recipe.title.length).toBeGreaterThan(0);
    }
  });

  it('reaches all seven build recipes plus the medkit variant', () => {
    const reached = new Set(masks.map((m) => evaluatePad(m).id));
    for (const id of ['pistol', 'shotgun', 'grenade', 'medicUnit', 'medkit', 'bazooka', 'commando', 'tank']) {
      expect(reached.has(id), `mask set never produced ${id}`).toBe(true);
    }
  });

  it('keeps the documented DPS of each recipe', () => {
    expect(evaluatePad(maskOf([0])).dps).toBe(90);
    expect(evaluatePad(maskOf([0, 1])).dps).toBe(220);
    expect(evaluatePad(maskOf([0, 4])).dps).toBe(320);
    expect(evaluatePad(maskOf([0, 1, 4])).dps).toBe(0);
    expect(evaluatePad(maskOf([0, 1, 2, 3])).dps).toBe(450);
    expect(evaluatePad(maskOf([0, 1, 4, 5])).dps).toBe(220);
    expect(evaluatePad(0xff).dps).toBe(980);
  });

  it('reports an empty pad for zero crates', () => {
    expect(evaluatePad(0).id).toBe('empty');
    expect(evaluatePad(0).category).toBe('empty');
  });

  it('falls back to an ammo pack only for shapes that are not a build', () => {
    for (const m of masks) {
      const recipe = evaluatePad(m);
      if (recipe.id !== 'ammo') continue;
      expect(totalCrates(m)).toBeGreaterThan(1);
      expect(recipe.crateCount).toBe(totalCrates(m));
    }
  });

  it('never yields a recipe whose crate count disagrees with the mask', () => {
    for (const m of masks) {
      const recipe = evaluatePad(m);
      if (recipe.category === 'empty' || recipe.id === 'ammo') continue;
      expect(recipe.crateCount, `${recipe.id} from mask ${m.toString(2)}`).toBe(totalCrates(m));
    }
  });

  it('only produces recipes that can actually be built slot by slot', () => {
    for (const m of masks) {
      let mask = 0;
      for (let s = 0; s < 8; s++) {
        if (!(m & (1 << s))) continue;
        expect(canOccupy(mask, s), `slot ${s} unreachable`).toBe(true);
        mask |= 1 << s;
      }
      expect(mask).toBe(m);
    }
  });

  it('keeps recipe metadata consistent with the table', () => {
    for (const recipe of Object.values(RECIPES)) {
      expect(['weapon', 'unit', 'vehicle', 'support', 'empty']).toContain(recipe.category);
    }
  });
});

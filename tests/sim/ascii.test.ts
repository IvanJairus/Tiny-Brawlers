import { describe, expect, it } from 'vitest';
import {
  ASCII_HEADER_LINES,
  ASCII_HEIGHT,
  ASCII_WIDTH,
  asciiFrame
} from '../../src/sim/core/ascii';
import { addBuddy, addCrate, testWorld } from '../helpers';
import { padOrigin } from '../../src/sim/domain/pad';
import { TEAM_IDS } from '../../src/sim/domain/teams';
import { ARENA_HALF } from '../../src/sim/domain/constants';

function cell(frame: string, x: number, z: number): string {
  const rows = frame.split('\n').slice(ASCII_HEADER_LINES, ASCII_HEADER_LINES + ASCII_HEIGHT);
  const col = Math.round(((x + ARENA_HALF) / (ARENA_HALF * 2)) * (ASCII_WIDTH - 1));
  const row = Math.round(((z + ARENA_HALF) / (ARENA_HALF * 2)) * (ASCII_HEIGHT - 1));
  return rows[row][col];
}

describe('ascii world view', () => {
  it('draws a fixed grid with the local player on it', () => {
    const w = testWorld();
    const origin = padOrigin('red');
    const hero = addBuddy(w, 'red', 'fighter', origin.x, origin.z);
    w.localPlayer = hero.id;

    const frame = asciiFrame(w);
    const rows = frame.split('\n');

    expect(rows).toHaveLength(ASCII_HEADER_LINES + ASCII_HEIGHT + 1);
    for (const row of rows.slice(ASCII_HEADER_LINES, ASCII_HEADER_LINES + ASCII_HEIGHT)) {
      expect(row).toHaveLength(ASCII_WIDTH);
    }
    expect(rows[0]).toContain('tick 0');
    expect(cell(frame, hero.x, hero.z)).toBe('@');
  });

  it('shows crates, water and the four bases', () => {
    const w = testWorld();
    const crateId = addCrate(w, 6, -4);
    const frame = asciiFrame(w);
    const crate = w.crates.find((c) => c.id === crateId)!;

    expect(cell(frame, crate.x, crate.z)).toBe('#');
    expect(cell(frame, ARENA_HALF, ARENA_HALF)).toBe('~');
    expect(frame).toContain('R');
    expect(frame).toContain('B');
    expect(frame).toContain('Y');
    expect(frame).toContain('C');
  });

  it('marks a knocked-out buddy and a filled pad', () => {
    const w = testWorld();
    const origin = padOrigin('blue');
    const downed = addBuddy(w, 'blue', 'fighter', origin.x + 3, origin.z);
    downed.state = 'ko';
    w.pads.blue = 0b00000001;

    const frame = asciiFrame(w);
    expect(cell(frame, downed.x, downed.z)).toBe('x');
    expect(cell(frame, origin.x, origin.z)).toBe('O');
  });

  it('keeps every line inside the grid width at the busiest state', () => {
    const w = testWorld();
    for (const team of TEAM_IDS) {
      const origin = padOrigin(team);
      addBuddy(w, team, 'fighter', origin.x + 1, origin.z + 1);
      w.pads[team] = 0b11111111;
      w.bunkerHp[team] = 9999;
    }
    addCrate(w, 6, -4);
    w.tick = 99999999;
    w.clock = 99999.9;

    for (const line of asciiFrame(w).split('\n')) {
      expect(line.length).toBeLessThanOrEqual(ASCII_WIDTH);
    }
  });
});

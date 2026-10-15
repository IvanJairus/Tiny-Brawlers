import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const DOC = readFileSync(resolve(ROOT, 'docs/PARITY.md'), 'utf8');

type Row = { n: number; feature: string; claim: string; cites: string[]; milestone: string; status: string };

const rows: Row[] = DOC.split('\n')
  .filter((line) => /^\|\s*\d+\s*\|/.test(line))
  .map((line) => {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    return {
      n: Number(cells[0]),
      feature: cells[1],
      claim: cells[2],
      cites: cells[3].split(',').map((path) => path.trim()).filter(Boolean),
      milestone: cells[4],
      status: cells[5]
    };
  });

describe('parity ledger', () => {
  const partialFrom = DOC.indexOf('## Masih sebagian');
  const partial = partialFrom < 0 ? '' : DOC.slice(partialFrom);

  it('reads a full table with a status on every row', () => {
    expect(rows.length).toBeGreaterThanOrEqual(100);
    for (const row of rows) expect(row.status, `row ${row.n} has no status`).not.toBe('');
  });

  it('affirms rows, or admits them as partial with a written reason', () => {
    for (const row of rows) {
      expect(['A', 'P'], `row ${row.n} status`).toContain(row.status);
      if (row.status === 'P') {
        expect(partial, `row ${row.n} is partial but no reason is written down`).toContain(row.feature);
      }
    }
  });

  it('numbers each row once', () => {
    expect(new Set(rows.map((row) => row.n)).size).toBe(rows.length);
  });

  it('states a behaviour worth testing for every feature', () => {
    for (const row of rows) {
      expect(row.claim.length, `row ${row.n} has no expected behaviour`).toBeGreaterThan(9);
      expect(row.milestone, `row ${row.n}`).toMatch(/^M[0-7]$/);
    }
  });

  it('cites files that exist, with at least one real test among them', () => {
    for (const row of rows) {
      expect(row.cites.length, `row ${row.n} cites nothing`).toBeGreaterThan(0);
      for (const path of row.cites) {
        expect(existsSync(resolve(ROOT, path)), `row ${row.n} cites missing ${path}`).toBe(true);
      }
      const testFiles = row.cites.filter((path) => /\.(test|spec)\.ts$/.test(path));
      expect(testFiles.length, `row ${row.n} cites no test file`).toBeGreaterThan(0);
      for (const path of testFiles) {
        const body = readFileSync(resolve(ROOT, path), 'utf8');
        expect(/\b(it|test)\(/.test(body), `row ${row.n} cites ${path}, which holds no test`).toBe(true);
      }
    }
  });

  it('covers every milestone', () => {
    const seen = new Set(rows.map((row) => row.milestone));
    for (const milestone of ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7']) {
      expect(seen.has(milestone), `${milestone} has no parity row`).toBe(true);
    }
  });
});

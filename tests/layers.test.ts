import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), 'src');

function filesIn(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesIn(full));
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const FORBIDDEN_IN_SIM: Array<[RegExp, string]> = [
  [/from ['"]three['"]/, 'imports three'],
  [/\bdocument\./, 'touches the DOM'],
  [/\bwindow\./, 'touches the global window'],
  [/\brequestAnimationFrame\b/, 'owns a frame loop'],
  [/\bgetElementById\b/, 'queries the DOM'],
  [/\bDate\.now\b/, 'reads wall clock'],
  [/\bMath\.random\b/, 'uses non-replayable randomness'],
  [/\bperformance\./, 'reads the host clock']
];

describe('layer rule: sim is pure', () => {
  const simFiles = filesIn(join(ROOT, 'sim'));

  it('has sim files to check', () => {
    expect(simFiles.length).toBeGreaterThan(4);
  });

  for (const file of simFiles) {
    it(`${relative(ROOT, file)} stays free of host APIs`, () => {
      const source = codeOnly(readFileSync(file, 'utf8'));
      for (const [pattern, reason] of FORBIDDEN_IN_SIM) {
        expect(source, `${relative(ROOT, file)} ${reason}`).not.toMatch(pattern);
      }
    });
  }
});

describe('layer rule: one frame loop', () => {
  it('keeps requestAnimationFrame inside boot', () => {
    const offenders = filesIn(ROOT)
      .filter((f) => !f.endsWith('boot.ts'))
      .filter((f) => codeOnly(readFileSync(f, 'utf8')).includes('requestAnimationFrame'))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });
});

describe('layer rule: render and ui do not leak into sim', () => {
  it('keeps sim imports inside sim', () => {
    const offenders: string[] = [];
    for (const file of filesIn(join(ROOT, 'sim'))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/from ['"]([^'"]+)['"]/g)) {
        const spec = match[1];
        if (spec.startsWith('.') && !spec.includes('/sim/')) {
          const target = join(file, '..', spec);
          if (relative(join(ROOT, 'sim'), target).startsWith('..')) {
            offenders.push(`${relative(ROOT, file)} -> ${spec}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

export const BUDGET = {
  drawCalls: 60,
  materials: 12,
  geometries: 30,
  triangles: 45000,
  glPrograms: 12,
  particles: 512,
  crates: 40,
  rocks: 60,
  projectiles: 48,
  buddies: 24,
  tanks: 4
};

export interface RenderCounters {
  calls: number;
  triangles: number;
  programs: number;
  geometries: number;
  materials: number;
}

export function overBudget(counters: RenderCounters): string[] {
  const problems: string[] = [];
  if (counters.calls > BUDGET.drawCalls) problems.push(`draw calls ${counters.calls} > ${BUDGET.drawCalls}`);
  if (counters.materials > BUDGET.materials) problems.push(`materials ${counters.materials} > ${BUDGET.materials}`);
  if (counters.geometries > BUDGET.geometries) problems.push(`geometries ${counters.geometries} > ${BUDGET.geometries}`);
  if (counters.triangles > BUDGET.triangles) problems.push(`triangles ${counters.triangles} > ${BUDGET.triangles}`);
  if (counters.programs > BUDGET.glPrograms) problems.push(`gl programs ${counters.programs} > ${BUDGET.glPrograms}`);
  return problems;
}

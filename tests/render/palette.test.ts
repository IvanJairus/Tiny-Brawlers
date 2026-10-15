import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildArena } from '../../src/render/arena';
import { createMaterials } from '../../src/render/materials';
import { TEAM_COLORS, TEAM_IDS } from '../../src/sim/domain/teams';

describe('team palette', () => {
  it('names team colours the way they look', () => {
    expect(TEAM_COLORS.blue.css).toMatch(/^#2f/);
    expect(TEAM_COLORS.cyan.css).toMatch(/^#00c/);
    expect(TEAM_COLORS.blue.label).toBe('Biru');
    expect(TEAM_COLORS.yellow.label).toBe('Kuning');
    expect(TEAM_COLORS.cyan.label).toBe('Sian');
    expect(TEAM_COLORS.red.label).toBe('Merah');
    expect(new Set(TEAM_IDS.map((team) => TEAM_COLORS[team].css)).size).toBe(TEAM_IDS.length);
  });

  it('paints teams into vertex colours instead of textures', () => {
    const materials = createMaterials();
    const arena = buildArena(materials);
    const staticMesh = arena.group.getObjectByName('arena_static') as THREE.Mesh;

    expect(staticMesh.geometry.attributes.color).toBeTypeOf('object');
    expect((materials.painted as THREE.MeshLambertMaterial).vertexColors).toBe(true);
    expect((materials.painted as THREE.MeshLambertMaterial).map).toBeNull();
  });
});

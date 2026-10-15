import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildArena } from '../../src/render/arena';
import { createMaterials } from '../../src/render/materials';

function waterMesh(group: THREE.Object3D): THREE.Mesh {
  const found = group.getObjectByName('arena_water');
  if (!found || !(found as THREE.Mesh).isMesh) throw new Error('arena has no arena_water mesh');
  return found as THREE.Mesh;
}

describe('water surface', () => {
  it('animates on the GPU through a time uniform', () => {
    const materials = createMaterials();
    const arena = buildArena(materials);
    const water = waterMesh(arena.group);
    const material = water.material as THREE.ShaderMaterial;

    expect(material.isShaderMaterial).toBe(true);
    expect(material.vertexShader).toContain('uTime');
    expect(material.vertexShader).toContain('gl_Position');
    expect(material.fragmentShader).not.toContain('uTime');

    const position = (water.geometry as THREE.PlaneGeometry).attributes.position;
    const before = Float32Array.from(position.array as Float32Array);
    arena.update(4.2);
    expect(position.array).toEqual(before);
    expect(material.uniforms.uTime.value).toBe(4.2);
  });

  it('gives the shader enough vertices to bend', () => {
    const materials = createMaterials();
    const arena = buildArena(materials);
    const water = waterMesh(arena.group) as THREE.Mesh<THREE.PlaneGeometry>;

    expect(water.geometry.parameters.widthSegments).toBeGreaterThanOrEqual(24);
    expect(water.geometry.parameters.heightSegments).toBeGreaterThanOrEqual(24);
  });
});

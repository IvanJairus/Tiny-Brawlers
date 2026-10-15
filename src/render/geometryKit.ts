import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Part {
  geometry: THREE.BufferGeometry;
  color: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

/**
 * Colour rides in a vertex attribute so a whole character, or the entire arena,
 * can be drawn by one material. The previous build spent 62 materials on a
 * four-buddy scene, and every one of them was another draw call.
 */
export function tinted(part: Part): THREE.BufferGeometry {
  const geo = part.geometry.clone();
  if (part.scale) geo.scale(...part.scale);
  if (part.rotation) {
    geo.rotateX(part.rotation[0]);
    geo.rotateY(part.rotation[1]);
    geo.rotateZ(part.rotation[2]);
  }
  if (part.position) geo.translate(...part.position);

  const count = geo.attributes.position.count;
  if (!geo.attributes.color) {
    const colors = new Float32Array(count * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  const attr = geo.attributes.color as THREE.BufferAttribute;
  const c = new THREE.Color(part.color);
  for (let i = 0; i < count; i++) attr.setXYZ(i, c.r, c.g, c.b);
  attr.needsUpdate = true;
  geo.deleteAttribute('uv');
  geo.deleteAttribute('uv1');
  geo.deleteAttribute('normal');
  geo.computeVertexNormals();
  return geo;
}

export function mergeParts(parts: Part[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map(tinted), false);
  if (!merged) throw new Error('mergeGeometries returned null: check attribute sets');
  merged.computeBoundingSphere();
  return merged;
}

export function unitSphere(radius: number, segments = 12): THREE.SphereGeometry {
  return new THREE.SphereGeometry(radius, segments, Math.max(6, segments - 2));
}

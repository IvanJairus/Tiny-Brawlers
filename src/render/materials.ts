import * as THREE from 'three';

export interface SharedMaterials {
  painted: THREE.MeshLambertMaterial;
  padGlow: THREE.MeshBasicMaterial;
  shadow: THREE.MeshBasicMaterial;
  particle: THREE.PointsMaterial;
  water: THREE.ShaderMaterial;
}

export const PALETTE = {
  skin: 0xffd9b3,
  blush: 0xff9aa2,
  eyeWhite: 0xffffff,
  eyeDark: 0x1b2735,
  helmet: 0x4b5d3a,
  helmetRim: 0x3a4a2c,
  star: 0xffc21a,
  boot: 0x2c3540,
  wood: 0xb57a38,
  woodDark: 0x8c5826,
  metal: 0x2c3e50,
  grass: 0x4cd137,
  grassDark: 0x3faa2f,
  cliff: 0x8d6e63,
  rock: 0x718093,
  path: 0xc9b27a,
  concrete: 0x9aa5b1,
  sand: 0xd2b48c,
  padSurface: 0x253346
};

/**
 * One painted material serves the arena, the buddies, the crates and the
 * projectiles: colour is baked into vertices, so variety costs no extra draw
 * calls. Only the four surfaces that genuinely behave differently are separate.
 */
export function createMaterials(): SharedMaterials {
  return {
    painted: new THREE.MeshLambertMaterial({ vertexColors: true }),
    padGlow: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }),
    shadow: new THREE.MeshBasicMaterial({ color: 0x0d1b12, transparent: true, opacity: 0.26 }),
    particle: new THREE.PointsMaterial({
      size: 0.24, vertexColors: true, transparent: true, opacity: 0.95, sizeAttenuation: true
    }),
    water: createWaterMaterial()
  };
}

export function createWaterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(0x4fd0ff) },
      uDeep: { value: new THREE.Color(0x1177cc) },
      uFoam: { value: new THREE.Color(0xffffff) }
    },
    vertexShader: `
      uniform float uTime;
      varying float uWave;
      void main() {
        vec3 p = position;
        float w = sin(p.x * 0.35 + uTime * 1.4) * 0.5 + cos(p.y * 0.28 - uTime * 1.1) * 0.5;
        p.z += w * 0.32;
        uWave = w;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform vec3 uFoam;
      varying float uWave;
      void main() {
        float t = clamp(uWave * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(uDeep, uShallow, t);
        col = mix(col, uFoam, smoothstep(0.86, 1.0, t));
        gl_FragColor = vec4(col, 0.82);
      }
    `
  });
}

import * as THREE from 'three';

export interface SharedMaterials {
  painted: THREE.MeshLambertMaterial;
  padGlow: THREE.MeshBasicMaterial;
  shadow: THREE.MeshBasicMaterial;
  particle: THREE.PointsMaterial;
  water: THREE.ShaderMaterial;
  hitFlash: THREE.MeshBasicMaterial;
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
  concreteDark: 0x76818d,
  sand: 0xd2b48c,
  padSurface: 0x253346,
  padTile: 0x35516b,
  pathDark: 0xa8925f
};

/**
 * One painted material serves the arena, the buddies, the crates and the
 * projectiles: colour is baked into vertices, so variety costs no extra draw
 * calls. Only the surfaces that genuinely behave differently are separate.
 */
export function createMaterials(): SharedMaterials {
  return {
    painted: new THREE.MeshLambertMaterial({ vertexColors: true }),
    padGlow: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }),
    shadow: new THREE.MeshBasicMaterial({ color: 0x0d1b12, transparent: true, opacity: 0.26 }),
    particle: new THREE.PointsMaterial({
      size: 0.24, vertexColors: true, transparent: true, opacity: 0.95, sizeAttenuation: true
    }),
    water: createWaterMaterial(),
    hitFlash: new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false
    })
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
      uFoam: { value: new THREE.Color(0xdff2ff) }
    },
    vertexShader: `
      uniform float uTime;
      varying float uWave;
      varying vec2 uPlane;
      void main() {
        vec3 p = position;
        // Wavelength stays wide compared to the 5m grid this plane is cut from.
        // Shorter waves alias into pale blobs that read as clouds, not water.
        float w = sin(p.x * 0.16 + uTime * 0.9) * 0.5 + cos(p.y * 0.13 - uTime * 0.7) * 0.5;
        p.z += w * 0.22;
        uWave = w;
        uPlane = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform vec3 uFoam;
      varying float uWave;
      varying vec2 uPlane;
      void main() {
        float t = clamp(uWave * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(uDeep, uShallow, t);
        float surf = smoothstep(35.0, 39.0, length(uPlane)) * (1.0 - smoothstep(43.0, 49.0, length(uPlane)));
        col = mix(col, uFoam, surf * 0.9);
        gl_FragColor = vec4(col, 0.84);
      }
    `
  });
}

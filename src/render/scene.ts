import * as THREE from 'three';

export const SKY_COLOR = 0x8fd3ff;
export const FOG_NEAR = 45;
export const FOG_FAR = 110;

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  resize(): void;
  setRenderScale(scale: number): void;
  renderScale(): number;
  draw(camera: THREE.Camera): void;
  dispose(): void;
  info(): { calls: number; triangles: number; programs: number };
}

export function createStage(container: HTMLElement, coarsePointer: boolean): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: !coarsePointer, powerPreference: 'high-performance' });
  const baseRatio = Math.min(window.devicePixelRatio, coarsePointer ? 1.5 : 2);
  let scale = 1;
  renderer.setPixelRatio(baseRatio);
  renderer.shadowMap.enabled = false;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.Fog(SKY_COLOR, FOG_NEAR, FOG_FAR);

  const hemi = new THREE.HemisphereLight(0xfff7ed, 0x33502c, 1.35);
  const sun = new THREE.DirectionalLight(0xffeecd, 1.5);
  sun.position.set(18, 34, 12);
  scene.add(hemi, sun);

  const resize = (): void => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
  };

  return {
    renderer,
    scene,
    resize,
    renderScale: () => scale,
    setRenderScale(value: number) {
      const next = Math.max(0.6, Math.min(1, value));
      if (next === scale) return;
      scale = next;
      renderer.setPixelRatio(baseRatio * scale);
      resize();
    },
    draw: (camera: THREE.Camera) => renderer.render(scene, camera),
    dispose() {
      renderer.dispose();
      renderer.domElement.remove();
    },
    info() {
      return {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        programs: renderer.info.programs?.length ?? 0
      };
    }
  };
}

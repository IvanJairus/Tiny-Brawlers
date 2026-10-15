import { createStage, type Stage } from './render/scene';
import { IsoCamera } from './render/camera';
import { WorldRenderer } from './render/bridge';
import { createStepper } from './sim/core/tick';
import { createWorld, hashWorld } from './sim/core/world';
import { drainEvents } from './sim/core/events';
import { stepWorld } from './sim/core/step';
import { initialSquads } from './sim/domain/match';
import { encodeInput } from './sim/input/actions';
import { TICK_S } from './sim/domain/constants';
import { createKeyboard } from './platform/input/keyboard';
import type { World } from './sim/core/world';
import { overBudget } from './render/budget';
import * as THREE from 'three';

export interface DebugHandle {
  world: World;
  stage: Stage;
  fps(): number;
  budgetProblems(): string[];
  hash(): number;
}

declare global {
  interface Window {
    __tb?: DebugHandle;
  }
}

export function boot(container: HTMLElement): () => void {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = createStage(container, coarse);
  const renderer = new WorldRenderer(stage.scene);
  const camera = new IsoCamera(1, { reducedMotion });

  const seed = Number(new URLSearchParams(window.location.search).get('seed') ?? 20261015) >>> 0;
  const world = createWorld({ seed });
  initialSquads(world, 2);
  const hero = world.buddies.find((b) => b.team === 'red');
  if (hero) {
    hero.isBot = false;
    hero.ownedByPlayer = true;
    world.localPlayer = hero.id;
  }

  const keyboard = createKeyboard();
  keyboard.attach();

  const sceneCounters = () => {
    const geometries = new Set<string>();
    const materials = new Set<string>();
    stage.scene.traverse((object) => {
      const drawable = object as Partial<THREE.Mesh> & Partial<THREE.Points>;
      if (!drawable.isMesh && !drawable.isPoints) return;
      if (drawable.geometry) geometries.add(drawable.geometry.uuid);
      const material = drawable.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) for (const m of material) materials.add(m.uuid);
      else if (material) materials.add(material.uuid);
    });
    return { ...stage.info(), geometries: geometries.size, materials: materials.size };
  };

  let steps = 0;
  const stepper = createStepper((dt) => {
    const axes = keyboard.read();
    if (hero) world.inputs.set(hero.id, encodeInput(world.seq + steps, axes));
    stepWorld(world, dt);
    steps++;
  });

  stage.resize();
  camera.updateAspect(container.clientWidth / Math.max(1, container.clientHeight));
  const onResize = (): void => {
    stage.resize();
    camera.updateAspect(container.clientWidth / Math.max(1, container.clientHeight));
  };
  window.addEventListener('resize', onResize);

  let last = 0;
  let frames = 0;
  let windowStart = 0;
  let fps = 60;
  let running = true;

  const frame = (now: number): void => {
    if (!running) return;
    const elapsed = last === 0 ? TICK_S * 1000 : now - last;
    last = now;
    const taken = stepper.push(elapsed);
    if (taken > 0) {
      keyboard.nudgeZoom(keyboard.read().zoom);
      renderer.consume(drainEvents(world.events));
    }

    const focus = renderer.focusOn(world);
    if (focus) camera.follow(focus.x, focus.z, Math.min(0.1, elapsed / 1000));
    camera.setZoom(keyboard.zoom());
    renderer.sync(world, stepper.alpha(), now / 1000, Math.min(0.1, elapsed / 1000));
    stage.draw(camera.camera);

    frames++;
    if (now - windowStart >= 500) {
      fps = (frames * 1000) / Math.max(1, now - windowStart);
      windowStart = now;
      frames = 0;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  if (import.meta.env.DEV) {
    window.__tb = {
      world,
      stage,
      fps: () => fps,
      budgetProblems: () => overBudget(sceneCounters()),
      hash: () => hashWorld(world)
    };
  }

  return () => {
    running = false;
    keyboard.detach();
    window.removeEventListener('resize', onResize);
    renderer.dispose();
    stage.dispose();
  };
}

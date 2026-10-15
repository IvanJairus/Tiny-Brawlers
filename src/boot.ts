import * as THREE from 'three';
import { createStage, type Stage } from './render/scene';
import { IsoCamera } from './render/camera';
import { WorldRenderer } from './render/bridge';
import { createStepper } from './sim/core/tick';
import { createWorld, hashWorld, type World } from './sim/core/world';
import { drainEvents } from './sim/core/events';
import { stepWorld } from './sim/core/step';
import { initialSquads } from './sim/domain/match';
import { encodeInput, type RawAxes } from './sim/input/actions';
import { TICK_S } from './sim/domain/constants';
import { createKeyboard } from './platform/input/keyboard';
import { createTouch } from './platform/input/touch';
import { createMachine, isTicking } from './ui/shell/machine';
import { createRouter } from './ui/shell/router';
import { buildHud } from './ui/hud/bind';
import { createHudStore } from './ui/hud/store';
import { projectView, type ViewState } from './sim/core/view';
import { loadSettings, saveSettings } from './platform/storage';
import type { BuddyClass } from './sim/domain/classes';
import { overBudget } from './render/budget';

export interface DebugHandle {
  world: World;
  stage: Stage;
  screen(): string;
  fps(): number;
  budgetProblems(): string[];
  hash(): number;
  view(): ViewState | null;
}

declare global {
  interface Window {
    __tb?: DebugHandle;
  }
}

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function boot(container: HTMLElement, uiHost: HTMLElement): () => void {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const settings = loadSettings();
  const reducedMotion = settings.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const stage = createStage(container, coarse || settings.quality === 'low');
  const renderer = new WorldRenderer(stage.scene);
  const camera = new IsoCamera(1, { reducedMotion });
  const machine = createMachine(webglAvailable() ? 'title' : 'unsupported');
  const store = createHudStore();
  const hud = buildHud(document);
  const keyboard = createKeyboard();
  const touch = createTouch();
  const stats = { built: 0, knockouts: 0, cratesDelivered: 0 };
  const touchPressed = { grab: false, shoot: false, build: false };

  const fixedSeed = Number(new URLSearchParams(window.location.search).get('seed') ?? NaN);

  function createMatch(cls: BuddyClass): World {
    const seed = Number.isFinite(fixedSeed)
      ? fixedSeed >>> 0
      : (Math.floor(Math.random() * 0xffffffff) ^ 0x9e3779b9) >>> 0;
    const next = createWorld({ seed });
    initialSquads(next, 2);
    const hero = next.buddies.find((b) => b.team === 'red');
    if (hero) {
      hero.cls = cls;
      hero.isBot = false;
      hero.ownedByPlayer = true;
      next.localPlayer = hero.id;
    }
    stats.built = 0;
    stats.knockouts = 0;
    stats.cratesDelivered = 0;
    return next;
  }

  let world = createMatch(settings.startClass);
  let view = projectView(world, stats);
  store.set(view);

  const router = createRouter(uiHost, {
    send: (event) => machine.send(event),
    startWith: (cls) => {
      settings.startClass = cls;
      saveSettings(settings);
      world = createMatch(cls);
      view = projectView(world, stats);
      if (machine.can('confirmed')) machine.send('confirmed');
      if (machine.can('loaded')) machine.send('loaded');
    },
    settings,
    setSetting: (key, value) => {
      if (key === 'quality') settings.quality = value === 'low' ? 'low' : 'high';
      else settings[key] = Boolean(value);
      saveSettings(settings);
    }
  });

  hud.onAction('grab', () => { touchPressed.grab = true; });
  hud.onAction('shoot', () => { touchPressed.shoot = true; });
  hud.onAction('build', () => { touchPressed.build = true; });
  hud.onAction('pause', () => { if (machine.can('pause')) machine.send('pause'); });
  hud.onAction('restart', () => { if (machine.can('again')) machine.send('again'); });

  const onPointerUp = (): void => {
    touchPressed.grab = false;
    touchPressed.shoot = false;
    touchPressed.build = false;
  };
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    if (machine.screen === 'playing' && machine.can('pause')) machine.send('pause');
    else if (machine.screen === 'paused' && machine.can('resume')) machine.send('resume');
  };
  window.addEventListener('keydown', onKey);

  hud.root.classList.toggle('is-coarse', coarse);
  uiHost.prepend(hud.root);
  touch.attach(hud.root);
  keyboard.attach();

  const unsubMachine = machine.onChange((screen) => {
    router.show(screen, view);
    hud.setVisible(screen === 'playing');
    if (screen === 'playing') stage.resize();
  });
  router.show(machine.screen, view);
  hud.setVisible(false);

  let steps = 0;
  const stepper = createStepper((dt) => {
    world.inputs.set(world.localPlayer, encodeInput((world.seq + steps) % 256, mergeAxes()));
    stepWorld(world, dt);
    steps++;
    if (world.over && machine.screen === 'playing' && machine.can('finished')) machine.send('finished');
  });

  function mergeAxes(): RawAxes {
    const fromKey = keyboard.read();
    const fromTouch = touch.read();
    const moveX = Math.abs(fromTouch.moveX) > Math.abs(fromKey.moveX) ? fromTouch.moveX : fromKey.moveX;
    const moveY = Math.abs(fromTouch.moveY) > Math.abs(fromKey.moveY) ? fromTouch.moveY : fromKey.moveY;
    return {
      moveX,
      moveY,
      aimX: moveX,
      aimY: moveY,
      attack: fromKey.attack || touchPressed.shoot,
      grab: fromKey.grab || touchPressed.grab,
      build: fromKey.build || touchPressed.build,
      zoom: 0
    };
  }

  const onWheel = (event: WheelEvent): void => {
    camera.nudgeZoom(event.deltaY > 0 ? 0.12 : -0.12);
  };
  window.addEventListener('wheel', onWheel, { passive: true });

  stage.resize();
  camera.updateAspect(container.clientWidth / Math.max(1, container.clientHeight));
  const onResize = (): void => {
    stage.resize();
    camera.updateAspect(container.clientWidth / Math.max(1, container.clientHeight));
  };
  window.addEventListener('resize', onResize);

  let last = 0;
  let hudAccumulator = 0;
  let frames = 0;
  let fpsWindow = 0;
  let fps = 60;
  let running = true;

  const frame = (now: number): void => {
    if (!running) return;
    const elapsed = last === 0 ? TICK_S * 1000 : Math.min(250, now - last);
    last = now;

    if (isTicking(machine.screen)) stepper.push(elapsed);
    else stepper.reset();

    const focus = renderer.focusOn(world);
    if (focus) camera.follow(focus.x, focus.z, Math.min(0.1, elapsed / 1000));

    renderer.sync(world, stepper.alpha(), now / 1000, Math.min(0.1, elapsed / 1000));
    renderer.consume(drainEvents(world.events));
    stage.draw(camera.camera);

    hudAccumulator += elapsed;
    if (hudAccumulator >= 1000 / 15) {
      hudAccumulator = 0;
      view = projectView(world, stats);
      store.set(view);
      hud.update(view);
    }

    frames++;
    if (now - fpsWindow >= 500) {
      fps = (frames * 1000) / Math.max(1, now - fpsWindow);
      fpsWindow = now;
      frames = 0;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

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

  if (import.meta.env.DEV) {
    window.__tb = {
      world,
      stage,
      screen: () => machine.screen,
      fps: () => fps,
      budgetProblems: () => overBudget(sceneCounters()),
      hash: () => hashWorld(world),
      view: () => view
    };
  }

  return () => {
    running = false;
    unsubMachine();
    keyboard.detach();
    touch.detach();
    hud.dispose();
    router.dispose();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    renderer.dispose();
    stage.dispose();
  };
}

import * as THREE from 'three';
import { createStage, type Stage } from './render/scene';
import { IsoCamera } from './render/camera';
import { WorldRenderer } from './render/bridge';
import { createStepper } from './sim/core/tick';
import { hashWorld, type World } from './sim/core/world';
import { drainEvents } from './sim/core/events';
import { encodeInput, type RawAxes } from './sim/input/actions';
import { createSoloSession, createHostSession, createClientSession, type Session } from './sim/net/session';
import { openHostRoom, joinRoom, type NetLink } from './platform/net';
import { detectCapabilities } from './platform/browsercheck';
import { createGameAudio } from './platform/audio';
import { createMeter, type Meter } from './platform/meter';
import type { SimEvent } from './sim/core/events';
import type { LobbyActions } from './ui/shell/lobby';
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
import { T } from './ui/i18n/id';
import { createAdaptation } from './render/adaptation';
import { SFX } from './platform/audio/patches';

const T_LOBBY_WAITING = 'Menunggu pemain lain';

export interface DebugHandle {
  world: World;
  stage: Stage;
  screen(): string;
  fps(): number;
  budgetProblems(): string[];
  netInfo(): { kind: string; code: string | null; peers: number; links: unknown; scale?: number };
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
  const adaptation = createAdaptation();
  const machine = createMachine(webglAvailable() ? 'title' : 'unsupported');
  const store = createHudStore();
  const hud = buildHud(document);
  const keyboard = createKeyboard();
  const touch = createTouch();
  const stats = { built: 0, knockouts: 0, cratesDelivered: 0 };
  const audio = createGameAudio();
  const meter: Meter | null = new URLSearchParams(window.location.search).get('meter') === '1' ? createMeter() : null;
  if (meter) document.body.appendChild(meter.element);
  audio.setEnabled(settings.sound);
  audio.setMusic(settings.music);
  const touchPressed = { grab: false, shoot: false, build: false };

  const fixedSeed = Number(new URLSearchParams(window.location.search).get('seed') ?? NaN);

  function createMatch(cls: BuddyClass): World {
    const seed = Number.isFinite(fixedSeed)
      ? fixedSeed >>> 0
      : (Math.floor(Math.random() * 0xffffffff) ^ 0x9e3779b9) >>> 0;
    netLink?.close();
    netLink = null;
    session = createSoloSession(seed, cls);
    stats.built = 0;
    stats.knockouts = 0;
    stats.cratesDelivered = 0;
    return session.world;
  }

  let session: Session = createSoloSession(1, settings.startClass);
  let netLink: NetLink | null = null;
  let world = session.world;
  let view = projectView(world, stats);
  store.set(view);

  const lobbyActions: LobbyActions = {
    host() {
      try {
        netLink = openHostRoom();
      } catch {
        router.lobby()?.setPhase('WebRTC tidak tersedia');
        return;
      }
      session = createHostSession(createSoloSession(Number.isFinite(fixedSeed) ? fixedSeed >>> 0 : 4242, settings.startClass).world, netLink.transport, {
        roomCode: netLink.code, cls: settings.startClass, name: 'Tuan Rumah', now: () => performance.now()
      });
      world = session.world;
      router.lobby()?.setCode(netLink.code);
      router.lobby()?.setPhase(T_LOBBY_WAITING);
      refreshRoster();
    },
    join(code: string) {
      try {
        netLink = joinRoom(code);
      } catch {
        router.lobby()?.setPhase('WebRTC tidak tersedia');
        return;
      }
      session = createClientSession(netLink.transport, {
        roomCode: netLink.code, cls: settings.startClass, name: 'Tamu',
        hostPeerId: netLink.hostPeerId, now: () => performance.now()
      });
      world = session.world;
      router.lobby()?.setCode(netLink.code);
      router.lobby()?.setPhase(T_LOBBY_WAITING);
    },
    start() {
      session.start();
      if (machine.can('loaded')) machine.send('loaded');
    },
    leave() {
      netLink?.close();
      netLink = null;
      session = createSoloSession(1, settings.startClass);
      world = session.world;
    }
  };

  function refreshRoster(): void {
    if (session.kind !== 'host') return;
    router.lobby()?.setRoster(session.roster());
  }

  renderer.attachCamera(camera);

  const router = createRouter(uiHost, {
    send: (event) => machine.send(event),
    startWith: (cls) => {
      audio.beginPlayback();
      settings.startClass = cls;
      saveSettings(settings);
      world = createMatch(cls);
      view = projectView(world, stats);
      if (machine.can('confirmed')) machine.send('confirmed');
      if (machine.can('loaded')) machine.send('loaded');
      refreshRoster();
    },
    canPause: () => session.kind === 'solo',
    netplay: detectCapabilities().webrtc,
    lobby: lobbyActions,
    settings,
    setSetting: (key, value) => {
      if (key === 'quality') settings.quality = value === 'low' ? 'low' : 'high';
      else settings[key] = Boolean(value);
      if (key === 'sound') audio.setEnabled(Boolean(value));
      if (key === 'music') audio.setMusic(Boolean(value));
      saveSettings(settings);
    }
  });

  hud.onAction('grab', () => { touchPressed.grab = true; });
  hud.onAction('shoot', () => { touchPressed.shoot = true; });
  hud.onAction('build', () => { touchPressed.build = true; });
  hud.onAction('pause', () => { if (session.kind === 'solo' && machine.can('pause')) machine.send('pause'); });
  hud.onAction('restart', () => { if (machine.can('again')) machine.send('again'); });

  const onPointerUp = (): void => {
    touchPressed.grab = false;
    touchPressed.shoot = false;
    touchPressed.build = false;
  };
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  hud.root.classList.toggle('is-coarse', coarse);
  uiHost.prepend(hud.root);
  touch.attach(hud.root);
  keyboard.attach();

  const unsubMachine = machine.onChange((screen) => {
    router.show(screen, view);
    if (screen === 'lobby') refreshRoster();
    hud.setVisible(screen === 'playing');
    if (screen === 'playing') stage.resize();
    if (screen === 'results') {
      audio.bgm.stop();
      if (view.winner === view.team) audio.graph.play(SFX.victory);
      else audio.graph.play(SFX.defeat);
    }
    if (screen === 'paused') audio.bgm.stop();
    if (screen === 'playing') audio.beginPlayback();
  });
  router.show(machine.screen, view);
  hud.setVisible(false);

  let lastNetError: string | null = null;
  let steps = 0;
  const stepper = createStepper((dt) => {
    session.step(dt, mergeAxes());
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

    if (machine.screen === 'lobby') {
      const problem = session.error();
      if (problem && problem !== lastNetError) {
        lastNetError = problem;
        router.lobby()?.setPhase(
          problem === 'full' ? T.netFull
            : problem === 'code' ? T.netBadCode
              : problem === 'rejoin' ? T.netLate : problem
        );
      }
    }

    if (machine.screen === 'lobby' && session.kind !== 'solo' && session.phase() === 'playing') {
      world = session.world;
      if (machine.can('loaded')) machine.send('loaded');
    }

    const focus = renderer.focusOn(world);
    if (focus) camera.follow(focus.x, focus.z, Math.min(0.1, elapsed / 1000));

    renderer.sync(world, stepper.alpha(), now / 1000, Math.min(0.1, elapsed / 1000));
    const frameEvents = drainEvents(world.events);
    renderer.consume(frameEvents);
    for (const event of frameEvents) {
      audio.cue(event);
      countStats(event);
    }
    stage.draw(camera.camera);

    hudAccumulator += elapsed;
    if (hudAccumulator >= 1000 / 15) {
      hudAccumulator = 0;
      view = projectView(world, stats);
      store.set(view);
      hud.update(view);
    }

    if (meter) {
      const info = stage.info();
      meter.sample({
        frameMs: elapsed,
        drawCalls: info.calls,
        triangles: info.triangles,
        entities: world.buddies.length + world.crates.length + world.projectiles.length + world.tanks.length
      }, now);
    }

    if (adaptation.sample(elapsed)) stage.setRenderScale(adaptation.scale);

    frames++;
    if (now - fpsWindow >= 500) {
      fps = (frames * 1000) / Math.max(1, now - fpsWindow);
      fpsWindow = now;
      frames = 0;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  function countStats(event: SimEvent): void {
    if (event.kind === 'build') stats.built++;
    else if (event.kind === 'knockout') {
      const victim = world.buddies.find((b) => b.id === event.entity);
      if (victim && victim.team !== 'red') stats.knockouts++;
    } else if (event.kind === 'place') stats.cratesDelivered++;
  }

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
      get world() { return world; },
      stage,
      screen: () => machine.screen,
      fps: () => fps,
      budgetProblems: () => overBudget(sceneCounters()),
      netInfo: () => ({
        kind: session.kind,
        code: session.code(),
        scale: stage.renderScale(),
        peers: netLink ? (netLink.transport as unknown as { peerCount?(): number }).peerCount?.() ?? -1 : 0,
        links: (netLink?.transport as unknown as { diagnose?(): unknown })?.diagnose?.() ?? []
      }),
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
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    audio.dispose();
    renderer.dispose();
    stage.dispose();
  };
}

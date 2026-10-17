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
import { createAsciiView } from './platform/asciiView';
import type { SimEvent } from './sim/core/events';
import type { LobbyActions } from './ui/shell/lobby';
import { TICK_S } from './sim/domain/constants';
import { createKeyboard } from './platform/input/keyboard';
import { createTouch } from './platform/input/touch';
import { createMachine, isTicking, type MachineEvent } from './ui/shell/machine';
import { createRouter } from './ui/shell/router';
import { openTutorialModal } from './ui/shell/screens';
import { buildHud } from './ui/hud/bind';
import { createHudStore } from './ui/hud/store';
import { projectView, type ViewState } from './sim/core/view';
import { loadSettings, saveSettings } from './platform/storage';
import type { BuddyClass } from './sim/domain/classes';
import type { BiomeKind } from './sim/domain/obstacles';
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
  zoom(): number;
  roster(): Array<{ team: string; name: string; human: boolean; ready: boolean; latencyMs: number }>;
  send(event: MachineEvent): void;
  advance(ticks: number): void;
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
  const renderer = new WorldRenderer(stage.scene, () => ({
    coarsePointer: coarse, reducedMotion: settings.reducedMotion
  }));
  const camera = new IsoCamera(1, { reducedMotion });
  const adaptation = createAdaptation();
  const machine = createMachine(webglAvailable() ? 'title' : 'unsupported');
  const store = createHudStore();
  const hud = buildHud(document);
  const keyboard = createKeyboard(window, (delta) => camera.nudgeZoom(delta));
  const touch = createTouch();
  const stats = { built: 0, knockouts: 0, cratesDelivered: 0 };
  const audio = createGameAudio();
  const meter: Meter | null = new URLSearchParams(window.location.search).get('meter') === '1' ? createMeter() : null;
  if (meter) document.body.appendChild(meter.element);
  const ascii = new URLSearchParams(window.location.search).get('ascii') === '1' ? createAsciiView(document) : null;
  if (ascii) document.body.appendChild(ascii.element);
  audio.setVolumes(settings.masterVolume, settings.musicVolume, settings.sfxVolume);
  audio.setEnabled(settings.sound);
  audio.setMusic(settings.music);
  const touchPressed = { grab: false, shoot: false, build: false };
  const touchLatched = { grab: false, shoot: false, build: false };

  const fixedSeed = Number(new URLSearchParams(window.location.search).get('seed') ?? NaN);

  function createMatch(cls: BuddyClass, biome?: BiomeKind): World {
    const seed = Number.isFinite(fixedSeed)
      ? fixedSeed >>> 0
      : (Math.floor(Math.random() * 0xffffffff) ^ 0x9e3779b9) >>> 0;
    netLink?.close();
    netLink = null;
    const chosenBiome = biome ?? settings.biome ?? 'rumput';
    session = createSoloSession(seed, cls, 'red', chosenBiome);
    renderer.setBiome(chosenBiome);
    stats.built = 0;
    stats.knockouts = 0;
    stats.cratesDelivered = 0;
    const focus = renderer.focusOn(session.world, 1);
    if (focus) camera.teleport(focus.x, focus.z);
    return session.world;
  }

  let session: Session = createSoloSession(1, settings.startClass, 'red', settings.biome);
  renderer.setBiome(settings.biome);
  let netLink: NetLink | null = null;
  let world = session.world;
  const initFocus = renderer.focusOn(world, 1);
  if (initFocus) camera.teleport(initFocus.x, initFocus.z);
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
      session = createSoloSession(1, settings.startClass, 'red', settings.biome);
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
    startWith: (cls, biome) => {
      audio.beginPlayback();
      settings.startClass = cls;
      if (biome) {
        settings.biome = biome;
        renderer.setBiome(biome);
      }
      saveSettings(settings);
      world = createMatch(cls, biome);
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
      if (key === 'quality') {
        settings.quality = value === 'low' ? 'low' : 'high';
        stage.setRenderScale(settings.quality === 'low' ? 0.75 : 1);
      } else if (key === 'biome') {
        settings.biome = value as BiomeKind;
        renderer.setBiome(settings.biome);
      } else if (key === 'masterVolume' || key === 'musicVolume' || key === 'sfxVolume') {
        settings[key] = Math.max(0, Math.min(1, Number(value)));
        audio.setVolumes(settings.masterVolume, settings.musicVolume, settings.sfxVolume);
      } else if (key === 'sound' || key === 'music' || key === 'reducedMotion') {
        settings[key] = Boolean(value);
        if (key === 'sound') audio.setEnabled(Boolean(value));
        if (key === 'music') audio.setMusic(Boolean(value));
      }
      saveSettings(settings);
    }
  });

  hud.onAction('grab', () => { touchPressed.grab = true; touchLatched.grab = true; });
  hud.onAction('shoot', () => { touchPressed.shoot = true; touchLatched.shoot = true; });
  hud.onAction('build', () => { touchPressed.build = true; touchLatched.build = true; });
  hud.onAction('pause', () => {
    if (session.kind === 'solo') {
      if (machine.can('pause')) machine.send('pause');
    } else if (machine.can('leave')) {
      machine.send('leave');
    }
  });
  hud.onAction('zoomIn', () => camera.nudgeZoom(-0.2));
  hud.onAction('zoomOut', () => camera.nudgeZoom(0.2));
  hud.onAction('restart', () => { if (machine.can('again')) machine.send('again'); });
  const toggleTutorial = (): void => {
    openTutorialModal(uiHost);
  };
  hud.onAction('help', toggleTutorial);

  const onKeyHelp = (event: KeyboardEvent): void => {
    if (event.code === 'KeyH' || event.key === '?') {
      toggleTutorial();
    }
  };
  window.addEventListener('keydown', onKeyHelp);

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
    if (screen === 'title' && session.kind !== 'solo') {
      netLink?.close();
      netLink = null;
      session = createSoloSession(1, settings.startClass, 'red', settings.biome);
      world = session.world;
      view = projectView(world, stats);
      store.set(view);
    }
    hud.setVisible(screen === 'playing');
    hud.setExitMode(session.kind !== 'solo');
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

  const rayOrigin = new THREE.Vector3();
  const rayDir = new THREE.Vector3();

  /** Where the mouse ray meets the ground plane, or null on touch-only play. */
  function groundPointFromCursor(): { x: number; z: number } | null {
    const cursor = keyboard.cursor();
    if (!cursor) return null;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const ndcX = ((cursor.x - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((cursor.y - rect.top) / rect.height) * 2 - 1);
    rayOrigin.copy(camera.camera.position);
    rayDir.set(ndcX, ndcY, 0.5).unproject(camera.camera).sub(rayOrigin);
    if (rayDir.lengthSq() < 1e-8) return null;
    rayDir.normalize();
    if (Math.abs(rayDir.y) < 1e-4) return null;
    const t = -rayOrigin.y / rayDir.y;
    if (t <= 0) return null;
    return { x: rayOrigin.x + rayDir.x * t, z: rayOrigin.z + rayDir.z * t };
  }

  function mergeAxes(): RawAxes {
    const fromKey = keyboard.read();
    const fromTouch = touch.read();
    const moveX = Math.abs(fromTouch.moveX) > Math.abs(fromKey.moveX) ? fromTouch.moveX : fromKey.moveX;
    const moveY = Math.abs(fromTouch.moveY) > Math.abs(fromKey.moveY) ? fromTouch.moveY : fromKey.moveY;
    // Aim priority: an active touch stick, then the mouse cursor (twin-stick on
    // desktop), then the movement direction as before.
    let aimX = fromTouch.aimX;
    let aimY = fromTouch.aimY;
    if (Math.hypot(aimX, aimY) < 0.15) {
      const point = groundPointFromCursor();
      const me = world.buddies.find((b) => b.id === world.localPlayer);
      if (point && me) {
        const dx = point.x - me.x;
        const dz = point.z - me.z;
        const len = Math.hypot(dx, dz);
        if (len > 0.001) {
          aimX = dx / len;
          aimY = dz / len;
        }
      } else {
        aimX = moveX;
        aimY = moveY;
      }
    }
    return {
      moveX,
      moveY,
      aimX,
      aimY,
      attack: fromKey.attack || touchPressed.shoot || touchLatched.shoot,
      grab: fromKey.grab || touchPressed.grab || touchLatched.grab,
      build: fromKey.build || touchPressed.build || touchLatched.build,
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

    if (isTicking(machine.screen)) {
      stepper.push(elapsed);
      // Clear latches once per frame, after every catch-up step has seen them,
      // so a tap shorter than one tick is never swallowed.
      touchLatched.grab = false;
      touchLatched.shoot = false;
      touchLatched.build = false;
    } else stepper.reset();

    if (machine.screen === 'lobby') {
      const problem = session.error();
      if (problem && problem !== lastNetError) {
        lastNetError = problem;
        router.lobby()?.setPhase(
          problem === 'full' ? T.netFull
            : problem === 'code' ? T.netBadCode
              : problem === 'rejoin' ? T.netLate
                : problem === 'relay' ? T.netRelay : problem
        );
      }
    }

    if (machine.screen === 'lobby' && session.kind !== 'solo' && session.phase() === 'playing') {
      world = session.world;
      if (machine.can('loaded')) machine.send('loaded');
    }

    renderer.setReticle(machine.screen === 'playing' ? groundPointFromCursor() : null);
    renderer.sync(world, stepper.alpha(), now / 1000, Math.min(0.1, elapsed / 1000));
    const frameEvents = drainEvents(world.events);
    renderer.consume(frameEvents);
    for (const event of frameEvents) {
      audio.cue(event);
      countStats(event);
    }
    if (!renderer.frozen()) stage.draw(camera.camera);

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

    ascii?.update(world, now);

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
      view: () => view,
      zoom: () => camera.zoom,
      roster: () => session.roster(),
      send: (event: MachineEvent) => {
        if (machine.can(event)) machine.send(event);
      },
      advance(ticks: number) {
        const idle: RawAxes = {
          moveX: 0, moveY: 0, aimX: 0, aimY: 0, attack: false, grab: false, build: false, zoom: 0
        };
        for (let i = 0; i < ticks; i++) {
          session.step(TICK_S, idle);
          for (const event of drainEvents(world.events)) countStats(event);
        }
        view = projectView(world, stats);
        store.set(view);
        hud.update(view);
        router.update(view);
      }
    };
  }

  return () => {
    running = false;
    window.removeEventListener('keydown', onKeyHelp);
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
    ascii?.dispose();
    renderer.dispose();
    stage.dispose();
  };
}

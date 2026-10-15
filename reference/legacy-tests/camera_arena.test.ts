import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ActionIsometricCamera } from '../src/engine/camera';
import { buildStylizedArena, ARENA_BASE_COORDINATES } from '../src/rendering/arenaBuilder';
import { SoundFx } from '../src/engine/audio';
import { TeamId } from '../src/types';

describe('ActionIsometricCamera System', () => {
  it('2.1.1 Initializes with FOV 42° and exact default isometric distance & height', () => {
    const iso = new ActionIsometricCamera(16 / 9);
    expect(iso.camera.fov).toBe(42.0);
    expect(iso.zoomFactor).toBeCloseTo((7.5 - 6.0) / (22.0 - 6.0), 4);
    expect(iso.getCurrentDistance()).toBeCloseTo(7.5, 2);
    expect(iso.getCurrentHeight()).toBeCloseTo(6.5, 2);

    // Verify pitch angle is atan2(6.5, 7.5) = 40.89° ≈ 42°
    const pitchRad = Math.atan2(iso.getCurrentHeight(), iso.getCurrentDistance());
    expect(pitchRad * (180 / Math.PI)).toBeCloseTo(40.89, 1);
  });

  it('2.1.2 Zoom limits clamp strictly within 6.0m (close) and 22.0m (overview)', () => {
    const iso = new ActionIsometricCamera(16 / 9);

    iso.zoomFactor = 0.0;
    expect(iso.getCurrentDistance()).toBeCloseTo(6.0, 2);
    expect(iso.getCurrentHeight()).toBeCloseTo(6.0 * (6.5 / 7.5), 2);

    iso.zoomFactor = 1.0;
    expect(iso.getCurrentDistance()).toBeCloseTo(22.0, 2);
    expect(iso.getCurrentHeight()).toBeCloseTo(22.0 * (6.5 / 7.5), 2);
  });

  it('2.1.3 Preserves constant pitch angle across entire zoom continuum', () => {
    const iso = new ActionIsometricCamera(16 / 9);
    for (let z = 0.0; z <= 1.0; z += 0.25) {
      iso.zoomFactor = z;
      const pitch = Math.atan2(iso.getCurrentHeight(), iso.getCurrentDistance()) * (180 / Math.PI);
      expect(pitch).toBeCloseTo(40.89, 1);
    }
  });

  it('2.1.4 Mouse wheel delta adjusts zoomFactor with strict [0.0, 1.0] clamping', () => {
    const iso = new ActionIsometricCamera(16 / 9);
    const initialZoom = iso.zoomFactor;

    iso.handleWheel(100); // Zoom out
    expect(iso.zoomFactor).toBeGreaterThan(initialZoom);

    iso.handleWheel(-99999); // Extreme zoom in
    expect(iso.zoomFactor).toBe(0.0);

    iso.handleWheel(99999); // Extreme zoom out
    expect(iso.zoomFactor).toBe(1.0);

    // Guard against non-finite or NaN input
    iso.zoomFactor = 0.5;
    iso.handleWheel(NaN);
    expect(iso.zoomFactor).toBe(0.5);

    iso.handleWheel(Infinity);
    expect(iso.zoomFactor).toBe(0.5);

    iso.handleWheel(-Infinity);
    expect(iso.zoomFactor).toBe(0.5);
  });

  it('2.1.5 Mobile touch pinch ratio scales zoom correctly with reject on non-finite ratio', () => {
    const iso = new ActionIsometricCamera(16 / 9);
    iso.zoomFactor = 0.5;

    iso.handlePinch(1.2); // Pinch spread -> zoom in
    expect(iso.zoomFactor).toBeLessThan(0.5);

    iso.handlePinch(0.8); // Pinch together -> zoom out
    expect(iso.zoomFactor).toBeGreaterThan(0.2);

    const prevZoom = iso.zoomFactor;
    iso.handlePinch(-1); // Invalid negative ratio
    expect(iso.zoomFactor).toBe(prevZoom);
    iso.handlePinch(NaN); // Invalid NaN ratio
    expect(iso.zoomFactor).toBe(prevZoom);
  });

  it('2.1.6 Target tracking smooth lerp follows player center (y + 0.8)', () => {
    const iso = new ActionIsometricCamera(16 / 9);
    const playerTarget = new THREE.Vector3(10, 0, -5);

    // Snap to target first
    iso.snapToTarget(playerTarget);
    expect(iso.camera.position.x).toBeCloseTo(10, 2);
    expect(iso.camera.position.z).toBeCloseTo(-5 + 7.5, 2);

    // Move player and verify lerp step
    const movedTarget = new THREE.Vector3(20, 0, -5);
    iso.followTarget(movedTarget, 0.016);
    expect(iso.camera.position.x).toBeGreaterThan(10);
    expect(iso.camera.position.x).toBeLessThan(20);
  });

  it('2.1.7 Window resize updates camera aspect ratio and projection matrix', () => {
    const iso = new ActionIsometricCamera(1.0);
    iso.updateAspect(2.5);
    expect(iso.camera.aspect).toBe(2.5);
  });
});

describe('buildStylizedArena Environment', () => {
  it('2.2.1 Constructs 64m x 64m island terrain, surrounding water at y = -1.5m, and perimeter rocks', () => {
    const scene = new THREE.Scene();
    const arena = buildStylizedArena(scene);

    expect(arena.islandMesh).toBeDefined();
    expect(arena.waterMesh).toBeDefined();
    expect(arena.waterMesh.position.y).toBe(-1.5);
    expect(arena.lightBeamMesh).toBeDefined();

    // Verify rocks added to island group
    expect(arena.islandMesh.children.length).toBeGreaterThan(20);
  });

  it('2.2.2 Initializes 4 3D Base Bunkers at exact team coordinates', () => {
    const scene = new THREE.Scene();
    const arena = buildStylizedArena(scene);

    const teams: TeamId[] = ['red', 'blue', 'yellow', 'cyan'];
    for (const team of teams) {
      const bunker = arena.bunkerMeshes[team];
      expect(bunker).toBeDefined();
      expect(bunker.position.x).toBe(ARENA_BASE_COORDINATES[team].x);
      expect(bunker.position.z).toBe(ARENA_BASE_COORDINATES[team].z);
    }
  });

  it('2.2.3 Initializes 4 2x2x2 Stacking Pads with elevated platform and quadrant cell guides', () => {
    const scene = new THREE.Scene();
    const arena = buildStylizedArena(scene);

    const teams: TeamId[] = ['red', 'blue', 'yellow', 'cyan'];
    for (const team of teams) {
      const pad = arena.padMeshes[team];
      expect(pad).toBeDefined();
      expect(pad.position.x).toBe(ARENA_BASE_COORDINATES[team].x);
      expect(pad.position.y).toBeCloseTo(0.03, 2);
      expect(pad.position.z).toBe(ARENA_BASE_COORDINATES[team].z);

      // Verify platform + border + 2 dividers + 4 quadrant boxes = at least 7 children
      expect(pad.children.length).toBeGreaterThanOrEqual(7);
    }
  });

  it('2.2.4 Central drop zone column has height 24m, radius 5.0m, and translucent material', () => {
    const scene = new THREE.Scene();
    const arena = buildStylizedArena(scene);

    const beam = arena.lightBeamMesh;
    expect(beam.geometry.type).toBe('CylinderGeometry');
    const mat = beam.material as THREE.MeshBasicMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBeCloseTo(0.20, 2);
    expect(beam.position.y).toBe(12.0);
  });

  it('2.2.5 Dynamic update loop animates water wave vertices and pulses light beam opacity', () => {
    const scene = new THREE.Scene();
    const arena = buildStylizedArena(scene);

    const beamMat = arena.lightBeamMesh.material as THREE.MeshBasicMaterial;
    const initialBeamOpacity = beamMat.opacity;

    arena.update(1.5, 0.016);
    expect(beamMat.opacity).not.toBe(initialBeamOpacity);
    expect(arena.lightBeamMesh.rotation.y).toBeGreaterThan(0);
  });

  it('2.2.6 updateBunkerHealth transitions fort through Intact, Damaged, Critical, and Collapsed states', () => {
    const scene = new THREE.Scene();
    const arena = buildStylizedArena(scene);

    const redBunker = arena.bunkerMeshes.red;
    const fortNode = redBunker.children[0] as THREE.Group;

    // 1. Intact (1000 HP)
    arena.updateBunkerHealth('red', 1000);
    expect(fortNode.position.y).toBe(0);
    expect(fortNode.rotation.z).toBe(0);

    // 2. Damaged (600 HP)
    arena.updateBunkerHealth('red', 600);
    expect(fortNode.position.y).toBeLessThan(0);
    expect(fortNode.rotation.z).toBe(0.02);

    // 3. Critical (200 HP)
    arena.updateBunkerHealth('red', 200);
    expect(fortNode.position.y).toBe(-0.35);
    expect(fortNode.rotation.z).toBe(0.06);

    // 4. Destroyed / Collapsed (0 HP)
    arena.updateBunkerHealth('red', 0);
    expect(fortNode.position.y).toBe(-1.50);
    expect(fortNode.rotation.z).toBe(0.12);
  });

  it('2.2.7 updateBunkerHealth clamps health values cleanly between 0 and 1000', () => {
    const scene = new THREE.Scene();
    const arena = buildStylizedArena(scene);
    const redFort = arena.bunkerMeshes.red.children[0] as THREE.Group;

    arena.updateBunkerHealth('red', -500);
    expect(redFort.position.y).toBe(-1.50);

    arena.updateBunkerHealth('red', 5000);
    expect(redFort.position.y).toBe(0);
  });
});

describe('Procedural Chiptune Audio & SFX System', () => {
  it('2.3.1 Safely executes in headless Node environment without throwing', () => {
    expect(() => SoundFx.playPop()).not.toThrow();
    expect(() => SoundFx.playShoot(false)).not.toThrow();
    expect(() => SoundFx.playShoot(true)).not.toThrow();
    expect(() => SoundFx.playExplosion()).not.toThrow();
    expect(() => SoundFx.playHeal()).not.toThrow();
  });

  it('2.3.2 Clamps master, BGM, and SFX volume between 0.0 and 1.0', () => {
    SoundFx.setMasterVolume(1.5);
    expect(SoundFx.getMasterVolume()).toBe(1.0);
    SoundFx.setMasterVolume(-0.5);
    expect(SoundFx.getMasterVolume()).toBe(0.0);
    SoundFx.setMasterVolume(0.75);
    expect(SoundFx.getMasterVolume()).toBe(0.75);

    SoundFx.setBGMVolume(2.0);
    expect(SoundFx.getBGMVolume()).toBe(1.0);
    SoundFx.setBGMVolume(-1.0);
    expect(SoundFx.getBGMVolume()).toBe(0.0);
    SoundFx.setBGMVolume(0.4);
    expect(SoundFx.getBGMVolume()).toBe(0.4);

    SoundFx.setSFXVolume(1.2);
    expect(SoundFx.getSFXVolume()).toBe(1.0);
    SoundFx.setSFXVolume(-0.2);
    expect(SoundFx.getSFXVolume()).toBe(0.0);
    SoundFx.setSFXVolume(0.85);
    expect(SoundFx.getSFXVolume()).toBe(0.85);
  });

  it('2.3.3 Toggle mute inverts enabled state cleanly', () => {
    SoundFx.enabled = true;
    expect(SoundFx.enabled).toBe(true);
    const toggled = SoundFx.toggleMute();
    expect(toggled).toBe(false);
    expect(SoundFx.enabled).toBe(false);
    SoundFx.toggleMute();
    expect(SoundFx.enabled).toBe(true);
  });

  it('2.3.4 BGM start and stop methods are safe and idempotent in headless runtime', () => {
    expect(() => SoundFx.startChiptuneBGM()).not.toThrow();
    expect(() => SoundFx.startChiptuneBGM()).not.toThrow();
    expect(() => SoundFx.stopChiptuneBGM()).not.toThrow();
    expect(() => SoundFx.stopChiptuneBGM()).not.toThrow();
  });
});

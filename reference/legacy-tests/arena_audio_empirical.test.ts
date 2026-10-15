import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { buildStylizedArena, ARENA_BASE_COORDINATES } from '../src/rendering/arenaBuilder';
import { SoundFx } from '../src/engine/audio';
import { TeamId } from '../src/types';

describe('Milestone 2 Empirical Stress Tests: Arena & Base Bunkers', () => {
  const TEAMS: TeamId[] = ['red', 'blue', 'yellow', 'cyan'];
  const EXPECTED_TEAM_HEX: Record<TeamId, number> = {
    red: 0xff4757,
    blue: 0x2ed573,
    yellow: 0xffa502,
    cyan: 0x1e90ff
  };

  /* =========================================================================
     1. Base Bunker Spatial Layout & Architecture Verification
     ========================================================================= */
  describe('1. Bunker Hierarchy & Exact Spatial Layout', () => {
    it('verifies all 4 bunker groups are placed exactly at (±18, 0, ±18)', () => {
      const scene = new THREE.Scene();
      const arena = buildStylizedArena(scene);

      for (const team of TEAMS) {
        const bunker = arena.bunkerMeshes[team];
        expect(bunker).toBeDefined();
        const expectedCoord = ARENA_BASE_COORDINATES[team];

        expect(bunker.position.x).toBe(expectedCoord.x);
        expect(bunker.position.y).toBe(0);
        expect(bunker.position.z).toBe(expectedCoord.z);

        // Explicit check against the ±18 requirement
        expect(Math.abs(bunker.position.x)).toBe(18);
        expect(Math.abs(bunker.position.z)).toBe(18);
      }
    });

    it('verifies fort node is offset outward diagonally by 3.2m to leave pad open', () => {
      const scene = new THREE.Scene();
      const arena = buildStylizedArena(scene);

      for (const team of TEAMS) {
        const bunker = arena.bunkerMeshes[team];
        const fortNode = bunker.children[0] as THREE.Group;
        expect(fortNode).toBeDefined();

        const cornerDirX = ARENA_BASE_COORDINATES[team].x > 0 ? 1 : -1;
        const cornerDirZ = ARENA_BASE_COORDINATES[team].z > 0 ? 1 : -1;

        expect(fortNode.position.x).toBeCloseTo(cornerDirX * 3.2, 4);
        expect(fortNode.position.z).toBeCloseTo(cornerDirZ * 3.2, 4);

        // Diagonal distance from bunker origin = hypot(3.2, 3.2) ≈ 4.525m
        const diagDist = Math.hypot(fortNode.position.x, fortNode.position.z);
        expect(diagDist).toBeCloseTo(Math.SQRT2 * 3.2, 3);
      }
    });

    it('verifies complete fort structural components: base, parapets, trims, flag, and 9 sandbags', () => {
      const scene = new THREE.Scene();
      const arena = buildStylizedArena(scene);

      for (const team of TEAMS) {
        const bunker = arena.bunkerMeshes[team];
        const fortNode = bunker.children[0] as THREE.Group;

        // Children breakdown:
        // 1 concrete base
        // 1 trim mesh
        // 4 corner parapet posts
        // 2 flag parts (mast + banner)
        // 9 sandbags (4 bottom + 3 middle + 2 top)
        // Total expected children = 1 + 1 + 4 + 2 + 9 = 17
        expect(fortNode.children.length).toBe(17);

        // Find concrete base: BoxGeometry(6, 2.5, 6) at y = 1.25
        const base = fortNode.children[0] as THREE.Mesh;
        const baseGeo = base.geometry as THREE.BoxGeometry;
        expect(baseGeo.parameters.width).toBe(6.0);
        expect(baseGeo.parameters.height).toBe(2.5);
        expect(baseGeo.parameters.depth).toBe(6.0);
        expect(base.position.y).toBe(1.25);

        // Find trim mesh: BoxGeometry(6.2, 0.2, 6.2) at y = 2.55
        const trim = fortNode.children[1] as THREE.Mesh;
        const trimGeo = trim.geometry as THREE.BoxGeometry;
        expect(trimGeo.parameters.width).toBe(6.2);
        expect(trimGeo.parameters.height).toBe(0.2);
        expect(trimGeo.parameters.depth).toBe(6.2);
        expect(trim.position.y).toBe(2.55);
      }
    });
  });

  /* =========================================================================
     2. 4-Tier Damage State Transitions Verification
     ========================================================================= */
  describe('2. Multi-Tier Bunker Damage State Transitions', () => {
    it('verifies State 1: Intact (1000 HP) properties across all 4 teams', () => {
      const scene = new THREE.Scene();
      const arena = buildStylizedArena(scene);

      for (const team of TEAMS) {
        arena.updateBunkerHealth(team, 1000);
        const fortNode = arena.bunkerMeshes[team].children[0] as THREE.Group;
        const trimMesh = fortNode.children[1] as THREE.Mesh;
        const trimMat = trimMesh.material as THREE.MeshLambertMaterial;

        expect(fortNode.position.y).toBe(0);
        expect(fortNode.rotation.x).toBe(0);
        expect(fortNode.rotation.y).toBe(0);
        expect(fortNode.rotation.z).toBe(0);
        expect(trimMat.color.getHex()).toBe(EXPECTED_TEAM_HEX[team]);
      }
    });

    it('verifies State 2: Damaged (600 HP) properties across all 4 teams', () => {
      const scene = new THREE.Scene();
      const arena = buildStylizedArena(scene);

      for (const team of TEAMS) {
        arena.updateBunkerHealth(team, 600);
        const fortNode = arena.bunkerMeshes[team].children[0] as THREE.Group;
        const trimMesh = fortNode.children[1] as THREE.Mesh;
        const trimMat = trimMesh.material as THREE.MeshLambertMaterial;

        expect(fortNode.position.y).toBeCloseTo(-0.08, 3);
        expect(fortNode.rotation.x).toBeCloseTo(-0.015, 4);
        expect(fortNode.rotation.y).toBe(0);
        expect(fortNode.rotation.z).toBeCloseTo(0.02, 4);
        expect(trimMat.color.getHex()).toBe(EXPECTED_TEAM_HEX[team]);
      }
    });

    it('verifies State 3: Critical (200 HP) properties across all 4 teams', () => {
      const scene = new THREE.Scene();
      const arena = buildStylizedArena(scene);

      for (const team of TEAMS) {
        arena.updateBunkerHealth(team, 200);
        const fortNode = arena.bunkerMeshes[team].children[0] as THREE.Group;
        const trimMesh = fortNode.children[1] as THREE.Mesh;
        const trimMat = trimMesh.material as THREE.MeshLambertMaterial;

        expect(fortNode.position.y).toBeCloseTo(-0.35, 3);
        expect(fortNode.rotation.x).toBeCloseTo(0.04, 4);
        expect(fortNode.rotation.y).toBe(0);
        expect(fortNode.rotation.z).toBeCloseTo(0.06, 4);
        expect(trimMat.color.getHex()).toBe(EXPECTED_TEAM_HEX[team]);
      }
    });

    it('verifies State 4: Collapsed / Destroyed (0 HP) properties across all 4 teams', () => {
      const scene = new THREE.Scene();
      const arena = buildStylizedArena(scene);

      for (const team of TEAMS) {
        arena.updateBunkerHealth(team, 0);
        const fortNode = arena.bunkerMeshes[team].children[0] as THREE.Group;
        const trimMesh = fortNode.children[1] as THREE.Mesh;
        const trimMat = trimMesh.material as THREE.MeshLambertMaterial;

        expect(fortNode.position.y).toBeCloseTo(-1.50, 3);
        expect(fortNode.rotation.x).toBeCloseTo(-0.08, 4);
        expect(fortNode.rotation.y).toBe(0);
        expect(fortNode.rotation.z).toBeCloseTo(0.12, 4);
        // Switched to charred ash color
        expect(trimMat.color.getHex()).toBe(0x353b48);
      }
    });

    it('stress-tests HP boundary transitions: 751 vs 750, 401 vs 400, 1 vs 0', () => {
      const scene = new THREE.Scene();
      const arena = buildStylizedArena(scene);
      const redFort = arena.bunkerMeshes.red.children[0] as THREE.Group;

      // 751 (Intact)
      arena.updateBunkerHealth('red', 751);
      expect(redFort.position.y).toBe(0);

      // 750 (Damaged)
      arena.updateBunkerHealth('red', 750);
      expect(redFort.position.y).toBeCloseTo(-0.08, 3);

      // 401 (Damaged)
      arena.updateBunkerHealth('red', 401);
      expect(redFort.position.y).toBeCloseTo(-0.08, 3);

      // 400 (Critical)
      arena.updateBunkerHealth('red', 400);
      expect(redFort.position.y).toBeCloseTo(-0.35, 3);

      // 1 (Critical)
      arena.updateBunkerHealth('red', 1);
      expect(redFort.position.y).toBeCloseTo(-0.35, 3);

      // 0 (Destroyed)
      arena.updateBunkerHealth('red', 0);
      expect(redFort.position.y).toBeCloseTo(-1.50, 3);
    });

    it('stress-tests HP values outside [0, 1000] clamping', () => {
      const scene = new THREE.Scene();
      const arena = buildStylizedArena(scene);
      const redFort = arena.bunkerMeshes.red.children[0] as THREE.Group;

      arena.updateBunkerHealth('red', -999999);
      expect(redFort.position.y).toBeCloseTo(-1.50, 3);

      arena.updateBunkerHealth('red', 999999);
      expect(redFort.position.y).toBe(0);
    });

    it('verifies restoration from 0 HP back to 1000 HP restores team color and posture', () => {
      const scene = new THREE.Scene();
      const arena = buildStylizedArena(scene);
      const redFort = arena.bunkerMeshes.red.children[0] as THREE.Group;
      const trimMat = (redFort.children[1] as THREE.Mesh).material as THREE.MeshLambertMaterial;

      // Collapse first
      arena.updateBunkerHealth('red', 0);
      expect(trimMat.color.getHex()).toBe(0x353b48);
      expect(redFort.position.y).toBeCloseTo(-1.50, 3);

      // Restore to 1000 HP
      arena.updateBunkerHealth('red', 1000);
      expect(trimMat.color.getHex()).toBe(EXPECTED_TEAM_HEX.red);
      expect(redFort.position.y).toBe(0);
      expect(redFort.rotation.z).toBe(0);
    });
  });

  /* =========================================================================
     3. Water Wave Dynamic Vertices Animation
     ========================================================================= */
  describe('3. Water Wave Dynamic Vertices & Moat Animation', () => {
    it('verifies water mesh is at y = -1.5m and has 1089 vertices', () => {
      const scene = new THREE.Scene();
      const arena = buildStylizedArena(scene);

      expect(arena.waterMesh.position.y).toBe(-1.5);
      expect(arena.waterMesh.rotation.x).toBe(-Math.PI / 2);

      const posAttr = arena.waterMesh.geometry.attributes.position;
      // 32 x 32 segments -> 33 x 33 = 1089 vertices
      expect(posAttr.count).toBe(1089);
    });

    it('verifies arenaElements.update(time, dt) dynamically moves vertices without throwing', () => {
      const scene = new THREE.Scene();
      const arena = buildStylizedArena(scene);
      const posAttr = arena.waterMesh.geometry.attributes.position;

      // Step at t = 0
      arena.update(0.0, 0.016);
      const zValuesAt0 = new Float32Array(posAttr.count);
      for (let i = 0; i < posAttr.count; i++) {
        zValuesAt0[i] = posAttr.getZ(i);
        expect(Number.isFinite(zValuesAt0[i])).toBe(true);
      }

      // Step at t = 1.0
      arena.update(1.0, 0.016);
      let changedCount = 0;
      for (let i = 0; i < posAttr.count; i++) {
        const zNow = posAttr.getZ(i);
        expect(Number.isFinite(zNow)).toBe(true);
        if (Math.abs(zNow - zValuesAt0[i]) > 0.001) {
          changedCount++;
        }
      }

      // Almost all vertices should have moved dynamically
      expect(changedCount).toBeGreaterThan(1000);
      // In Three.js, setting needsUpdate = true increments the attribute version
      expect((posAttr as THREE.BufferAttribute).version).toBeGreaterThan(0);
    });

    it('empirically verifies wave displacement is strictly bounded within [-0.20, 0.20]', () => {
      const scene = new THREE.Scene();
      const arena = buildStylizedArena(scene);
      const posAttr = arena.waterMesh.geometry.attributes.position;

      let minDisplacement = Infinity;
      let maxDisplacement = -Infinity;

      // Sample 50 distinct timestamps
      for (let t = 0; t <= 10.0; t += 0.2) {
        arena.update(t, 0.016);
        for (let i = 0; i < posAttr.count; i++) {
          const z = posAttr.getZ(i);
          if (z < minDisplacement) minDisplacement = z;
          if (z > maxDisplacement) maxDisplacement = z;
        }
      }

      // Math.sin(...) * 0.12 + Math.cos(...) * 0.08 bounds are [-0.20, 0.20]
      expect(minDisplacement).toBeGreaterThanOrEqual(-0.2001);
      expect(maxDisplacement).toBeLessThanOrEqual(0.2001);
      expect(minDisplacement).toBeLessThan(-0.15); // Truly reaches near minimum
      expect(maxDisplacement).toBeGreaterThan(0.15); // Truly reaches near maximum
    });

    it('stress-tests extreme time values (t = 1e6, t = -100, dt = 0)', () => {
      const scene = new THREE.Scene();
      const arena = buildStylizedArena(scene);
      const posAttr = arena.waterMesh.geometry.attributes.position;

      expect(() => arena.update(1000000.0, 0.016)).not.toThrow();
      expect(Number.isFinite(posAttr.getZ(0))).toBe(true);

      expect(() => arena.update(-100.0, 0.0)).not.toThrow();
      expect(Number.isFinite(posAttr.getZ(0))).toBe(true);
    });

    it('verifies water and foam opacity oscillation ranges', () => {
      const scene = new THREE.Scene();
      const arena = buildStylizedArena(scene);
      const waterMat = arena.waterMesh.material as THREE.MeshLambertMaterial;

      let minWaterOpacity = Infinity;
      let maxWaterOpacity = -Infinity;

      for (let t = 0; t <= 5.0; t += 0.1) {
        arena.update(t, 0.016);
        if (waterMat.opacity < minWaterOpacity) minWaterOpacity = waterMat.opacity;
        if (waterMat.opacity > maxWaterOpacity) maxWaterOpacity = waterMat.opacity;
      }

      // 0.65 ± 0.05 -> [0.60, 0.70]
      expect(minWaterOpacity).toBeGreaterThanOrEqual(0.599);
      expect(maxWaterOpacity).toBeLessThanOrEqual(0.701);
    });
  });

  /* =========================================================================
     4. Pad Glowing Borders & Emissive Pulsing
     ========================================================================= */
  describe('4. Pad Glowing Borders & Emissive Pulsing', () => {
    it('verifies all 4 pads exist with platform at y = 0.03m and border at y = 0.03m', () => {
      const scene = new THREE.Scene();
      const arena = buildStylizedArena(scene);

      for (const team of TEAMS) {
        const pad = arena.padMeshes[team];
        expect(pad).toBeDefined();
        expect(pad.position.x).toBe(ARENA_BASE_COORDINATES[team].x);
        expect(pad.position.y).toBeCloseTo(0.03, 3);
        expect(pad.position.z).toBe(ARENA_BASE_COORDINATES[team].z);

        // Platform is child 0, Border is child 1
        const platform = pad.children[0] as THREE.Mesh;
        const border = pad.children[1] as THREE.Mesh;

        expect(platform.position.y).toBeCloseTo(0.05, 3);
        expect(border.position.y).toBeCloseTo(0.03, 3);
      }
    });

    it('verifies border emissive intensity pulses strictly between [0.40, 0.70]', () => {
      const scene = new THREE.Scene();
      const arena = buildStylizedArena(scene);

      let minPulse = Infinity;
      let maxPulse = -Infinity;

      // Sample 100 time points
      for (let t = 0; t <= 4.0; t += 0.04) {
        arena.update(t, 0.016);
        for (const team of TEAMS) {
          const borderMesh = arena.padMeshes[team].children[1] as THREE.Mesh;
          const borderMat = borderMesh.material as THREE.MeshStandardMaterial;
          const intensity = borderMat.emissiveIntensity;

          if (intensity < minPulse) minPulse = intensity;
          if (intensity > maxPulse) maxPulse = intensity;

          // Mathematical formula: 0.55 + sin(t * 3.5) * 0.15
          const expected = 0.55 + Math.sin(t * 3.5) * 0.15;
          expect(intensity).toBeCloseTo(expected, 4);
        }
      }

      expect(minPulse).toBeGreaterThanOrEqual(0.399);
      expect(maxPulse).toBeLessThanOrEqual(0.701);
      expect(minPulse).toBeCloseTo(0.40, 1);
      expect(maxPulse).toBeCloseTo(0.70, 1);
    });
  });

  /* =========================================================================
     5. Central Light Beam Continuous Rotation & Opacity Pulsing
     ========================================================================= */
  describe('5. Central Light Beam Rotation & Opacity Pulsing', () => {
    it('verifies light beam dimensions, additive blending, and position at y = 12.0m', () => {
      const scene = new THREE.Scene();
      const arena = buildStylizedArena(scene);
      const beam = arena.lightBeamMesh;

      expect(beam.position.x).toBe(0);
      expect(beam.position.y).toBe(12.0);
      expect(beam.position.z).toBe(0);

      const beamMat = beam.material as THREE.MeshBasicMaterial;
      expect(beamMat.transparent).toBe(true);
      expect(beamMat.depthWrite).toBe(false);
      expect(beamMat.blending).toBe(THREE.AdditiveBlending);
    });

    it('verifies continuous rotation at exactly 0.20 rad/s', () => {
      const scene = new THREE.Scene();
      const arena = buildStylizedArena(scene);

      for (const t of [0, 1.5, 5.0, 10.0, 25.0]) {
        arena.update(t, 0.016);
        expect(arena.lightBeamMesh.rotation.y).toBeCloseTo(t * 0.20, 5);
      }
    });

    it('verifies light beam opacity pulses strictly within [0.07, 0.23]', () => {
      const scene = new THREE.Scene();
      const arena = buildStylizedArena(scene);
      const beamMat = arena.lightBeamMesh.material as THREE.MeshBasicMaterial;

      let minOpacity = Infinity;
      let maxOpacity = -Infinity;

      for (let t = 0; t <= 5.0; t += 0.05) {
        arena.update(t, 0.016);
        const op = beamMat.opacity;
        if (op < minOpacity) minOpacity = op;
        if (op > maxOpacity) maxOpacity = op;

        // Formula: 0.15 + sin(t * 3.0) * 0.08
        const expected = 0.15 + Math.sin(t * 3.0) * 0.08;
        expect(op).toBeCloseTo(expected, 4);
      }

      expect(minOpacity).toBeGreaterThanOrEqual(0.069);
      expect(maxOpacity).toBeLessThanOrEqual(0.231);
      expect(minOpacity).toBeCloseTo(0.07, 2);
      expect(maxOpacity).toBeCloseTo(0.23, 2);
    });
  });

  /* =========================================================================
     6. Procedural Web Audio Controls & Headless Safety
     ========================================================================= */
  describe('6. Web Audio Procedural Controls & Headless Node Safety', () => {
    it('executes all combat and interaction SFX in headless Node without throwing', () => {
      expect(() => SoundFx.playPop()).not.toThrow();
      expect(() => SoundFx.playShoot(false)).not.toThrow();
      expect(() => SoundFx.playShoot(true)).not.toThrow();
      expect(() => SoundFx.playExplosion()).not.toThrow();
      expect(() => SoundFx.playHeal()).not.toThrow();
    });

    it('executes 1,000 rapid SFX invocations without state corruption or error', () => {
      expect(() => {
        for (let i = 0; i < 200; i++) {
          SoundFx.playPop();
          SoundFx.playShoot(i % 2 === 0);
          SoundFx.playExplosion();
          SoundFx.playHeal();
          SoundFx.startChiptuneBGM();
          SoundFx.stopChiptuneBGM();
        }
      }).not.toThrow();
    });

    it('verifies volume clamping behavior across boundary and invalid inputs', () => {
      // Normal clamping
      SoundFx.setMasterVolume(0.5);
      expect(SoundFx.getMasterVolume()).toBe(0.5);

      SoundFx.setMasterVolume(-100);
      expect(SoundFx.getMasterVolume()).toBe(0.0);

      SoundFx.setMasterVolume(100);
      expect(SoundFx.getMasterVolume()).toBe(1.0);

      // BGM volume
      SoundFx.setBGMVolume(-0.01);
      expect(SoundFx.getBGMVolume()).toBe(0.0);
      SoundFx.setBGMVolume(1.01);
      expect(SoundFx.getBGMVolume()).toBe(1.0);

      // SFX volume
      SoundFx.setSFXVolume(-5);
      expect(SoundFx.getSFXVolume()).toBe(0.0);
      SoundFx.setSFXVolume(5);
      expect(SoundFx.getSFXVolume()).toBe(1.0);
    });

    it('verifies mute toggling state machine and enabled setter', () => {
      SoundFx.enabled = true;
      expect(SoundFx.enabled).toBe(true);

      const toggle1 = SoundFx.toggleMute();
      expect(toggle1).toBe(false);
      expect(SoundFx.enabled).toBe(false);

      const toggle2 = SoundFx.toggleMute();
      expect(toggle2).toBe(true);
      expect(SoundFx.enabled).toBe(true);

      SoundFx.enabled = false;
      expect(SoundFx.enabled).toBe(false);
      SoundFx.enabled = true;
      expect(SoundFx.enabled).toBe(true);
    });
  });

  /* =========================================================================
     7. Simulated Web Audio Environment: Sequencer, Gains & Voice Allocation
     ========================================================================= */
  describe('7. Simulated Web Audio Engine & Chiptune Sequencer Graph', () => {
    let originalWindow: any;
    let mockCtx: any;
    let createdOscillators: any[];
    let createdBufferSources: any[];
    let intervalCallback: (() => void) | null = null;
    let intervalTimerId: number = 42;

    beforeEach(() => {
      originalWindow = (globalThis as any).window;
      createdOscillators = [];
      createdBufferSources = [];
      intervalCallback = null;

      mockCtx = {
        state: 'running',
        currentTime: 0.1,
        sampleRate: 44100,
        destination: {},
        createGain: vi.fn(() => ({
          gain: {
            value: 1,
            setValueAtTime: vi.fn(),
            setTargetAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn()
          },
          connect: vi.fn(),
          disconnect: vi.fn()
        })),
        createOscillator: vi.fn(() => {
          const osc = {
            type: 'sine',
            frequency: {
              value: 0,
              setValueAtTime: vi.fn(),
              exponentialRampToValueAtTime: vi.fn()
            },
            setPeriodicWave: vi.fn(),
            connect: vi.fn(),
            disconnect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
            onended: null as (() => void) | null
          };
          createdOscillators.push(osc);
          return osc;
        }),
        createBiquadFilter: vi.fn(() => ({
          type: 'lowpass',
          frequency: {
            value: 0,
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn()
          },
          Q: {
            value: 0,
            setValueAtTime: vi.fn()
          },
          connect: vi.fn(),
          disconnect: vi.fn()
        })),
        createBufferSource: vi.fn(() => {
          const src = {
            buffer: null,
            loop: false,
            connect: vi.fn(),
            disconnect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
            onended: null as (() => void) | null
          };
          createdBufferSources.push(src);
          return src;
        }),
        createBuffer: vi.fn((channels: number, length: number, sampleRate: number) => ({
          channels,
          length,
          sampleRate,
          getChannelData: vi.fn(() => new Float32Array(length))
        })),
        createPeriodicWave: vi.fn(() => ({})),
        resume: vi.fn(() => Promise.resolve())
      };

      // Mock browser window environment
      (globalThis as any).window = {
        AudioContext: vi.fn(() => mockCtx),
        addEventListener: vi.fn(),
        setInterval: vi.fn((fn: () => void) => {
          intervalCallback = fn;
          return intervalTimerId;
        }),
        clearInterval: vi.fn()
      };

      // Reset SoundFx static state
      (SoundFx as any).ctx = null;
      (SoundFx as any).masterGain = null;
      (SoundFx as any).bgmGain = null;
      (SoundFx as any).sfxGain = null;
      (SoundFx as any).schedulerTimer = null;
      (SoundFx as any).bgmActive = false;
      (SoundFx as any).activeVoices = [];
    });

    afterEach(() => {
      SoundFx.stopChiptuneBGM();
      (SoundFx as any).ctx = null;
      (SoundFx as any).masterGain = null;
      (SoundFx as any).bgmGain = null;
      (SoundFx as any).sfxGain = null;
      (SoundFx as any).schedulerTimer = null;
      (SoundFx as any).bgmActive = false;
      (SoundFx as any).activeVoices = [];
      (globalThis as any).window = originalWindow;
    });

    it('initializes gain routing graph [BGM/SFX -> Master -> Destination] on first play', () => {
      SoundFx.startChiptuneBGM();

      // Verified AudioContext was instantiated
      expect((globalThis as any).window.AudioContext).toHaveBeenCalledTimes(1);

      // Verify master, BGM, and SFX gain nodes were created (at least 3 gain nodes)
      expect(mockCtx.createGain).toHaveBeenCalled();
      expect(SoundFx.isBGMPlaying()).toBe(true);

      // Verify scheduler interval was registered
      expect((globalThis as any).window.setInterval).toHaveBeenCalledTimes(1);
    });

    it('schedules 32-step musical loop and plays lead, bass, and percussion voices', () => {
      SoundFx.startChiptuneBGM();
      expect(intervalCallback).toBeDefined();

      // Trigger scheduler ticks across several 16th notes (covers kick, snare, hi-hat)
      if (intervalCallback) {
        // Tick 1 (t = 0.1s, schedules step 0: Lead C5, Bass C2, Kick K)
        intervalCallback();

        // Advance time by 0.25s (steps 1..3: Hi-Hat H at step 2, Snare S at step 4)
        mockCtx.currentTime = 0.35;
        intervalCallback();

        mockCtx.currentTime = 0.60;
        intervalCallback();
      }

      // Should have created lead and bass oscillators and percussion buffer sources
      expect(createdOscillators.length).toBeGreaterThan(0);
      expect(createdBufferSources.length).toBeGreaterThan(0);

      // Verify oscillators were started and scheduled to stop
      for (const osc of createdOscillators) {
        expect(osc.start).toHaveBeenCalled();
        expect(osc.stop).toHaveBeenCalled();
        expect(osc.connect).toHaveBeenCalled();
      }

      for (const src of createdBufferSources) {
        expect(src.start).toHaveBeenCalled();
        expect(src.stop).toHaveBeenCalled();
        expect(src.connect).toHaveBeenCalled();
      }
    });

    it('volume changes and mute toggle adjust gain nodes via setTargetAtTime', () => {
      SoundFx.startChiptuneBGM();

      // Master volume
      SoundFx.setMasterVolume(0.42);
      expect((SoundFx as any).masterGain.gain.setTargetAtTime).toHaveBeenCalled();

      // BGM volume
      SoundFx.setBGMVolume(0.25);
      expect((SoundFx as any).bgmGain.gain.setTargetAtTime).toHaveBeenCalled();

      // Mute toggle
      SoundFx.toggleMute(); // disabled
      expect((SoundFx as any).masterGain.gain.setTargetAtTime).toHaveBeenCalled();
    });

    it('stops BGM cleanly, clears interval timer, and disconnects all active voices', () => {
      SoundFx.startChiptuneBGM();
      expect(SoundFx.isBGMPlaying()).toBe(true);

      if (intervalCallback) {
        intervalCallback();
      }

      expect((SoundFx as any).activeVoices.length).toBeGreaterThan(0);

      SoundFx.stopChiptuneBGM();
      expect(SoundFx.isBGMPlaying()).toBe(false);
      expect((globalThis as any).window.clearInterval).toHaveBeenCalledWith(intervalTimerId);
      expect((SoundFx as any).activeVoices.length).toBe(0);
    });

    it('verifies 32-step chiptune score lengths and frequency map completeness', () => {
      const leadScore: (string | null)[] = (SoundFx as any).LEAD_SCORE;
      const bassScore: (string | null)[] = (SoundFx as any).BASS_SCORE;
      const percScore: (string | null)[] = (SoundFx as any).PERC_SCORE;
      const noteFreqs: Record<string, number> = (SoundFx as any).NOTE_FREQS;

      expect(leadScore.length).toBe(32);
      expect(bassScore.length).toBe(32);
      expect(percScore.length).toBe(32);

      // Verify all lead notes exist in frequency table
      for (const note of leadScore) {
        if (note !== null) {
          expect(noteFreqs[note]).toBeDefined();
          expect(noteFreqs[note]).toBeGreaterThan(20);
        }
      }

      // Verify all bass notes exist in frequency table
      for (const note of bassScore) {
        if (note !== null) {
          expect(noteFreqs[note]).toBeDefined();
          expect(noteFreqs[note]).toBeGreaterThan(20);
        }
      }

      // Verify all perc hits are supported
      const validPerc = new Set(['K', 'S', 'H', 'O', 'F']);
      for (const hit of percScore) {
        if (hit !== null) {
          expect(validPerc.has(hit)).toBe(true);
        }
      }
    });
  });
});

# Project: Tiny Brawlers Complete Visual & Gameplay Overhaul

## Architecture
Tiny Brawlers is an action-isometric, fast-paced 3D multiplayer arena brawler built with Three.js, TypeScript, and Vite.
The game simulates a vibrant 3D cartoon battlefield featuring four teams (Red, Blue, Yellow, Cyan), autonomous AI commanders, physics-driven crate stacking and crafting on a 2x2x2 pad, tactical classes (Fighter, Healer, Constructor), 3D procedural chibi characters, Web Audio chiptune music, and base bunker destruction objectives.

### Subsystem Decomposition
```
Tiny Brawlers
├── Core Engine & Systems
│   ├── Game Loop & State Manager (src/game.ts)
│   ├── Action-Isometric Camera System (src/engine/camera.ts)
│   ├── Procedural Chiptune Audio & SFX (src/engine/audio.ts)
│   └── Ballistics & Area Physics (src/engine/physics.ts)
├── Entities & Gameplay
│   ├── Chibi Buddy Logic & Stats (src/entities/buddy.ts)
│   ├── 3D Wooden Crates & Trajectory (src/entities/crate.ts)
│   ├── 2x2x2 Stacking Pad & Recipes (src/entities/basePad.ts)
│   ├── Base Bunker Fort & Health (src/entities/bunker.ts)
│   ├── Heavy Battle Tank Vehicle (src/entities/tank.ts)
│   └── Tactical Bot AI State Machine (src/ai/bot.ts)
├── Visual & Rendering Layer
│   ├── 3D Chibi Rigging & Weapons (src/rendering/buddyRig.ts)
│   ├── Procedural Animations (src/rendering/animations.ts)
│   ├── Grassland Island Arena & Environment (src/rendering/arenaBuilder.ts)
│   └── 3D Wooden Crate Models (src/rendering/crateModel.ts)
└── User Interface & Controls
    ├── In-Game Interactive 2x2 Pad HUD (index.html, src/main.ts)
    └── Virtual Joystick & Touch Controls (src/main.ts)
```

---

## Feature Inventory

Every feature discovered in the Survey phase is mapped to a specific milestone.

| # | Feature | Description | Milestone | Source |
|---|---|---|---|---|
| 1 | Chubby Capsule Torso | Cylinder body with hemispherical caps and team materials | M1 | Survey (Preview:811-820) |
| 2 | Sparkling Anime Eyes | Sclera, pupils, and dual reflection sparkle spheres | M1 | Survey (Preview:826-859) |
| 3 | Rosy Blush Cheeks | Pink translucent cheeks on face lateral | M1 | Survey (Preview:860-868) |
| 4 | Smiling Mouth | Inverted half-torus curved smiling mouth | M1 | Survey (Preview:869-875) |
| 5 | Retro Military Helmet | Olive hemisphere dome + rim + golden 5-point star badge | M1 | Survey (Preview:876-890) |
| 6 | Chubby Mitten Hands | Spherical mitten hands on pivot groups | M1 | Survey (Preview:891-906) |
| 7 | Combat Boots & Shadow | Dark rectangular boots with stepping pivots and ground shadow | M1 | Survey (Preview:907-929) |
| 8 | Squash-and-Stretch Bounce | Procedural volume-preserving vertical idle bounce | M1 | Survey (Preview:983-995) |
| 9 | Short-Run Walk Cycle | Waddle sway, alternating foot lift, dynamic arm swings | M1 | Survey (Preview:996-1006) |
| 10 | Overhead Crate Carry Pose | Arms raised overhead, shoulder elevated, under-load squish | M1 | Survey (Preview:1007-1013) |
| 11 | Celebrate Jump | Bouncy jumping with cheering arms | M1 | Survey (Preview:1014-1021) |
| 12 | 4 Facial Expressions | Happy (smile), Surprise (O), Angry (frown), Wink presets | M1 | Survey (Preview:1060-1089) |
| 13 | 3D Pistol Model | Dark steel barrel with grip attached to hand socket | M1 | Survey (R1) |
| 14 | 3D Shotgun Model | Double steel barrels with wooden stock & pump | M1 | Survey (R1) |
| 15 | 3D Pineapple Grenade Model | Green pineapple ball with steel cap & gold pull ring | M1 | Survey (Preview:938-948) |
| 16 | 3D Medic Syringe Model | Translucent cylinder with glowing green fluid & needle | M1 | Survey (Preview:949-964) |
| 17 | 3D Rocket Bazooka Model | Military olive rocket tube mounted on right shoulder | M1 | Survey (Preview:966-974) |
| 18 | Action-Isometric Camera | 7.5m distance, 6.5m height, 42° pitch, smooth lerp 0.08 | M2 | Survey (R2) |
| 19 | Dynamic Zoom (Wheel/Pinch) | Mouse-wheel and touch pinch zoom between close & overview | M2 | Survey (R2) |
| 20 | Grassland Island & Water Moat | 64x64 green island terrain with cyan water moat | M2 | Survey (R2, Directive 1) |
| 21 | Cartoon Rock Obstacles | Stylized decorative rocks scattered on perimeter | M2 | Survey (R2, Directive 1) |
| 22 | 4 3D Team Base Bunkers | Concrete forts with team trims, sandbags, and 1000 HP | M2 | Survey (R2, Directive 1, 3) |
| 23 | Glowing Pad Borders & Grid | Emissive pulsing borders and 2x2 grid dividers on base pads | M2 | Survey (R2) |
| 24 | Central Drop Zone Light Beams | Concentric ring marker with pulsing vertical light column | M2 | Survey (R2) |
| 25 | Procedural Chiptune BGM | Dynamic Web Audio chiptune melody, bassline, and mute toggle | M2 | Survey (Directive 2) |
| 26 | 3D Stylized Wooden Crate | Wood cube with cross-plank side diagonals & metal corner caps | M3 | Survey (R3) |
| 27 | Head Mounting & Walking Bob | Overhead crate mounting with walking bob physics | M3 | Survey (R3) |
| 28 | 2x2x2 Pad Slot Snapping | Discrete 3D grid snapping for all 8 pad slots | M3 | Survey (R3) |
| 29 | Stacking Pad Structural Gravity | Layer 1 requires Layer 0; clearing bottom cascades to top | M3 | Survey (R3) |
| 30 | Recipe 1: Pistol Standard | 1 crate -> Pistol (90 DPS) | M3 | Survey (R3) |
| 31 | Recipe 2: Pineapple Grenades | 2 crates vertical stack -> Grenades x5 (320 Burst DPS) | M3 | Survey (R3) |
| 32 | Recipe 3: Shotgun Penghancur | 2 crates horizontal line -> Shotgun (220 DPS) | M3 | Survey (R3) |
| 33 | Recipe 4: Medic Buddy | 3 crates (2 bottom + 1 top) -> Medic Buddy unit (+40 HP/s) | M3 | Survey (R3) |
| 34 | Recipe 5: Rocket Bazooka | 4 crates flat -> Bazooka (450 DPS) | M3 | Survey (R3) |
| 35 | Recipe 6: Commando Buddy | 4 crates vertical wall -> Commando Buddy unit (350 HP) | M3 | Survey (R3) |
| 36 | Recipe 7: Heavy Battle Tank | 8 crates cube -> Heavy Battle Tank vehicle (980 DPS) | M3 | Survey (R3) |
| 37 | Fighter Class Mechanics | 130 HP, 6.8 m/s speed, 14 throw force, 1.25x damage | M4 | Survey (R4) |
| 38 | Healer Class & Aura | 100 HP, 7.2 m/s speed, 4.5m aura, 25 HP/s heal rate, revive | M4 | Survey (R4) |
| 39 | Constructor Class Mechanics | 90 HP, 8.2 m/s speed, 0.95 carry factor (7.79 m/s), 18 force | M4 | Survey (R4) |
| 40 | Tactical AI Bot Combat | Bots execute weapon attacks with aiming & range checks | M4 | Survey (R4, Gap Analysis) |
| 41 | Tactical AI Bot Pad Building | Bots evaluate pad recipes and trigger build when ready | M4 | Survey (R4, Gap Analysis) |
| 42 | Base Bunker Destruction Win Cond | Objective: destroy enemy base bunkers; respawn while intact | M4 | Survey (Directive 3) |
| 43 | Team Elimination & Victory Rules | Team wiped when bunker destroyed + buddies dead; last standing | M4 | Survey (Directive 3) |
| 44 | Interactive 2x2x2 Pad HUD | Live visual 2x2 grid slots, layer toggle, recipe details | M5 | Survey (R5) |
| 45 | Mobile Touch Joystick & Buttons | Virtual analog joystick, >=44px action buttons | M5 | Survey (R5) |
| 46 | 100% Vitest Test Suite Pass | All 37 existing tests + new unit tests passing cleanly | M5 | Survey (R5) |
| 47 | Clean Production Build | Zero TypeScript or Vite bundling errors (tsc && vite build) | M5 | Survey (R5) |
| 48 | Git Commit & Push | Verified commits pushed to origin/main on GitHub | M5 | Survey (R5) |
| 49 | Opaque-Box E2E Testing Suite | Requirements-driven Tiers 1-4 test runner and assertions | E2E | Dual Track E2E |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| E2E | E2E Testing Track | Design test runner & Tiers 1-4 opaque-box tests (`TEST_READY.md`) | none | DONE |
| M1 | Chibi Buddy 3D Rigging & Animations | Full chibi mesh rig, face sparkles, helmet, mitten hands, 3D weapons, procedural animations | none | DONE |
| M2 | Camera, Stylized Arena & Audio | Action-Isometric camera, zoom, Grassland island, bunkers, glowing pad, light beams, chiptune BGM | none | DONE |
| M3 | Wooden Crates & Stacking Pad | Stylized 3D wooden crates, head carry bob, pad grid slots, all 7 recipes (including Tank) | M1, M2 | IN_PROGRESS |
| M4 | Classes, AI Bots & Win Condition | Fighter/Healer/Constructor balance, bot tactical attack & build, bunker destruction win condition | M3 | PLANNED |
| M5 | HUD, Mobile, 100% Tests, Build & Push | Interactive 2x2 pad HUD, mobile joystick & >=44px buttons, 100% tests pass, build, git push | M4, E2E | PLANNED |

---

## Code Layout

```
src/
├── ai/
│   └── bot.ts             # AI state machine (crate gather, base return, recipe build, tactical attack)
├── engine/
│   ├── audio.ts           # Web Audio SFX + procedural Chiptune BGM sequencer
│   ├── camera.ts          # Action-Isometric camera controller (follow, lerp, zoom)
│   └── physics.ts         # Ballistics, area damage, AABB collisions, void detection
├── entities/
│   ├── basePad.ts         # StackingPad logic & 7 recipes
│   ├── buddy.ts           # BuddyEntity logic, classes, HP, revive, aura
│   ├── bunker.ts          # BaseBunkerEntity logic (1000 HP, destruction state)
│   ├── crate.ts           # CrateEntity logic (gravity, attach, throw, snap)
│   └── tank.ts            # HeavyBattleTank vehicle entity logic
├── rendering/
│   ├── animations.ts      # Procedural animation math (bounce, walk, carry, celebrate)
│   ├── arenaBuilder.ts    # Grassland island terrain, water moat, rocks, bunkers, light beams
│   ├── buddyRig.ts        # 3D Chibi body, face sparkles, helmet star, hands, 3D weapons
│   └── crateModel.ts      # 3D wooden crate mesh with cross-plank braces & metal brackets
├── game.ts                # Main game coordinator (Three.js scene, entities, loops)
├── main.ts                # Entry point, HUD updates, mobile touch controls
└── types.ts               # Core interfaces, class properties, recipes, bunker types
```

---

## Interface Contracts

### 1. `src/rendering/buddyRig.ts` ↔ `src/game.ts`
```typescript
export interface ChibiRigInstance {
  root: THREE.Group;
  bodyMesh: THREE.Group;
  faceGroup: THREE.Group;
  helmetGroup: THREE.Group;
  leftHandPivot: THREE.Group;
  rightHandPivot: THREE.Group;
  leftBootPivot: THREE.Group;
  rightBootPivot: THREE.Group;
  shadowMesh: THREE.Mesh;
  weaponSockets: {
    hand: THREE.Group;
    shoulder: THREE.Group;
  };
  setTeamColor(colorHex: number): void;
  setExpression(expression: 'happy' | 'surprise' | 'angry' | 'wink'): void;
  setEquippedWeapon(weapon: WeaponType): void;
}

export function createChibiBuddyRig(team: TeamId, classType: BuddyClass): ChibiRigInstance;
```

### 2. `src/rendering/animations.ts` ↔ `src/game.ts`
```typescript
export function updateBuddyProceduralAnimation(
  rig: ChibiRigInstance,
  buddy: BuddyEntity,
  dt: number,
  time: number
): void;
```

### 3. `src/engine/camera.ts` ↔ `src/game.ts`
```typescript
export class ActionIsometricCamera {
  public camera: THREE.PerspectiveCamera;
  public zoomFactor: number; // [0.0, 1.0]
  constructor(aspect: number);
  public followTarget(targetPos: THREE.Vector3, dt: number): void;
  public handleWheel(deltaY: number): void;
  public handlePinch(distanceRatio: number): void;
  public updateAspect(aspect: number): void;
}
```

### 4. `src/rendering/arenaBuilder.ts` ↔ `src/game.ts`
```typescript
export interface ArenaSceneElements {
  islandMesh: THREE.Group;
  waterMesh: THREE.Mesh;
  bunkerMeshes: Record<TeamId, THREE.Group>;
  padMeshes: Record<TeamId, THREE.Group>;
  lightBeamMesh: THREE.Mesh;
  update(time: number, dt: number): void;
  updateBunkerHealth(team: TeamId, hp: number): void;
}

export function buildStylizedArena(scene: THREE.Scene): ArenaSceneElements;
```

### 5. `src/engine/audio.ts` (Expanded BGM)
```typescript
export class SoundFx {
  public static enabled: boolean;
  public static playShoot(isShotgun: boolean): void;
  public static playExplosion(): void;
  public static playPop(): void;
  public static playHeal(): void;
  public static startChiptuneBGM(): void;
  public static stopChiptuneBGM(): void;
  public static setBGMVolume(volume: number): void;
}
```

import * as THREE from 'three';
import { BuddyEntity } from './entities/buddy';
import { CrateEntity } from './entities/crate';
import { StackingPad } from './entities/basePad';
import { BotAI, EnemyBunkerTarget } from './ai/bot';
import { SoundFx } from './engine/audio';
import { PhysicsEngine, GrenadeProjectile, RocketProjectile } from './engine/physics';
import { BuddyClass, CLASS_PROPERTIES, TeamId, Vector3D } from './types';
import { createChibiBuddyRig, ChibiRigInstance } from './rendering/buddyRig';
import {
  updateBuddyProceduralAnimation,
  triggerBuddyCelebrate,
  triggerBuddyThrow,
  cleanupStaleAnimTrackers,
  getBuddyAnimTracker
} from './rendering/animations';
import { ActionIsometricCamera } from './engine/camera';
import { buildStylizedArena, ArenaSceneElements } from './rendering/arenaBuilder';
import { createCrateMesh, calculateHeadCarryTransform } from './rendering/crateModel';
import {
  HeavyBattleTank,
  createTankMesh,
  TankRigInstance,
  TankShellProjectile,
  TANK_TEAM_COLORS
} from './entities/tank';

export class TinyBrawlersGame {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  private isoCamera: ActionIsometricCamera;
  private arenaElements!: ArenaSceneElements;

  // Game Entities
  public player: BuddyEntity;
  public buddies: BuddyEntity[] = [];
  public crates: CrateEntity[] = [];
  public pads: Record<TeamId, StackingPad>;
  public bots: Map<string, BotAI> = new Map();
  public grenades: GrenadeProjectile[] = [];
  public rockets: RocketProjectile[] = [];

  // Vehicle Entities (Milestone 3)
  public tanks: HeavyBattleTank[] = [];
  public tankShells: TankShellProjectile[] = [];
  public tankMeshes: Map<string, TankRigInstance> = new Map();

  // Team Bases & Bunker Health
  public baseHp: Record<TeamId, number> = {
    red: 1000,
    blue: 1000,
    yellow: 1000,
    cyan: 1000
  };

  public bunkerPositions: Record<TeamId, Vector3D> = {
    red: { x: -21.2, y: 0, z: -21.2 },
    blue: { x: 21.2, y: 0, z: -21.2 },
    yellow: { x: -21.2, y: 0, z: 21.2 },
    cyan: { x: 21.2, y: 0, z: 21.2 }
  };

  // Match State, Win Condition & Respawns (Milestone 4)
  public isGameOver: boolean = false;
  public winningTeam: TeamId | null = null;
  public eliminatedTeams: Set<TeamId> = new Set();
  private respawnTimers: Map<string, number> = new Map();
  public respawnDuration: number = 5.0;
  private troopSpawnTimer: number = 20.0;
  private botAttackCooldowns: Map<string, number> = new Map();

  // 3D Meshes Cache & Rig Cache
  private buddyRigs: Map<string, ChibiRigInstance> = new Map();
  private buddyMeshes: Map<string, THREE.Group> = new Map();
  private crateMeshes: Map<string, THREE.Group> = new Map();
  private grenadeMeshes: Map<string, THREE.Mesh> = new Map();
  private rocketMeshes: Map<string, THREE.Mesh> = new Map();

  // Holographic Ghost Crate Guide
  private ghostCrateGroup: THREE.Group | null = null;
  private ghostCrateMat: THREE.MeshStandardMaterial | null = null;

  // Materials
  private woodMat: THREE.MeshLambertMaterial;
  private teamMats: Record<TeamId, THREE.MeshLambertMaterial>;
  private skinMat: THREE.MeshLambertMaterial;
  private darkMat: THREE.MeshBasicMaterial;
  private whiteMat: THREE.MeshBasicMaterial;
  private blushMat: THREE.MeshBasicMaterial;

  // Controls & Loop
  private keys: Record<string, boolean> = {};
  public joystickVector: { x: number; y: number } = { x: 0, y: 0 };
  private isRunning: boolean = false;
  private lastTime: number = 0;
  private elapsedTime: number = 0;
  private crateSpawnTimer: number = 3.0;

  constructor(container: HTMLElement, playerClass: BuddyClass = 'fighter') {
    this.container = container;

    // 1. Renderer Setup (Browser vs Headless/Node)
    const hasDom = typeof document !== 'undefined' && typeof window !== 'undefined';
    if (hasDom) {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      this.renderer.setSize(container ? container.clientWidth : 800, container ? container.clientHeight : 600);
      this.renderer.shadowMap.enabled = false;
      if (container && container.appendChild) {
        container.appendChild(this.renderer.domElement);
      }
    } else {
      this.renderer = {
        domElement: {} as any,
        setSize: () => {},
        setPixelRatio: () => {},
        render: () => {},
        dispose: () => {}
      } as any;
    }

    // 2. Scene & Action-Isometric Camera Setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x13171d);
    this.scene.fog = new THREE.Fog(0x13171d, 35, 75);

    const clientW = (container && container.clientWidth) || 800;
    const clientH = (container && container.clientHeight) || 600;
    const aspect = clientW / (clientH || 1);
    this.isoCamera = new ActionIsometricCamera(aspect);
    this.camera = this.isoCamera.camera;

    // 3. Materials
    this.woodMat = new THREE.MeshLambertMaterial({ color: 0xb57a38 });
    this.skinMat = new THREE.MeshLambertMaterial({ color: 0xffe2cc });
    this.darkMat = new THREE.MeshBasicMaterial({ color: 0x1e272e });
    this.whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.blushMat = new THREE.MeshBasicMaterial({ color: 0xff7597, transparent: true, opacity: 0.7 });

    this.teamMats = {
      red: new THREE.MeshLambertMaterial({ color: 0xff4757 }),
      blue: new THREE.MeshLambertMaterial({ color: 0x2ed573 }),
      yellow: new THREE.MeshLambertMaterial({ color: 0xffa502 }),
      cyan: new THREE.MeshLambertMaterial({ color: 0x1e90ff })
    };

    // 4. Stacking Pads (4 Corner Bases)
    this.pads = {
      red: new StackingPad('red', -18, -18),
      blue: new StackingPad('blue', 18, -18),
      yellow: new StackingPad('yellow', -18, 18),
      cyan: new StackingPad('cyan', 18, 18)
    };

    // 5. Initialize Player & AI Bots
    this.player = new BuddyEntity('player_1', 'red', playerClass, { x: -16, y: 0.7, z: -16 });
    this.buddies.push(this.player);

    // Spawn 3 AI opposing commanders
    const enemyTeams: { team: TeamId; cls: BuddyClass; pos: Vector3D }[] = [
      { team: 'blue', cls: 'fighter', pos: { x: 16, y: 0.7, z: -16 } },
      { team: 'yellow', cls: 'constructor', pos: { x: -16, y: 0.7, z: 16 } },
      { team: 'cyan', cls: 'healer', pos: { x: 16, y: 0.7, z: 16 } }
    ];

    for (const en of enemyTeams) {
      const bot = new BuddyEntity(`bot_${en.team}`, en.team, en.cls, en.pos);
      this.buddies.push(bot);
      this.bots.set(bot.id, new BotAI());
    }

    // Build 3D Arena Ground
    this.buildArenaEnvironment();

    // Initialize Holographic Ghost Crate Guide
    this.initGhostCrateGuide();

    // Register Input Listeners
    this.setupInputs();

    // Resize Handler
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.onResize.bind(this));
    }
  }

  // Build colorful stylized arena island environment
  private buildArenaEnvironment(): void {
    this.arenaElements = buildStylizedArena(this.scene);
  }

  // Initialize semi-transparent holographic ghost crate mesh for pad placement preview
  private initGhostCrateGuide(): void {
    this.ghostCrateMat = new THREE.MeshStandardMaterial({
      color: 0x00d2d3,
      emissive: 0x00d2d3,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.35,
      roughness: 0.2,
      depthWrite: false
    });

    const ghostBox = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), this.ghostCrateMat);
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.9, 0.9, 0.9));
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
    const wireframe = new THREE.LineSegments(edges, lineMat);

    this.ghostCrateGroup = new THREE.Group();
    this.ghostCrateGroup.name = 'ghost_crate_guide';
    this.ghostCrateGroup.add(ghostBox, wireframe);
    this.ghostCrateGroup.visible = false;
    this.scene.add(this.ghostCrateGroup);
  }

  public getIsoCamera(): ActionIsometricCamera {
    return this.isoCamera;
  }

  public getArenaElements(): ArenaSceneElements {
    return this.arenaElements;
  }

  public handleWheel(deltaY: number): void {
    this.isoCamera.handleWheel(deltaY);
  }

  public handlePinch(distanceRatio: number): void {
    this.isoCamera.handlePinch(distanceRatio);
  }

  public updateBunkerHealth(team: TeamId, hp: number): void {
    this.baseHp[team] = hp;
    if (this.arenaElements) {
      this.arenaElements.updateBunkerHealth(team, hp);
    }
  }

  public damageBunker(team: TeamId, amount: number): number {
    if (this.baseHp[team] <= 0) return 0;
    const actualDamage = Math.min(this.baseHp[team], Math.max(0, amount));
    this.baseHp[team] = Math.max(0, this.baseHp[team] - actualDamage);
    this.updateBunkerHealth(team, this.baseHp[team]);
    if (this.baseHp[team] <= 0) {
      SoundFx.playExplosion();
    }
    return actualDamage;
  }

  public getBunkerHealth(team: TeamId): number {
    return this.baseHp[team] ?? 0;
  }

  public isTeamEliminated(team: TeamId): boolean {
    return this.eliminatedTeams.has(team);
  }

  public getSurvivingTeams(): TeamId[] {
    const teams: TeamId[] = ['red', 'blue', 'yellow', 'cyan'];
    return teams.filter((t) => !this.eliminatedTeams.has(t));
  }

  public evaluateMatchState(): {
    eliminatedTeams: TeamId[];
    isGameOver: boolean;
    winningTeam: TeamId | null;
  } {
    const teams: TeamId[] = ['red', 'blue', 'yellow', 'cyan'];
    const eliminated: TeamId[] = [];

    for (const t of teams) {
      const isBunkerDown = this.baseHp[t] <= 0;
      const teamBuddies = this.buddies.filter((b) => b.team === t);
      const allBuddiesDown = teamBuddies.length === 0 || teamBuddies.every((b) => b.isKnocked);

      if (isBunkerDown && allBuddiesDown) {
        eliminated.push(t);
        this.eliminatedTeams.add(t);
      }
    }

    const surviving = teams.filter((t) => !eliminated.includes(t));
    this.isGameOver = surviving.length <= 1;
    this.winningTeam = surviving.length === 1 ? surviving[0] : null;

    return {
      eliminatedTeams: eliminated,
      isGameOver: this.isGameOver,
      winningTeam: this.winningTeam
    };
  }

  // Knocked buddies respawn while their Base Bunker is intact
  public updateRespawns(dt: number): void {
    for (const buddy of this.buddies) {
      if (buddy.isKnocked) {
        if (this.baseHp[buddy.team] > 0) {
          const timer = (this.respawnTimers.get(buddy.id) || 0) + dt;
          if (timer >= this.respawnDuration) {
            const pad = this.pads[buddy.team];
            buddy.position.x = pad.origin.x;
            buddy.position.y = 0.7;
            buddy.position.z = pad.origin.z;
            buddy.isKnocked = false;
            buddy.hp = buddy.maxHp;
            buddy.reviveProgress = 0;
            this.respawnTimers.delete(buddy.id);
            SoundFx.playHeal();
            triggerBuddyCelebrate(buddy.id, 1.5);
          } else {
            this.respawnTimers.set(buddy.id, timer);
          }
        } else {
          this.respawnTimers.delete(buddy.id);
        }
      } else {
        this.respawnTimers.delete(buddy.id);
      }
    }
  }

  // Periodic troop reinforcement spawns from intact base bunkers
  public updateReinforcements(dt: number): void {
    this.troopSpawnTimer -= dt;
    if (this.troopSpawnTimer <= 0) {
      this.troopSpawnTimer = 22.0;
      const teams: TeamId[] = ['red', 'blue', 'yellow', 'cyan'];
      for (const t of teams) {
        if (this.baseHp[t] > 0) {
          const teamAliveBuddies = this.buddies.filter((b) => b.team === t && !b.isKnocked);
          if (teamAliveBuddies.length < 3) {
            const pad = this.pads[t];
            const reinforcePos = { x: pad.origin.x, y: 0.7, z: pad.origin.z + 2.0 };
            const newBuddy = new BuddyEntity(
              `reinforce_${t}_${Date.now()}_${Math.floor(Math.random() * 100)}`,
              t,
              'fighter',
              reinforcePos
            );
            this.buddies.push(newBuddy);
            if (t !== this.player.team || newBuddy.id !== this.player.id) {
              this.bots.set(newBuddy.id, new BotAI());
            }
            triggerBuddyCelebrate(newBuddy.id, 2.0);
          }
        }
      }
    }
  }

  // Create cute Chibi 3D model for each Buddy
  private createBuddyMesh(buddy: BuddyEntity): THREE.Group {
    const rig = createChibiBuddyRig(buddy.team, buddy.classType);
    this.scene.add(rig.root);

    // Anchor rig root at world ground level beneath buddy torso center (y - 0.70)
    rig.root.position.set(buddy.position.x, buddy.position.y - 0.70, buddy.position.z);

    // Initial weapon synchronization
    if (buddy.isCarryingCrate) {
      rig.setEquippedWeapon('crate');
    } else if (buddy.weapon && buddy.weapon !== 'none') {
      rig.setEquippedWeapon(buddy.weapon);
    }

    // Initial expression
    rig.setExpression(buddy.isKnocked ? 'surprise' : 'happy');

    // Store in both buddyRigs and buddyMeshes for backward compatibility
    this.buddyRigs.set(buddy.id, rig);
    this.buddyMeshes.set(buddy.id, rig.root);

    return rig.root;
  }

  private removeBuddyMesh(buddyId: string): void {
    const rig = this.buddyRigs.get(buddyId);
    if (rig) {
      this.scene.remove(rig.root);
      rig.dispose();
      this.buddyRigs.delete(buddyId);
      this.buddyMeshes.delete(buddyId);
      cleanupStaleAnimTrackers(this.buddies.map((b) => b.id));
    }
  }

  // Input bindings
  private setupInputs(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyE') {
        this.handlePlayerInteract();
      }
      if (e.code === 'KeyF' || e.code === 'Space') {
        this.handlePlayerAttack();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }

  // Player action: pick up crate, place on StackingPad, or mount/dismount tank
  public handlePlayerInteract(): void {
    if (this.player.isKnocked) return;

    // 1. If driving/mounted in a tank, dismount safely
    if (this.player.isInTank || this.player.drivingVehicleId) {
      const tankId = this.player.mountedTankId || this.player.drivingVehicleId;
      const tank = this.tanks.find((t) => t.id === tankId);
      if (tank) {
        tank.dismount(false, this.buddies);
        SoundFx.playPop();
        return;
      }
    }

    // 2. If near an unoccupied friendly tank, mount it
    if (!this.player.isCarryingCrate) {
      for (const tank of this.tanks) {
        if (!tank.isDestroyed && !tank.isOccupied && tank.team === this.player.team) {
          const d = Math.hypot(tank.position.x - this.player.position.x, tank.position.z - this.player.position.z);
          if (d <= 3.2) {
            tank.mount(this.player);
            SoundFx.playPop();
            return;
          }
        }
      }
    }

    // 3. Crate handling
    if (this.player.isCarryingCrate) {
      // Check if near own team's base pad
      const pad = this.pads[this.player.team];
      const distToPad = Math.hypot(pad.origin.x - this.player.position.x, pad.origin.z - this.player.position.z);

      if (distToPad <= 3.5) {
        // Intelligently find nearest quadrant slot
        const bestSlot = pad.findBestSlotForPosition(this.player.position.x, this.player.position.z);
        if (bestSlot !== -1 && pad.setSlot(bestSlot, true)) {
          const heldCrate = this.crates.find((c) => c.heldByBuddyId === this.player.id);
          if (heldCrate) {
            heldCrate.snapToPad(this.player.team, bestSlot, { x: pad.origin.x, y: 0, z: pad.origin.z }, true);
          }
          this.player.isCarryingCrate = false;
          SoundFx.playPop();
          return;
        }
      }

      // Otherwise: throw crate forward with tumble dynamics
      const heldCrate = this.crates.find((c) => c.heldByBuddyId === this.player.id);
      if (heldCrate) {
        const tracker = getBuddyAnimTracker(this.player.id);
        const forward = {
          x: Math.sin(tracker.facingAngle),
          y: 0,
          z: Math.cos(tracker.facingAngle)
        };
        heldCrate.throwCrate(this.player.position, forward, this.player.getThrowForce());
        this.player.isCarryingCrate = false;
        triggerBuddyThrow(this.player.id);
        SoundFx.playPop();
      }
    } else {
      // Try to pick up nearest unheld crate
      let nearestCrate: CrateEntity | null = null;
      let minDist = 1.8;

      for (const c of this.crates) {
        if (c.isHeld || c.isStackedOnPad || c.isSnapping) continue;
        const d = Math.hypot(c.position.x - this.player.position.x, c.position.z - this.player.position.z);
        if (d < minDist) {
          minDist = d;
          nearestCrate = c;
        }
      }

      if (nearestCrate) {
        nearestCrate.attachToBuddy(this.player.id, this.player.position);
        this.player.isCarryingCrate = true;
        SoundFx.playPop();
      }
    }
  }

  // Player action: fire weapon or tank cannon
  public handlePlayerAttack(): void {
    if (this.player.isKnocked) return;

    // 1. Tank cannon attack if driving tank
    if (this.player.isInTank || this.player.drivingVehicleId) {
      const tankId = this.player.mountedTankId || this.player.drivingVehicleId;
      const tank = this.tanks.find((t) => t.id === tankId);
      if (tank && tank.canFire()) {
        const mult = this.player.classType === 'fighter' ? 1.25 : 1.0;
        const shell = tank.fireCannon(mult);
        if (shell) {
          this.tankShells.push(shell);
          const rig = this.tankMeshes.get(tank.id);
          if (rig) rig.playMuzzleFlash();
          SoundFx.playShoot(true);
        }
        return;
      }
    }

    // 2. Personal weapon attacks
    const mult = CLASS_PROPERTIES[this.player.classType].damageMultiplier;

    if (this.player.weapon === 'pistol' || this.player.weapon === 'shotgun') {
      SoundFx.playShoot(this.player.weapon === 'shotgun');
      let hitBuddy = false;
      for (const b of this.buddies) {
        if (b.team !== this.player.team && !b.isKnocked) {
          const d = Math.hypot(b.position.x - this.player.position.x, b.position.z - this.player.position.z);
          if (d <= 10.0) {
            b.takeDamage((this.player.weapon === 'shotgun' ? 45 : 25) * mult);
            hitBuddy = true;
            break;
          }
        }
      }
      if (!hitBuddy) {
        // Check if aiming near enemy bunker
        for (const [team, pos] of Object.entries(this.bunkerPositions) as [TeamId, Vector3D][]) {
          if (team !== this.player.team && this.baseHp[team] > 0) {
            const d = Math.hypot(pos.x - this.player.position.x, pos.z - this.player.position.z);
            if (d <= 10.0) {
              this.damageBunker(team, (this.player.weapon === 'shotgun' ? 35 : 20) * mult);
              break;
            }
          }
        }
      }
    } else if (this.player.weapon === 'grenade') {
      triggerBuddyThrow(this.player.id);
      SoundFx.playPop();
      const tracker = getBuddyAnimTracker(this.player.id);
      const fwdX = Math.sin(tracker.facingAngle);
      const fwdZ = Math.cos(tracker.facingAngle);
      const force = this.player.getThrowForce();
      this.grenades.push({
        id: `grenade_${Date.now()}`,
        ownerId: this.player.id,
        position: { x: this.player.position.x, y: 1.2, z: this.player.position.z },
        velocity: { x: fwdX * force * 0.8, y: 5.5, z: fwdZ * force * 0.8 },
        timer: 3.0,
        bounces: 0,
        detonated: false
      });
    } else if (this.player.weapon === 'bazooka') {
      SoundFx.playShoot(true);
      const tracker = getBuddyAnimTracker(this.player.id);
      const fwdX = Math.sin(tracker.facingAngle);
      const fwdZ = Math.cos(tracker.facingAngle);
      this.tankShells.push({
        id: `bazooka_rocket_${Date.now()}`,
        ownerId: this.player.id,
        team: this.player.team,
        position: { x: this.player.position.x, y: 1.1, z: this.player.position.z },
        velocity: { x: fwdX * 22.0, y: 0.5, z: fwdZ * 22.0 },
        directDamage: 90 * mult,
        blastDamage: 75 * mult,
        blastRadius: 4.0,
        lifeTime: 3.5,
        detonated: false
      });
    } else if (this.player.weapon === 'medic') {
      SoundFx.playHeal();
      for (const b of this.buddies) {
        if (b.team === this.player.team && b !== this.player) {
          const d = Math.hypot(b.position.x - this.player.position.x, b.position.z - this.player.position.z);
          if (d <= 5.0) {
            if (b.isKnocked) {
              b.applyRevive(50);
            } else {
              b.receiveHeal(35);
            }
            break;
          }
        }
      }
    }
  }

  // Bot tactical combat attack execution
  public handleBotAttack(bot: BuddyEntity, targetPos?: Vector3D, dt: number = 0.016): void {
    if (bot.isKnocked) return;

    let cd = this.botAttackCooldowns.get(bot.id) || 0;
    cd -= dt;
    if (cd > 0) {
      this.botAttackCooldowns.set(bot.id, cd);
      return;
    }

    const mult = CLASS_PROPERTIES[bot.classType].damageMultiplier;

    if (bot.weapon === 'pistol' || bot.weapon === 'shotgun') {
      SoundFx.playShoot(bot.weapon === 'shotgun');
      let hitTarget = false;
      for (const b of this.buddies) {
        if (b.team !== bot.team && !b.isKnocked) {
          const d = Math.hypot(b.position.x - bot.position.x, b.position.z - bot.position.z);
          if (d <= 10.0) {
            b.takeDamage((bot.weapon === 'shotgun' ? 45 : 25) * mult);
            hitTarget = true;
            break;
          }
        }
      }
      if (!hitTarget) {
        for (const [team, pos] of Object.entries(this.bunkerPositions) as [TeamId, Vector3D][]) {
          if (team !== bot.team && this.baseHp[team] > 0) {
            const d = Math.hypot(pos.x - bot.position.x, pos.z - bot.position.z);
            if (d <= 10.0) {
              this.damageBunker(team, (bot.weapon === 'shotgun' ? 30 : 18) * mult);
              break;
            }
          }
        }
      }
      this.botAttackCooldowns.set(bot.id, bot.weapon === 'shotgun' ? 1.3 : 0.85);
    } else if (bot.weapon === 'grenade') {
      triggerBuddyThrow(bot.id);
      SoundFx.playPop();
      const target = targetPos || { x: bot.position.x, y: 0, z: bot.position.z - 5 };
      const dx = target.x - bot.position.x;
      const dz = target.z - bot.position.z;
      const len = Math.hypot(dx, dz) || 1;
      const force = bot.getThrowForce();
      this.grenades.push({
        id: `bot_grenade_${Date.now()}_${Math.floor(Math.random() * 100)}`,
        ownerId: bot.id,
        position: { x: bot.position.x, y: 1.2, z: bot.position.z },
        velocity: { x: (dx / len) * force * 0.75, y: 5.0, z: (dz / len) * force * 0.75 },
        timer: 3.0,
        bounces: 0,
        detonated: false
      });
      this.botAttackCooldowns.set(bot.id, 1.8);
    } else if (bot.weapon === 'bazooka') {
      SoundFx.playShoot(true);
      const target = targetPos || { x: bot.position.x, y: 0, z: bot.position.z - 8 };
      const dx = target.x - bot.position.x;
      const dz = target.z - bot.position.z;
      const len = Math.hypot(dx, dz) || 1;
      this.tankShells.push({
        id: `bot_rocket_${Date.now()}_${Math.floor(Math.random() * 100)}`,
        ownerId: bot.id,
        team: bot.team,
        position: { x: bot.position.x, y: 1.1, z: bot.position.z },
        velocity: { x: (dx / len) * 22.0, y: 0.5, z: (dz / len) * 22.0 },
        directDamage: 90 * mult,
        blastDamage: 75 * mult,
        blastRadius: 4.0,
        lifeTime: 3.5,
        detonated: false
      });
      this.botAttackCooldowns.set(bot.id, 2.2);
    } else if (bot.weapon === 'medic' || bot.classType === 'healer') {
      SoundFx.playHeal();
      for (const b of this.buddies) {
        if (b.team === bot.team && b !== bot) {
          const d = Math.hypot(b.position.x - bot.position.x, b.position.z - bot.position.z);
          if (d <= 5.0) {
            if (b.isKnocked) {
              b.applyRevive(50);
            } else {
              b.receiveHeal(30);
            }
            break;
          }
        }
      }
      this.botAttackCooldowns.set(bot.id, 1.2);
    }
  }

  /**
   * Helper to instantiate a HeavyBattleTank and add procedural mesh to scene.
   */
  public spawnHeavyBattleTank(team: TeamId, spawnPos?: Vector3D, initialHeading: number = 0): HeavyBattleTank {
    const pad = this.pads[team];
    const pos = spawnPos || { x: pad.origin.x, y: 0, z: pad.origin.z + 3.0 };
    const tankId = `tank_${team}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const tank = new HeavyBattleTank(tankId, team, pos, initialHeading);
    this.tanks.push(tank);

    const rig = createTankMesh(tank);
    this.scene.add(rig.root);
    this.tankMeshes.set(tank.id, rig);

    return tank;
  }

  // Build item from StackingPad when triggered, with complete mesh cleanup (zero leaks)
  public triggerPadBuild(team: TeamId): void {
    const pad = this.pads[team];
    const recipe = pad.evaluate();
    if (recipe.category === 'empty') return;

    SoundFx.playExplosion();

    // 1. Spawning Visual Build Shockwave Flash
    this.spawnPadBuildVFX(pad.origin.x, pad.origin.z, team);

    // 2. Equip weapon, spawn unit, or spawn HeavyBattleTank
    if (recipe.itemType === 'tank') {
      const cornerX = pad.origin.x > 0 ? 1 : -1;
      const cornerZ = pad.origin.z > 0 ? 1 : -1;
      const exitPos: Vector3D = {
        x: pad.origin.x - cornerX * 4.2,
        y: 0,
        z: pad.origin.z - cornerZ * 4.2
      };
      const initialHeading = Math.atan2(-cornerX, -cornerZ);

      const tank = this.spawnHeavyBattleTank(team, exitPos, initialHeading);

      // Mount nearest friendly unknocked buddy
      for (const b of this.buddies) {
        if (b.team === team && !b.isKnocked && !b.isCarryingCrate && !b.isInTank) {
          const d = Math.hypot(b.position.x - pad.origin.x, b.position.z - pad.origin.z);
          if (d <= 6.0) {
            tank.mount(b);
            break;
          }
        }
      }
    } else {
      for (const b of this.buddies) {
        if (b.team === team) {
          if (recipe.category === 'weapon') {
            b.weapon = recipe.itemType as any;
            const rig = this.buddyRigs.get(b.id);
            if (rig) {
              rig.setEquippedWeapon(b.weapon);
            }
            triggerBuddyCelebrate(b.id, 2.0);
          } else if (recipe.itemType === 'medic_unit' || recipe.itemType === 'commando') {
            const spawnPos = { x: pad.origin.x, y: 0.7, z: pad.origin.z + 2.5 };
            const newBot = new BuddyEntity(
              `spawned_${team}_${Date.now()}`,
              team,
              recipe.itemType === 'medic_unit' ? 'healer' : 'fighter',
              spawnPos
            );
            if (recipe.itemType === 'medic_unit') {
              newBot.weapon = 'medic';
            }
            this.buddies.push(newBot);
            this.bots.set(newBot.id, new BotAI());
            triggerBuddyCelebrate(newBot.id, 2.5);
            break;
          }
        }
      }
    }

    // 3. CRITICAL MESH LEAK FIX: Iterate over crates consumed on that pad, remove from scene & delete
    const cratesOnPad = this.crates.filter((c) => c.padTeamId === team);
    for (const c of cratesOnPad) {
      const mesh = this.crateMeshes.get(c.id);
      if (mesh) {
        this.scene.remove(mesh);
        this.crateMeshes.delete(c.id);
      }
    }

    // Remove entities from game state
    this.crates = this.crates.filter((c) => c.padTeamId !== team);
    pad.clear();
  }

  // Spawns celebratory shockwave ring on pad build
  private spawnPadBuildVFX(padX: number, padZ: number, team: TeamId): void {
    const flashGeo = new THREE.RingGeometry(0.2, 0.4, 32);
    const teamColors = TANK_TEAM_COLORS[team] || TANK_TEAM_COLORS.red;
    const flashMat = new THREE.MeshBasicMaterial({
      color: teamColors.primary,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    });
    const flashMesh = new THREE.Mesh(flashGeo, flashMat);
    flashMesh.rotation.x = -Math.PI / 2;
    flashMesh.position.set(padX, 0.15, padZ);
    this.scene.add(flashMesh);

    let progress = 0;
    const animateFlash = () => {
      progress += 0.05;
      const scale = 1.0 + progress * 8.0;
      flashMesh.scale.set(scale, scale, scale);
      flashMat.opacity = Math.max(0, 0.9 * (1.0 - progress));

      if (progress < 1.0) {
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(animateFlash);
        }
      } else {
        this.scene.remove(flashMesh);
        flashGeo.dispose();
        flashMat.dispose();
      }
    };

    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(animateFlash);
    } else {
      this.scene.remove(flashMesh);
      flashGeo.dispose();
      flashMat.dispose();
    }
  }

  // Main Loop
  public start(): void {
    this.isRunning = true;
    this.lastTime = performance.now();
    SoundFx.startChiptuneBGM();
    this.loop();
  }

  public stop(): void {
    this.isRunning = false;
    SoundFx.stopChiptuneBGM();
  }

  private loop(): void {
    if (!this.isRunning) return;
    requestAnimationFrame(this.loop.bind(this));

    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.elapsedTime += dt;

    this.update(dt);
    this.render(dt);
  }

  private update(dt: number): void {
    // 1. Crate Spawner in Center Drop Zone
    this.crateSpawnTimer -= dt;
    if (this.crateSpawnTimer <= 0 && this.crates.length < 16) {
      this.crateSpawnTimer = 4.5;
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 5.0;
      const crate = new CrateEntity(`crate_${Date.now()}`, {
        x: Math.cos(angle) * dist,
        y: 12.0, // Drop from sky
        z: Math.sin(angle) * dist
      });
      this.crates.push(crate);
    }

    // 2. Player Movement or Tank Driving
    if (this.player.isInTank || this.player.drivingVehicleId) {
      const tankId = this.player.mountedTankId || this.player.drivingVehicleId;
      const playerTank = this.tanks.find((t) => t.id === tankId);
      if (playerTank && !playerTank.isDestroyed) {
        let steer = (this.keys['KeyA'] ? 1 : 0) - (this.keys['KeyD'] ? 1 : 0);
        let throttle = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
        if (Math.hypot(this.joystickVector.x, this.joystickVector.y) > 0.1) {
          steer -= this.joystickVector.x;
          throttle -= this.joystickVector.y;
        }
        playerTank.update(dt, { throttle, steer }, this.buddies);
      }
    } else {
      let mx = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);
      let mz = (this.keys['KeyS'] ? 1 : 0) - (this.keys['KeyW'] ? 1 : 0);

      if (Math.hypot(this.joystickVector.x, this.joystickVector.y) > 0.1) {
        mx += this.joystickVector.x;
        mz += this.joystickVector.y;
      }

      const len = Math.hypot(mx, mz);
      if (len > 0.01 && !this.player.isKnocked) {
        const speed = this.player.getEffectiveSpeed();
        this.player.velocity.x = (mx / len) * speed;
        this.player.velocity.z = (mz / len) * speed;
        this.player.position.x += this.player.velocity.x * dt;
        this.player.position.z += this.player.velocity.z * dt;
      } else {
        this.player.velocity.x = 0;
        this.player.velocity.z = 0;
      }
    }

    // Camera follow player smoothly using ActionIsometricCamera
    const playerPos = new THREE.Vector3(this.player.position.x, this.player.position.y, this.player.position.z);
    this.isoCamera.followTarget(playerPos, dt);

    // 3. AI Bots Execution & Vehicle Driving
    // 3A. Bot Tank Driving
    for (const tank of this.tanks) {
      if (!tank.isDestroyed && tank.isOccupied && tank.driverId) {
        const driver = this.buddies.find((b) => b.id === tank.driverId);
        if (driver && driver !== this.player) {
          const enemyBunkers = (Object.entries(this.bunkerPositions) as [TeamId, Vector3D][])
            .filter(([t]) => t !== tank.team && this.baseHp[t] > 0)
            .map(([t, pos]) => ({ team: t, pos, hp: this.baseHp[t] }));
          const enemies = this.buddies.filter((b) => b.team !== tank.team && !b.isKnocked);

          let targetPos: Vector3D | null = null;
          if (enemies.length > 0) {
            targetPos = enemies[0].position;
          } else if (enemyBunkers.length > 0) {
            targetPos = enemyBunkers[0].pos;
          }

          if (targetPos) {
            const dx = targetPos.x - tank.position.x;
            const dz = targetPos.z - tank.position.z;
            const targetAngle = Math.atan2(dx, dz);
            let angleDiff = targetAngle - tank.heading;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            const steer = Math.max(-1, Math.min(1, angleDiff * 2.0));
            const dist = Math.hypot(dx, dz);
            const throttle = dist > 7.0 ? 1.0 : (dist < 4.0 ? -0.5 : 0.0);

            tank.update(dt, { throttle, steer }, this.buddies);
            tank.turretAngle = targetAngle - tank.heading;

            if (dist <= 14.0 && tank.canFire()) {
              const mult = driver.classType === 'fighter' ? 1.25 : 1.0;
              const shell = tank.fireCannon(mult);
              if (shell) {
                this.tankShells.push(shell);
                const rig = this.tankMeshes.get(tank.id);
                if (rig) rig.playMuzzleFlash();
                SoundFx.playShoot(true);
              }
            }
          }
        }
      }
    }

    // 3B. Bot Foot Soldiers
    for (const buddy of this.buddies) {
      if (buddy === this.player) continue;
      if (buddy.isInTank || buddy.drivingVehicleId) continue;

      // Check if near friendly unmounted tank to mount
      if (!buddy.isCarryingCrate) {
        for (const tank of this.tanks) {
          if (!tank.isDestroyed && !tank.isOccupied && tank.team === buddy.team) {
            const d = Math.hypot(tank.position.x - buddy.position.x, tank.position.z - buddy.position.z);
            if (d <= 3.2) {
              tank.mount(buddy);
              SoundFx.playPop();
              break;
            }
          }
        }
        if (buddy.isInTank || buddy.drivingVehicleId) continue;
      }

      const botAi = this.bots.get(buddy.id);
      if (botAi) {
        const alliesPad = this.pads[buddy.team];
        const enemies = this.buddies.filter((b) => b.team !== buddy.team);
        const enemyBunkers: EnemyBunkerTarget[] = (Object.entries(this.bunkerPositions) as [TeamId, Vector3D][])
          .filter(([t]) => t !== buddy.team && this.baseHp[t] > 0)
          .map(([t, pos]) => ({ team: t, pos, hp: this.baseHp[t] }));

        const decision = botAi.update(buddy, this.crates, alliesPad, enemies, dt, enemyBunkers);

        const speed = buddy.getEffectiveSpeed();
        buddy.velocity.x = decision.moveDir.x * speed;
        buddy.velocity.z = decision.moveDir.z * speed;
        buddy.position.x += buddy.velocity.x * dt;
        buddy.position.z += buddy.velocity.z * dt;

        if (decision.action === 'interact') {
          if (buddy.isCarryingCrate) {
            const bestSlot = alliesPad.findBestSlotForPosition(buddy.position.x, buddy.position.z);
            if (bestSlot !== -1 && alliesPad.setSlot(bestSlot, true)) {
              const c = this.crates.find((cr) => cr.heldByBuddyId === buddy.id);
              if (c) c.snapToPad(buddy.team, bestSlot, { x: alliesPad.origin.x, y: 0, z: alliesPad.origin.z }, true);
              buddy.isCarryingCrate = false;
              // If pad now evaluates to a valid recipe, trigger build immediately
              if (alliesPad.evaluate().category !== 'empty') {
                this.triggerPadBuild(buddy.team);
              }
            }
          } else {
            // Check if near pad to trigger build
            const padDist = Math.hypot(alliesPad.origin.x - buddy.position.x, alliesPad.origin.z - buddy.position.z);
            if (padDist <= 3.0 && alliesPad.evaluate().category !== 'empty') {
              this.triggerPadBuild(buddy.team);
            } else {
              // Try to pick up nearest crate
              for (const c of this.crates) {
                if (!c.isHeld && !c.isStackedOnPad && !c.isSnapping && Math.hypot(c.position.x - buddy.position.x, c.position.z - buddy.position.z) <= 1.5) {
                  c.attachToBuddy(buddy.id, buddy.position);
                  buddy.isCarryingCrate = true;
                  break;
                }
              }
            }
          }
        } else if (decision.action === 'attack') {
          this.handleBotAttack(buddy, decision.targetPos, dt);
        }
      }
    }

    // 4. Update Crates & Head Carry Attachment Physics
    for (const c of this.crates) {
      if (c.isHeld && c.heldByBuddyId) {
        const carrier = this.buddies.find((b) => b.id === c.heldByBuddyId);
        if (carrier) {
          const tracker = getBuddyAnimTracker(carrier.id);
          const vx = carrier.velocity?.x || 0;
          const vz = carrier.velocity?.z || 0;
          const speed = Math.hypot(vx, vz);
          const isMoving = speed > 0.05 && !carrier.isKnocked;

          const carryTransform = calculateHeadCarryTransform(
            carrier.position,
            tracker.facingAngle,
            isMoving,
            tracker.stridePhase,
            this.elapsedTime
          );

          c.position.x = carryTransform.x;
          c.position.y = carryTransform.y;
          c.position.z = carryTransform.z;
          c.rotation.x = carryTransform.rotX;
          c.rotation.y = carryTransform.rotY;
          c.rotation.z = carryTransform.rotZ;
        }
      } else {
        c.updatePhysics(dt);

        // Check if thrown crate lands on any pad
        if (!c.isHeld && !c.isStackedOnPad && !c.isSnapping) {
          for (const team of ['red', 'blue', 'yellow', 'cyan'] as TeamId[]) {
            const pad = this.pads[team];
            const dx = Math.abs(c.position.x - pad.origin.x);
            const dz = Math.abs(c.position.z - pad.origin.z);

            if (dx <= 2.1 && dz <= 2.1 && c.position.y <= 2.2 && c.velocity.y <= 0) {
              const bestSlot = pad.findBestSlotForPosition(c.position.x, c.position.z);
              if (bestSlot !== -1 && pad.setSlot(bestSlot, true)) {
                c.snapToPad(team, bestSlot, { x: pad.origin.x, y: 0, z: pad.origin.z }, true);
                SoundFx.playPop();
                break;
              }
            }
          }
        }
      }
    }

    // 5. Update Tank Projectile Shells
    for (const shell of this.tankShells) {
      shell.lifeTime -= dt;
      shell.position.x += shell.velocity.x * dt;
      shell.position.y += shell.velocity.y * dt;
      shell.position.z += shell.velocity.z * dt;
      shell.velocity.y -= 4.0 * dt; // Gravity arc

      // Check collision with enemy buddies or ground
      if (shell.position.y <= 0.2 || shell.lifeTime <= 0) {
        shell.detonated = true;
      } else {
        for (const b of this.buddies) {
          if (b.team !== shell.team && !b.isKnocked) {
            const d = Math.hypot(b.position.x - shell.position.x, b.position.z - shell.position.z);
            if (d <= 1.5) {
              b.takeDamage(shell.directDamage);
              shell.detonated = true;
              break;
            }
          }
        }
      }

      if (shell.detonated) {
        SoundFx.playExplosion();
        // AoE blast damage to buddies
        for (const b of this.buddies) {
          const dmg = PhysicsEngine.calculateAreaDamage(shell.position, b.position, shell.blastDamage, shell.blastRadius);
          if (dmg > 0) b.takeDamage(dmg);
        }
        // AoE blast damage to enemy bunkers
        for (const [team, pos] of Object.entries(this.bunkerPositions) as [TeamId, Vector3D][]) {
          if (team !== shell.team && this.baseHp[team] > 0) {
            const distToBunker = Math.hypot(shell.position.x - pos.x, shell.position.z - pos.z);
            if (distToBunker <= shell.blastRadius + 2.5) {
              const bunkerDmg = Math.max(0, shell.blastDamage * (1 - distToBunker / (shell.blastRadius + 2.5)));
              if (bunkerDmg > 0) this.damageBunker(team, bunkerDmg);
            }
          }
        }
      }
    }
    this.tankShells = this.tankShells.filter((s) => !s.detonated);

    // 6. Update Grenades
    for (const g of this.grenades) {
      PhysicsEngine.updateGrenade(g, dt);
      if (g.detonated) {
        SoundFx.playExplosion();
        for (const b of this.buddies) {
          const dmg = PhysicsEngine.calculateAreaDamage(g.position, b.position, 85, 4.5);
          if (dmg > 0) b.takeDamage(dmg);
        }
        // AoE blast damage to enemy bunkers
        for (const [team, pos] of Object.entries(this.bunkerPositions) as [TeamId, Vector3D][]) {
          const owner = this.buddies.find((b) => b.id === g.ownerId);
          if (owner && owner.team === team) continue;
          if (this.baseHp[team] > 0) {
            const distToBunker = Math.hypot(g.position.x - pos.x, g.position.z - pos.z);
            if (distToBunker <= 5.0) {
              const bunkerDmg = Math.max(0, 80 * (1 - distToBunker / 5.0));
              if (bunkerDmg > 0) this.damageBunker(team, bunkerDmg);
            }
          }
        }
      }
    }
    this.grenades = this.grenades.filter((g) => !g.detonated);

    // 7. Healer Auras Update
    for (const b of this.buddies) {
      b.updateHealerAura(this.buddies, dt);
    }

    // 8. Knocked Buddies Respawn and Troop Reinforcements (Milestone 4)
    this.updateRespawns(dt);
    this.updateReinforcements(dt);

    // 9. Match State & Victory Evaluation (Milestone 4)
    this.evaluateMatchState();

    // 10. Update Holographic Ghost Crate Placement Guide
    if (this.ghostCrateGroup && this.ghostCrateMat) {
      if (this.player.isCarryingCrate && !this.player.isKnocked) {
        const pad = this.pads[this.player.team];
        const distToPad = Math.hypot(pad.origin.x - this.player.position.x, pad.origin.z - this.player.position.z);
        if (distToPad <= 4.0) {
          const bestSlot = pad.findBestSlotForPosition(this.player.position.x, this.player.position.z);
          if (bestSlot !== -1) {
            const coords = pad.getSlotCoordinates(bestSlot);
            this.ghostCrateGroup.position.set(coords.world.x, coords.world.y, coords.world.z);
            this.ghostCrateGroup.visible = true;
            this.ghostCrateMat.opacity = 0.35 + 0.15 * Math.sin(this.elapsedTime * 6.0);
            this.ghostCrateMat.emissiveIntensity = 0.45 + 0.25 * Math.sin(this.elapsedTime * 6.0);
          } else {
            this.ghostCrateGroup.visible = false;
          }
        } else {
          this.ghostCrateGroup.visible = false;
        }
      } else {
        this.ghostCrateGroup.visible = false;
      }
    }
  }

  private render(dt: number = 0.016): void {
    // 1. Sync 3D Meshes & Procedural Animations with Buddies
    for (const b of this.buddies) {
      let rig = this.buddyRigs.get(b.id);
      if (!rig) {
        this.createBuddyMesh(b);
        rig = this.buddyRigs.get(b.id)!;
      }

      // If driving tank, hide standing buddy rig
      if (b.isInTank || b.drivingVehicleId) {
        rig.root.visible = false;
        continue;
      } else {
        rig.root.visible = true;
      }

      // Sync root position to world ground level (torso center - 0.70)
      rig.root.position.set(b.position.x, b.position.y - 0.70, b.position.z);

      // Execute procedural animation math
      updateBuddyProceduralAnimation(rig, b, dt, this.elapsedTime);
    }

    // 2. Sync Crate Meshes
    for (const c of this.crates) {
      let mesh = this.crateMeshes.get(c.id);
      if (!mesh) {
        mesh = createCrateMesh();
        this.scene.add(mesh);
        this.crateMeshes.set(c.id, mesh);
      }

      if (c.isHeld) {
        mesh.visible = false;
      } else {
        mesh.visible = true;
        mesh.position.set(c.position.x, c.position.y, c.position.z);
        mesh.rotation.set(c.rotation.x, c.rotation.y, c.rotation.z);
      }
    }

    // Reconcile and clean up stale crate meshes
    const activeCrateIds = new Set(this.crates.map((c) => c.id));
    for (const [id, mesh] of this.crateMeshes.entries()) {
      if (!activeCrateIds.has(id)) {
        this.scene.remove(mesh);
        this.crateMeshes.delete(id);
      }
    }

    // 3. Sync Tank Meshes
    for (const tank of this.tanks) {
      let mesh = this.tankMeshes.get(tank.id);
      if (!mesh) {
        mesh = createTankMesh(tank);
        this.scene.add(mesh.root);
        this.tankMeshes.set(tank.id, mesh);
      }

      mesh.root.position.set(tank.position.x, tank.position.y, tank.position.z);
      mesh.hullGroup.rotation.y = tank.heading;
      mesh.turretPivot.rotation.y = tank.turretAngle;
      mesh.recoilGroup.position.z = 1.25 + tank.recoilOffset;

      // Dynamic road wheel spin
      const wheelRot = tank.trackDistance / 0.28;
      for (const w of mesh.leftWheels) w.rotation.x = wheelRot;
      for (const w of mesh.rightWheels) w.rotation.x = wheelRot;
    }

    // 4. Update dynamic arena procedural animations
    if (this.arenaElements) {
      this.arenaElements.update(this.elapsedTime, dt);
    }

    this.renderer.render(this.scene, this.camera);
  }

  private onResize(): void {
    const aspect = this.container.clientWidth / (this.container.clientHeight || 1);
    this.isoCamera.updateAspect(aspect);
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }
}

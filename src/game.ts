import * as THREE from 'three';
import { BuddyEntity } from './entities/buddy';
import { CrateEntity } from './entities/crate';
import { StackingPad } from './entities/basePad';
import { BotAI } from './ai/bot';
import { SoundFx } from './engine/audio';
import { PhysicsEngine, GrenadeProjectile, RocketProjectile } from './engine/physics';
import { BuddyClass, TeamId, Vector3D } from './types';

export class TinyBrawlersGame {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  // Game Entities
  public player: BuddyEntity;
  public buddies: BuddyEntity[] = [];
  public crates: CrateEntity[] = [];
  public pads: Record<TeamId, StackingPad>;
  public bots: Map<string, BotAI> = new Map();
  public grenades: GrenadeProjectile[] = [];
  public rockets: RocketProjectile[] = [];

  // Team Bases
  public baseHp: Record<TeamId, number> = {
    red: 1000,
    blue: 1000,
    yellow: 1000,
    cyan: 1000
  };

  // 3D Meshes Cache
  private buddyMeshes: Map<string, THREE.Group> = new Map();
  private crateMeshes: Map<string, THREE.Mesh> = new Map();
  private grenadeMeshes: Map<string, THREE.Mesh> = new Map();
  private rocketMeshes: Map<string, THREE.Mesh> = new Map();

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
  private crateSpawnTimer: number = 3.0;

  constructor(container: HTMLElement, playerClass: BuddyClass = 'fighter') {
    this.container = container;

    // 1. Renderer Setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = false;
    container.appendChild(this.renderer.domElement);

    // 2. Scene & Camera Setup (Overhead Isometric TPP)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x13171d);
    this.scene.fog = new THREE.Fog(0x13171d, 35, 75);

    this.camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 150);
    this.camera.position.set(0, 18, 20);
    this.camera.lookAt(0, 0, 0);

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

    // Register Input Listeners
    this.setupInputs();

    // Resize Handler
    window.addEventListener('resize', this.onResize.bind(this));
  }

  // Build colorful stylized PS1-inspired arena
  private buildArenaEnvironment(): void {
    // Ambient & Directional Lights
    const hemi = new THREE.HemisphereLight(0xfff7ed, 0x2b3846, 1.4);
    this.scene.add(hemi);

    const dirLight = new THREE.DirectionalLight(0xffeed6, 1.8);
    dirLight.position.set(20, 35, 25);
    this.scene.add(dirLight);

    // Arena Floor (64x64)
    const floorGeo = new THREE.PlaneGeometry(64, 64);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x252e39 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // Central Drop Zone Circle
    const dropZone = new THREE.Mesh(
      new THREE.RingGeometry(2, 6.5, 32),
      new THREE.MeshBasicMaterial({ color: 0xe67e22, side: THREE.DoubleSide, opacity: 0.45, transparent: true })
    );
    dropZone.rotation.x = -Math.PI / 2;
    dropZone.position.y = 0.02;
    this.scene.add(dropZone);

    // Build 4 Team Base Pads
    Object.entries(this.pads).forEach(([team, pad]) => {
      const padGroup = new THREE.Group();
      padGroup.position.set(pad.origin.x, 0.03, pad.origin.z);

      // Pad Platform
      const padMesh = new THREE.Mesh(
        new THREE.BoxGeometry(4.2, 0.1, 4.2),
        new THREE.MeshLambertMaterial({ color: 0x1a212a })
      );
      // Team Colored Border
      const borderMesh = new THREE.Mesh(
        new THREE.BoxGeometry(4.4, 0.05, 4.4),
        this.teamMats[team as TeamId]
      );
      padGroup.add(borderMesh, padMesh);
      this.scene.add(padGroup);
    });
  }

  // Create cute Chibi 3D model for each Buddy
  private createBuddyMesh(buddy: BuddyEntity): THREE.Group {
    const root = new THREE.Group();

    // Chubby Body
    const bodyGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.48, 16);
    const capGeo = new THREE.SphereGeometry(0.44, 16, 12);
    const bodyCyl = new THREE.Mesh(bodyGeo, this.teamMats[buddy.team]);
    const capTop = new THREE.Mesh(capGeo, this.teamMats[buddy.team]);
    capTop.position.y = 0.24;
    const capBot = new THREE.Mesh(capGeo, this.teamMats[buddy.team]);
    capBot.position.y = -0.24;

    const bodyGroup = new THREE.Group();
    bodyGroup.name = 'bodyGroup';
    bodyGroup.add(bodyCyl, capTop, capBot);
    root.add(bodyGroup);

    // Eyes with Sparkles
    const eyeGeo = new THREE.SphereGeometry(0.09, 10, 8);
    eyeGeo.scale(1, 1.25, 0.35);
    const pupilGeo = new THREE.SphereGeometry(0.06, 8, 8);
    pupilGeo.scale(1, 1.2, 0.3);

    const lEye = new THREE.Mesh(eyeGeo, this.whiteMat);
    lEye.position.set(-0.14, 0.08, 0.39);
    const lPupil = new THREE.Mesh(pupilGeo, this.darkMat);
    lPupil.position.set(-0.14, 0.08, 0.42);

    const rEye = new THREE.Mesh(eyeGeo, this.whiteMat);
    rEye.position.set(0.14, 0.08, 0.39);
    const rPupil = new THREE.Mesh(pupilGeo, this.darkMat);
    rPupil.position.set(0.14, 0.08, 0.42);
    bodyGroup.add(lEye, lPupil, rEye, rPupil);

    // Blush Cheeks
    const blushGeo = new THREE.SphereGeometry(0.05, 8, 8);
    blushGeo.scale(1.4, 0.8, 0.2);
    const lBlush = new THREE.Mesh(blushGeo, this.blushMat);
    lBlush.position.set(-0.24, -0.02, 0.38);
    const rBlush = new THREE.Mesh(blushGeo, this.blushMat);
    rBlush.position.set(0.24, -0.02, 0.38);
    bodyGroup.add(lBlush, rBlush);

    // Boots
    const bootGeo = new THREE.BoxGeometry(0.22, 0.15, 0.3);
    const lBoot = new THREE.Mesh(bootGeo, this.darkMat);
    lBoot.name = 'lBoot';
    lBoot.position.set(-0.22, -0.42, 0);
    const rBoot = new THREE.Mesh(bootGeo, this.darkMat);
    rBoot.name = 'rBoot';
    rBoot.position.set(0.22, -0.42, 0);
    root.add(lBoot, rBoot);

    this.scene.add(root);
    this.buddyMeshes.set(buddy.id, root);
    return root;
  }

  // Input bindings
  private setupInputs(): void {
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

  // Player action: pick up crate or place on StackingPad
  public handlePlayerInteract(): void {
    if (this.player.isKnocked) return;

    if (this.player.isCarryingCrate) {
      // Check if near own team's base pad
      const pad = this.pads[this.player.team];
      const distToPad = Math.hypot(pad.origin.x - this.player.position.x, pad.origin.z - this.player.position.z);

      if (distToPad <= 3.2) {
        // Place on next available slot
        for (let i = 0; i < 8; i++) {
          if (!pad.slots[i] && pad.setSlot(i, true)) {
            // Find held crate
            const heldCrate = this.crates.find((c) => c.heldByBuddyId === this.player.id);
            if (heldCrate) {
              heldCrate.snapToPad(this.player.team, i, { x: pad.origin.x, y: 0, z: pad.origin.z });
            }
            this.player.isCarryingCrate = false;
            SoundFx.playPop();
            return;
          }
        }
      }

      // Otherwise: throw crate forward
      const heldCrate = this.crates.find((c) => c.heldByBuddyId === this.player.id);
      if (heldCrate) {
        const forward = { x: 0, y: 0, z: -1 }; // default forward
        heldCrate.throwCrate(this.player.position, forward, this.player.getThrowForce());
        this.player.isCarryingCrate = false;
        SoundFx.playPop();
      }
    } else {
      // Try to pick up nearest unheld crate
      let nearestCrate: CrateEntity | null = null;
      let minDist = 1.6;

      for (const c of this.crates) {
        if (c.isHeld || c.isStackedOnPad) continue;
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

  // Player action: fire weapon
  public handlePlayerAttack(): void {
    if (this.player.isKnocked) return;

    if (this.player.weapon === 'pistol' || this.player.weapon === 'shotgun') {
      SoundFx.playShoot(this.player.weapon === 'shotgun');
      // Raycast damage in forward direction
      for (const b of this.buddies) {
        if (b.team !== this.player.team && !b.isKnocked) {
          const d = Math.hypot(b.position.x - this.player.position.x, b.position.z - this.player.position.z);
          if (d <= 10.0) {
            b.takeDamage(this.player.weapon === 'shotgun' ? 45 : 25);
            break;
          }
        }
      }
    } else if (this.player.weapon === 'grenade') {
      SoundFx.playPop();
      this.grenades.push({
        id: `grenade_${Date.now()}`,
        ownerId: this.player.id,
        position: { x: this.player.position.x, y: 1.2, z: this.player.position.z },
        velocity: { x: 0, y: 5, z: -12 },
        timer: 3.0,
        bounces: 0,
        detonated: false
      });
    }
  }

  // Build item from StackingPad when triggered
  public triggerPadBuild(team: TeamId): void {
    const pad = this.pads[team];
    const recipe = pad.evaluate();
    if (recipe.category === 'empty') return;

    SoundFx.playExplosion();

    // Equip weapon to team members or spawn unit
    for (const b of this.buddies) {
      if (b.team === team) {
        if (recipe.category === 'weapon') {
          b.weapon = recipe.itemType as any;
        } else if (recipe.itemType === 'medic_unit' || recipe.itemType === 'commando') {
          // Spawn new AI buddy for team
          const newBot = new BuddyEntity(
            `spawned_${team}_${Date.now()}`,
            team,
            recipe.itemType === 'medic_unit' ? 'healer' : 'fighter',
            { x: pad.origin.x, y: 0.7, z: pad.origin.z }
          );
          this.buddies.push(newBot);
          this.bots.set(newBot.id, new BotAI());
          break;
        }
      }
    }

    // Clear crates stacked on pad
    this.crates = this.crates.filter((c) => c.padTeamId !== team);
    pad.clear();
  }

  // Main Loop
  public start(): void {
    this.isRunning = true;
    this.lastTime = performance.now();
    this.loop();
  }

  public stop(): void {
    this.isRunning = false;
  }

  private loop(): void {
    if (!this.isRunning) return;
    requestAnimationFrame(this.loop.bind(this));

    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    this.update(dt);
    this.render();
  }

  private update(dt: number): void {
    // 1. Crate Spawner in Center
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

    // 2. Player Movement
    let mx = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);
    let mz = (this.keys['KeyS'] ? 1 : 0) - (this.keys['KeyW'] ? 1 : 0);

    // Add mobile touch joystick
    if (Math.hypot(this.joystickVector.x, this.joystickVector.y) > 0.1) {
      mx += this.joystickVector.x;
      mz += this.joystickVector.y;
    }

    const len = Math.hypot(mx, mz);
    if (len > 0.01 && !this.player.isKnocked) {
      const speed = this.player.getEffectiveSpeed();
      this.player.position.x += (mx / len) * speed * dt;
      this.player.position.z += (mz / len) * speed * dt;
    }

    // Camera follow player smoothly
    this.camera.position.x += (this.player.position.x - this.camera.position.x) * 0.08;
    this.camera.position.z += (this.player.position.z + 16 - this.camera.position.z) * 0.08;

    // 3. AI Bots Execution
    for (const buddy of this.buddies) {
      if (buddy === this.player) continue;
      const botAi = this.bots.get(buddy.id);
      if (botAi) {
        const alliesPad = this.pads[buddy.team];
        const enemies = this.buddies.filter((b) => b.team !== buddy.team);
        const decision = botAi.update(buddy, this.crates, alliesPad, enemies, dt);

        const speed = buddy.getEffectiveSpeed();
        buddy.position.x += decision.moveDir.x * speed * dt;
        buddy.position.z += decision.moveDir.z * speed * dt;

        if (decision.action === 'interact') {
          if (buddy.isCarryingCrate) {
            // Place crate on pad
            for (let i = 0; i < 8; i++) {
              if (!alliesPad.slots[i] && alliesPad.setSlot(i, true)) {
                const c = this.crates.find((cr) => cr.heldByBuddyId === buddy.id);
                if (c) c.snapToPad(buddy.team, i, { x: alliesPad.origin.x, y: 0, z: alliesPad.origin.z });
                buddy.isCarryingCrate = false;
                break;
              }
            }
          } else {
            // Pick up nearest
            for (const c of this.crates) {
              if (!c.isHeld && !c.isStackedOnPad && Math.hypot(c.position.x - buddy.position.x, c.position.z - buddy.position.z) <= 1.5) {
                c.attachToBuddy(buddy.id, buddy.position);
                buddy.isCarryingCrate = true;
                break;
              }
            }
          }
        }
      }
    }

    // 4. Update Crates & Attachment
    for (const c of this.crates) {
      if (c.isHeld && c.heldByBuddyId) {
        const carrier = this.buddies.find((b) => b.id === c.heldByBuddyId);
        if (carrier) {
          c.position.x = carrier.position.x;
          c.position.y = carrier.position.y + 1.15;
          c.position.z = carrier.position.z;
        }
      } else {
        c.updatePhysics(dt);
      }
    }

    // 5. Update Grenades
    for (const g of this.grenades) {
      PhysicsEngine.updateGrenade(g, dt);
      if (g.detonated) {
        SoundFx.playExplosion();
        // Area damage to all nearby buddies
        for (const b of this.buddies) {
          const dmg = PhysicsEngine.calculateAreaDamage(g.position, b.position, 85, 4.5);
          if (dmg > 0) b.takeDamage(dmg);
        }
      }
    }
    this.grenades = this.grenades.filter((g) => !g.detonated);

    // 6. Healer Auras Update
    for (const b of this.buddies) {
      b.updateHealerAura(this.buddies, dt);
    }
  }

  private render(): void {
    // Sync 3D Meshes with Entities
    for (const b of this.buddies) {
      let mesh = this.buddyMeshes.get(b.id);
      if (!mesh) {
        mesh = this.createBuddyMesh(b);
      }
      mesh.position.set(b.position.x, b.position.y, b.position.z);
    }

    // Sync Crate Meshes
    for (const c of this.crates) {
      let mesh = this.crateMeshes.get(c.id);
      if (!mesh) {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), this.woodMat);
        this.scene.add(mesh);
        this.crateMeshes.set(c.id, mesh);
      }
      mesh.position.set(c.position.x, c.position.y, c.position.z);
    }

    this.renderer.render(this.scene, this.camera);
  }

  private onResize(): void {
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }
}

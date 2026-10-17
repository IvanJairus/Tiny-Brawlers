import * as THREE from 'three';
import type { World } from '../sim/core/world';
import type { ActorView } from './chibi';
import type { CrateView } from './props';
import type { TankView } from './tanks';
import type { ObstacleView, PowerUpView } from './obstacles';
import type { ProjectileView } from './projectiles';
import type { SimEvent } from '../sim/core/events';

interface SpriteBurst {
  type: 'explosion' | 'impact' | 'heal' | 'teleport' | 'dust';
  x: number;
  z: number;
  start: number;
  duration: number;
}

interface DrawableItem {
  depth: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

export class SpriteStage {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private container: HTMLElement | null = null;
  private images = new Map<string, HTMLImageElement>();
  private bursts: SpriteBurst[] = [];
  private clock = 0;

  private vProj = new THREE.Vector3();
  private vUnit = new THREE.Vector3();

  constructor() {
    // Zero-overhead in headless or test environments
  }

  attach(container: HTMLElement): void {
    if (typeof document === 'undefined') return;
    if (this.container === container && this.canvas) return;
    this.container = container;
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'sprite-stage-canvas';
      this.canvas.style.cssText =
        'position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2;';
      container.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
    }
  }

  getImg(src: string): HTMLImageElement | null {
    if (typeof Image === 'undefined') return null;
    const normalized = src.startsWith('/') ? src : `/${src}`;
    const cached = this.images.get(normalized);
    if (cached) {
      return cached.complete && cached.naturalWidth > 0 ? cached : null;
    }
    const img = new Image();
    img.src = normalized;
    this.images.set(normalized, img);
    return null;
  }

  project(
    wx: number, wy: number, wz: number,
    camera: THREE.Camera,
    width: number, height: number
  ): { sx: number; sy: number; scale: number; visible: boolean } {
    this.vProj.set(wx, wy, wz).project(camera);
    this.vUnit.set(wx, wy + 1, wz).project(camera);

    const sx = (this.vProj.x * 0.5 + 0.5) * width;
    const sy = (-this.vProj.y * 0.5 + 0.5) * height;
    const sy1 = (-this.vUnit.y * 0.5 + 0.5) * height;
    const scale = Math.max(1, Math.abs(sy - sy1));

    const visible = this.vProj.z < 1 && this.vProj.z > -1
      && sx >= -300 && sx <= width + 300
      && sy >= -300 && sy <= height + 300;

    return { sx, sy, scale, visible };
  }

  consume(events: SimEvent[], time = this.clock): void {
    this.clock = time;
    for (const event of events) {
      const ev = event as unknown as { kind: string; at?: { x: number; z: number } };
      if (!ev.at) continue;
      const x = ev.at.x;
      const z = ev.at.z;

      switch (ev.kind) {
        case 'explosion':
          this.bursts.push({ type: 'explosion', x, z, start: time, duration: 0.42 });
          break;
        case 'damage':
        case 'melee':
          this.bursts.push({ type: 'impact', x, z, start: time, duration: 0.25 });
          break;
        case 'heal':
        case 'powerup':
          this.bursts.push({ type: 'heal', x, z, start: time, duration: 0.45 });
          break;
        case 'spawn':
        case 'revive':
          this.bursts.push({ type: 'teleport', x, z, start: time, duration: 0.4 });
          break;
        case 'place':
        case 'brickHit':
        case 'brickBreak':
        case 'build':
          this.bursts.push({ type: 'dust', x, z, start: time, duration: 0.32 });
          break;
        default:
          break;
      }
    }
  }

  render(
    world: World,
    actors: ActorView[],
    _crates: CrateView[],
    _tanks: TankView[],
    _obstacles: ObstacleView[],
    _powerups: PowerUpView[],
    _projectiles: ProjectileView[],
    camera: THREE.Camera | null,
    time: number,
    reticle: { x: number; z: number } | null = null
  ): void {
    if (!camera || typeof document === 'undefined') return;

    if (!this.canvas) {
      const stage = document.getElementById('stage') ?? document.querySelector('#stage');
      if (stage instanceof HTMLElement) {
        this.attach(stage);
      }
    }

    if (!this.canvas || !this.ctx) return;

    this.clock = time;
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    const width = rect.width || parent.clientWidth || 800;
    const height = rect.height || parent.clientHeight || 600;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const targetW = Math.round(width * dpr);
    const targetH = Math.round(height * dpr);

    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }

    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const drawables: DrawableItem[] = [];

    // In Option 1 (Clean 3D World), Base Buildings, Stacking Pads, Obstacles,
    // Power-Ups, Crates, Tanks, Weapons, and Chibi characters are rendered purely in 3D by Three.js!
    // SpriteStage renders only floating status indicators, the player marker, and VFX bursts.

    for (const actor of actors) {
      const pActor = this.project(actor.x, 0, actor.z, camera, width, height);
      if (!pActor.visible) continue;

      const isKo = actor.state === 'ko';
      const isMelee = (actor.melee ?? 0) > 0;
      const isLocal = actor.id === world.localPlayer;

      drawables.push({
        depth: actor.z + 0.15,
        draw: (c) => {
          // 1. KO stars floating above head
          if (isKo) {
            const starImg = this.getImg('assets/efek/bintang_pusing.svg');
            if (starImg) {
              const sw = pActor.scale * 1.3;
              const sh = pActor.scale * 0.65;
              c.drawImage(starImg, pActor.sx - sw / 2, pActor.sy - pActor.scale * 1.6, sw, sh);
            }
          }

          // 2. Melee punch impact spark
          if (isMelee) {
            const impactImg = this.getImg('assets/efek/bintang_benturan.svg');
            if (impactImg) {
              const iw = pActor.scale * 1.4;
              const ih = pActor.scale * 1.4;
              c.drawImage(impactImg, pActor.sx - iw / 2, pActor.sy - pActor.scale * 0.9 - ih / 2, iw, ih);
            }
          }

          // 3. Shield bubble around 3D chibi
          if (actor.shield) {
            const shieldImg = this.getImg('assets/senjata/gelembung_perisai.svg');
            if (shieldImg) {
              const sw = pActor.scale * 2.5;
              const sh = pActor.scale * 2.5;
              c.drawImage(shieldImg, pActor.sx - sw / 2, pActor.sy - pActor.scale * 0.8 - sh / 2, sw, sh);
            }
          }

          // 4. Floating health bar above living buddies when injured
          if (!isKo && actor.hpRatio < 0.99) {
            const barW = pActor.scale * 1.2;
            const barH = pActor.scale * 0.14;
            const barX = pActor.sx - barW / 2;
            const barY = pActor.sy - pActor.scale * 1.95;

            c.fillStyle = 'rgba(15, 17, 23, 0.8)';
            c.beginPath();
            c.roundRect(barX - 1, barY - 1, barW + 2, barH + 2, 2);
            c.fill();

            const fillW = Math.max(0, barW * Math.min(1, actor.hpRatio));
            c.fillStyle = actor.hpRatio > 0.45 ? '#22c55e' : actor.hpRatio > 0.2 ? '#f59e0b' : '#ef4444';
            c.beginPath();
            c.roundRect(barX, barY, fillW, barH, 2);
            c.fill();
          }

          // 5. Crisp Local Player Marker: '▼ KAMU'
          if (isLocal && !isKo) {
            const bob = Math.sin(time * 6) * (pActor.scale * 0.08);
            const badgeY = pActor.sy - pActor.scale * 2.15 + bob;
            const badgeW = pActor.scale * 1.4;
            const badgeH = pActor.scale * 0.36;

            c.save();
            c.fillStyle = '#f59e0b';
            c.strokeStyle = '#ffffff';
            c.lineWidth = 1.5;
            c.beginPath();
            c.roundRect(pActor.sx - badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH, 5);
            c.fill();
            c.stroke();

            c.fillStyle = '#18181b';
            c.font = `bold ${Math.max(10, Math.round(pActor.scale * 0.2))}px sans-serif`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText('▼ KAMU', pActor.sx, badgeY);
            c.restore();
          }
        }
      });
    }

    // Animated VFX Bursts
    const activeBursts: SpriteBurst[] = [];
    for (const burst of this.bursts) {
      const elapsed = time - burst.start;
      if (elapsed > burst.duration || elapsed < 0) continue;
      activeBursts.push(burst);

      const pBurst = this.project(burst.x, 0.5, burst.z, camera, width, height);
      if (!pBurst.visible) continue;

      const progress = elapsed / burst.duration;
      drawables.push({
        depth: burst.z + 0.25,
        draw: (c) => {
          if (burst.type === 'explosion') {
            const frame = Math.min(6, Math.floor(progress * 6) + 1);
            const img = this.getImg(`assets/efek/ledakan_${frame}.svg`);
            if (img) {
              const size = pBurst.scale * 3.0;
              c.drawImage(img, pBurst.sx - size / 2, pBurst.sy - size / 2, size, size);
            }
          } else if (burst.type === 'impact') {
            const img = this.getImg('assets/efek/bintang_benturan.svg');
            if (img) {
              const size = pBurst.scale * 1.8;
              c.drawImage(img, pBurst.sx - size / 2, pBurst.sy - size / 2, size, size);
            }
          } else if (burst.type === 'heal') {
            const frame = Math.min(4, Math.floor(progress * 4) + 1);
            const img = this.getImg(`assets/efek/kilau_${frame}.svg`);
            if (img) {
              const size = pBurst.scale * 2.0;
              c.drawImage(img, pBurst.sx - size / 2, pBurst.sy - size / 2, size, size);
            }
          } else if (burst.type === 'teleport') {
            const img = this.getImg('assets/efek/teleport.svg');
            if (img) {
              const size = pBurst.scale * 2.2;
              c.drawImage(img, pBurst.sx - size / 2, pBurst.sy - size / 2, size, size);
            }
          } else if (burst.type === 'dust') {
            const frame = Math.min(4, Math.floor(progress * 4) + 1);
            const img = this.getImg(`assets/efek/debu_${frame}.svg`);
            if (img) {
              const size = pBurst.scale * 1.8;
              c.drawImage(img, pBurst.sx - size / 2, pBurst.sy - size / 2, size, size);
            }
          }
        }
      });
    }
    this.bursts = activeBursts;

    // Depth sort back to front (painter's algorithm)
    drawables.sort((a, b) => a.depth - b.depth);

    // Draw all items
    for (const item of drawables) {
      item.draw(ctx);
    }

    // Mouse-aim crosshair, always on top of the world markers
    if (reticle) {
      const p = this.project(reticle.x, 0.05, reticle.z, camera, width, height);
      if (p.visible) {
        const r = Math.max(5, p.scale * 0.32);
        ctx.save();
        ctx.translate(p.sx, p.sy);
        ctx.strokeStyle = 'rgba(15, 17, 23, 0.75)';
        ctx.lineWidth = 3.5;
        this.drawCrosshair(ctx, r);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        this.drawCrosshair(ctx, r);
        ctx.restore();
      }
    }
  }

  private drawCrosshair(ctx: CanvasRenderingContext2D, r: number): void {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      ctx.moveTo(dx * (r + 2), dy * (r + 2));
      ctx.lineTo(dx * (r + 7), dy * (r + 7));
    }
    ctx.stroke();
  }

  dispose(): void {
    if (this.canvas) {
      this.canvas.remove();
      this.canvas = null;
      this.ctx = null;
    }
    this.container = null;
    this.images.clear();
    this.bursts.length = 0;
  }
}

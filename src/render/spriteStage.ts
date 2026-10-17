import * as THREE from 'three';
import type { World } from '../sim/core/world';
import type { ActorView } from './chibi';
import type { CrateView } from './props';
import type { TankView } from './tanks';
import type { ObstacleView, PowerUpView } from './obstacles';
import type { ProjectileView } from './projectiles';
import type { SimEvent } from '../sim/core/events';
import { BASE_COORDINATES, BUNKER_MAX_HP } from '../sim/domain/constants';
import { TEAM_COLORS, TEAM_IDS, type TeamId } from '../sim/domain/teams';

interface SpriteBurst {
  type: 'explosion' | 'impact' | 'heal' | 'teleport' | 'dust';
  x: number;
  z: number;
  start: number;
  duration: number;
}

interface FloatingNumber {
  x: number;
  z: number;
  text: string;
  color: string;
  start: number;
  duration: number;
  big: boolean;
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
  private floaters: FloatingNumber[] = [];
  private bunkerFlashUntil: Record<TeamId, number> = { red: 0, blue: 0, yellow: 0, cyan: 0 };
  private prevBunkerHp: Record<TeamId, number> = {
    red: BUNKER_MAX_HP,
    blue: BUNKER_MAX_HP,
    yellow: BUNKER_MAX_HP,
    cyan: BUNKER_MAX_HP
  };
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
      const ev = event as unknown as {
        kind: string;
        at?: { x: number; z: number };
        amount?: number;
        team?: TeamId;
        hp?: number;
      };
      if (ev.kind === 'bunkerHit' && ev.team && ev.at) {
        const prevHp = this.prevBunkerHp[ev.team] ?? BUNKER_MAX_HP;
        const nextHp = ev.hp ?? prevHp;
        const delta = Math.max(1, Math.round(prevHp - nextHp));
        this.prevBunkerHp[ev.team] = nextHp;
        this.bunkerFlashUntil[ev.team] = time + 0.35;
        this.bursts.push({ type: 'explosion', x: ev.at.x, z: ev.at.z, start: time, duration: 0.45 });
        this.floaters.push({
          x: ev.at.x + (Math.sin(time * 37) * 0.9),
          z: ev.at.z,
          text: `-${delta} MARKAS`,
          color: '#fbbf24',
          start: time,
          duration: 0.95,
          big: true
        });
        continue;
      }

      if (!ev.at) continue;
      const x = ev.at.x;
      const z = ev.at.z;

      switch (ev.kind) {
        case 'explosion':
          this.bursts.push({ type: 'explosion', x, z, start: time, duration: 0.42 });
          break;
        case 'damage': {
          this.bursts.push({ type: 'impact', x, z, start: time, duration: 0.25 });
          const dmg = Math.round(ev.amount ?? 0);
          if (dmg > 0) {
            this.floaters.push({
              x,
              z,
              text: `-${dmg}`,
              color: dmg >= 45 ? '#fb923c' : '#fef08a',
              start: time,
              duration: 0.75,
              big: dmg >= 45
            });
          }
          break;
        }
        case 'melee':
          this.bursts.push({ type: 'impact', x, z, start: time, duration: 0.25 });
          break;
        case 'heal': {
          this.bursts.push({ type: 'heal', x, z, start: time, duration: 0.45 });
          const healed = Math.round(ev.amount ?? 0);
          if (healed >= 5) {
            this.floaters.push({
              x,
              z,
              text: `+${healed}`,
              color: '#4ade80',
              start: time,
              duration: 0.7,
              big: false
            });
          }
          break;
        }
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

    // 1. World-space Bunker HP Bars & Status Banners above each Team Base
    if (world.bunkerHp && world.eliminated) {
      const localBuddy = actors.find((a) => a.id === world.localPlayer);
      const myTeam: TeamId = localBuddy?.team ?? 'red';

      for (const team of TEAM_IDS) {
        const base = BASE_COORDINATES[team];
        const hp = Math.max(0, Math.round(world.bunkerHp[team] ?? 0));
        const elim = Boolean(world.eliminated[team]);
        const pBase = this.project(base.x, 4.2, base.z, camera, width, height);

        if (pBase.visible) {
          const flashLeft = Math.max(0, (this.bunkerFlashUntil[team] ?? 0) - time);
          const shakeX = flashLeft > 0 ? Math.sin(time * 75) * pBase.scale * 0.14 : 0;
          const teamInfo = TEAM_COLORS[team];
          const isAlly = team === myTeam;

          drawables.push({
            depth: base.z + 0.1,
            draw: (c) => {
              const barW = Math.max(68, pBase.scale * 3.1);
              const barH = Math.max(8, pBase.scale * 0.34);
              const bx = pBase.sx - barW / 2 + shakeX;
              const by = pBase.sy;

              c.save();
              // Header label
              c.font = `bold ${Math.max(10, Math.round(pBase.scale * 0.34))}px sans-serif`;
              c.textAlign = 'center';
              c.textBaseline = 'bottom';
              const title = elim
                ? `MARKAS ${teamInfo.label.toUpperCase()} [GUGUR]`
                : hp <= 0
                  ? `MARKAS ${teamInfo.label.toUpperCase()} [HANCUR!]`
                  : isAlly
                    ? `MARKAS KAMU (${hp})`
                    : `MARKAS ${teamInfo.label.toUpperCase()} (${hp})`;

              c.lineWidth = 3;
              c.strokeStyle = 'rgba(10, 12, 18, 0.9)';
              c.strokeText(title, pBase.sx + shakeX, by - 4);
              c.fillStyle = flashLeft > 0 ? '#ffffff' : teamInfo.css;
              c.fillText(title, pBase.sx + shakeX, by - 4);

              // HP Bar track
              c.fillStyle = 'rgba(12, 15, 22, 0.88)';
              c.strokeStyle = flashLeft > 0 ? '#ffffff' : teamInfo.css;
              c.lineWidth = flashLeft > 0 ? 2.5 : 1.5;
              c.beginPath();
              c.roundRect(bx - 2, by - 2, barW + 4, barH + 4, 4);
              c.fill();
              c.stroke();

              if (hp > 0) {
                const ratio = Math.max(0, Math.min(1, hp / BUNKER_MAX_HP));
                c.fillStyle = flashLeft > 0 ? '#fde047' : teamInfo.css;
                c.beginPath();
                c.roundRect(bx, by, barW * ratio, barH, 3);
                c.fill();
              } else {
                // Destroyed warning stripe
                c.fillStyle = '#ef4444';
                c.font = `bold ${Math.max(9, Math.round(pBase.scale * 0.28))}px sans-serif`;
                c.textBaseline = 'top';
                c.fillText('RESPAWN MATI!', pBase.sx + shakeX, by + barH + 4);
              }
              c.restore();
            }
          });
        } else if (!elim && team !== myTeam) {
          // Off-screen indicator arrow pointing toward living enemy bases
          const cx = width * 0.5;
          const cy = height * 0.5;
          const dx = pBase.sx - cx;
          const dy = pBase.sy - cy;
          const angle = Math.atan2(dy, dx);
          const padX = width * 0.42;
          const padY = height * 0.38;
          const edgeT = Math.min(
            padX / Math.max(1, Math.abs(Math.cos(angle))),
            padY / Math.max(1, Math.abs(Math.sin(angle)))
          );
          const ix = cx + Math.cos(angle) * edgeT;
          const iy = cy + Math.sin(angle) * edgeT;
          const teamInfo = TEAM_COLORS[team];

          drawables.push({
            depth: 999,
            draw: (c) => {
              c.save();
              c.translate(ix, iy);
              c.rotate(angle);
              c.fillStyle = teamInfo.css;
              c.strokeStyle = '#0f172a';
              c.lineWidth = 2;
              c.beginPath();
              c.moveTo(10, 0);
              c.lineTo(-8, -7);
              c.lineTo(-5, 0);
              c.lineTo(-8, 7);
              c.closePath();
              c.fill();
              c.stroke();
              c.restore();
            }
          });
        }
      }
    }

    // 2. Actor Indicators & Player Marker
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

    // 3. Animated VFX Bursts
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

    // 4. Floating Combat Numbers (damage & bunker hits)
    const activeFloaters: FloatingNumber[] = [];
    for (const fl of this.floaters) {
      const elapsed = time - fl.start;
      if (elapsed > fl.duration || elapsed < 0) continue;
      activeFloaters.push(fl);

      const progress = elapsed / fl.duration;
      const liftY = 1.4 + progress * 1.9;
      const pFl = this.project(fl.x, liftY, fl.z, camera, width, height);
      if (!pFl.visible) continue;

      const alpha = progress < 0.7 ? 1 : Math.max(0, 1 - (progress - 0.7) / 0.3);
      drawables.push({
        depth: fl.z + 0.5,
        draw: (c) => {
          c.save();
          c.globalAlpha = alpha;
          const fontSize = Math.max(12, Math.round(pFl.scale * (fl.big ? 0.52 : 0.38)));
          c.font = `900 ${fontSize}px sans-serif`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.lineWidth = 3.5;
          c.strokeStyle = 'rgba(15, 17, 23, 0.92)';
          c.strokeText(fl.text, pFl.sx, pFl.sy);
          c.fillStyle = fl.color;
          c.fillText(fl.text, pFl.sx, pFl.sy);
          c.restore();
        }
      });
    }
    this.floaters = activeFloaters;

    // Depth sort back to front (painter's algorithm)
    drawables.sort((a, b) => a.depth - b.depth);

    // Draw all items
    for (const item of drawables) {
      item.draw(ctx);
    }

    // 5. Mouse-aim crosshair & aim line, always on top of the world markers
    if (reticle) {
      const p = this.project(reticle.x, 0.05, reticle.z, camera, width, height);
      if (p.visible) {
        const localActor = actors.find((a) => a.id === world.localPlayer && a.state !== 'ko');
        const myTeam = localActor?.team ?? 'red';
        const lockedEnemy = actors.some(
          (a) => a.team !== myTeam && a.state !== 'ko' && Math.hypot(a.x - reticle.x, a.z - reticle.z) < 1.35
        );
        const lockedBunker = world.bunkerHp
          ? TEAM_IDS.some(
              (t) =>
                t !== myTeam &&
                !world.eliminated?.[t] &&
                (world.bunkerHp[t] ?? 0) > 0 &&
                Math.hypot(BASE_COORDINATES[t].x - reticle.x, BASE_COORDINATES[t].z - reticle.z) < 4.5
            )
          : false;
        const isLocked = lockedEnemy || lockedBunker;

        if (localActor) {
          const pMe = this.project(localActor.x, 0.35, localActor.z, camera, width, height);
          if (pMe.visible) {
            ctx.save();
            ctx.setLineDash([5, 6]);
            ctx.strokeStyle = isLocked ? 'rgba(239, 68, 68, 0.55)' : 'rgba(255, 255, 255, 0.28)';
            ctx.lineWidth = 1.75;
            ctx.beginPath();
            ctx.moveTo(pMe.sx, pMe.sy);
            ctx.lineTo(p.sx, p.sy);
            ctx.stroke();
            ctx.restore();
          }
        }

        const r = Math.max(5, p.scale * (isLocked ? 0.42 : 0.32));
        ctx.save();
        ctx.translate(p.sx, p.sy);
        ctx.strokeStyle = 'rgba(15, 17, 23, 0.8)';
        ctx.lineWidth = 3.5;
        this.drawCrosshair(ctx, r);
        ctx.strokeStyle = isLocked ? '#ef4444' : '#ffffff';
        ctx.lineWidth = 1.8;
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
    this.floaters.length = 0;
  }
}

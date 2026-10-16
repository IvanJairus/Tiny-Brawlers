import * as THREE from 'three';
import type { World } from '../sim/core/world';
import type { ActorView } from './chibi';
import type { CrateView } from './props';
import type { TankView } from './tanks';
import type { ObstacleView, PowerUpView } from './obstacles';
import type { ProjectileView } from './projectiles';
import type { SimEvent } from '../sim/core/events';
import { BASE_COORDINATES } from '../sim/domain/constants';
import { padOrigin } from '../sim/domain/pad';
import { evaluatePad } from '../sim/domain/recipes';
import { TEAM_IDS, type TeamId } from '../sim/domain/teams';

const TEAM_ASSET_COLORS: Record<TeamId, string> = {
  red: 'merah',
  blue: 'biru',
  yellow: 'kuning',
  cyan: 'hijau'
};

const CRATE_VARIETIES = ['biasa', 'senjata', 'utilitas', 'emas'] as const;

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
    crates: CrateView[],
    tanks: TankView[],
    obstacles: ObstacleView[],
    powerups: PowerUpView[],
    projectiles: ProjectileView[],
    camera: THREE.Camera | null,
    time: number
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

    // 1. Team Base Buildings
    for (const team of TEAM_IDS) {
      if (world.eliminated && world.eliminated[team]) continue;
      const base = BASE_COORDINATES[team];
      if (!base) continue;
      const tColor = TEAM_ASSET_COLORS[team];
      const bunkerHp = world.bunkerHp?.[team] ?? 1000;

      // Main Bunker Tower
      const pTower = this.project(base.x, 0, base.z, camera, width, height);
      if (pTower.visible) {
        const towerStatus = bunkerHp > 500 ? 'jadi' : 'dibangun';
        const towerSrc = `assets/bangunan/bangunan_menara_${tColor}_${towerStatus}.svg`;
        drawables.push({
          depth: base.z - 0.1,
          draw: (c) => {
            const img = this.getImg(towerSrc);
            if (!img) return;
            const w = pTower.scale * 3.8;
            const h = pTower.scale * 5.2;
            c.drawImage(img, pTower.sx - w / 2, pTower.sy - h * 0.95, w, h);
          }
        });
      }

      // Barracks
      const bx = base.x * 0.88;
      const bz = base.z * 0.96;
      const pBarak = this.project(bx, 0, bz, camera, width, height);
      if (pBarak.visible) {
        const barakSrc = `assets/bangunan/bangunan_barak_${tColor}_jadi.svg`;
        drawables.push({
          depth: bz - 0.1,
          draw: (c) => {
            const img = this.getImg(barakSrc);
            if (!img) return;
            const w = pBarak.scale * 3.2;
            const h = pBarak.scale * 3.4;
            c.drawImage(img, pBarak.sx - w / 2, pBarak.sy - h * 0.9, w, h);
          }
        });
      }

      // Turret Nest
      const tx = base.x * 0.82;
      const tz = base.z * 0.82;
      const pTurret = this.project(tx, 0, tz, camera, width, height);
      if (pTurret.visible) {
        const turretSrc = `assets/bangunan/bangunan_sarang_turret_${tColor}_jadi.svg`;
        drawables.push({
          depth: tz - 0.1,
          draw: (c) => {
            const img = this.getImg(turretSrc);
            if (!img) return;
            const w = pTurret.scale * 2.8;
            const h = pTurret.scale * 3.0;
            c.drawImage(img, pTurret.sx - w / 2, pTurret.sy - h * 0.9, w, h);
          }
        });
      }

      // Spawn Warp Pad
      const wx = base.x * 0.74;
      const wz = base.z * 0.74;
      const pWarp = this.project(wx, 0, wz, camera, width, height);
      if (pWarp.visible) {
        const warpSrc = `assets/crate/warp_pad_${tColor}_aktif.svg`;
        drawables.push({
          depth: wz - 0.2,
          draw: (c) => {
            const img = this.getImg(warpSrc);
            if (!img) return;
            const w = pWarp.scale * 2.5;
            const h = pWarp.scale * 2.5;
            c.drawImage(img, pWarp.sx - w / 2, pWarp.sy - h * 0.75, w, h);
          }
        });
      }
    }

    // 2. Team Stacking Pads
    for (const team of TEAM_IDS) {
      const origin = padOrigin(team);
      const tColor = TEAM_ASSET_COLORS[team];
      const pPad = this.project(origin.x, 0.05, origin.z, camera, width, height);

      if (pPad.visible) {
        // Pad outline
        drawables.push({
          depth: origin.z - 0.25,
          draw: (c) => {
            const img = this.getImg('assets/tumpukan/tumpukan_slot_2x2.svg');
            if (!img) return;
            const w = pPad.scale * 3.4;
            const h = pPad.scale * 3.4;
            c.drawImage(img, pPad.sx - w / 2, pPad.sy - h * 0.7, w, h);
          }
        });

        // Floating recipe preview bubble if pad has crates
        const padMask = world.pads?.[team] ?? 0;
        if (padMask !== 0) {
          const recipe = evaluatePad(padMask);
          let recipeSrc: string | null = null;
          switch (recipe.id) {
            case 'pistol':
              recipeSrc = 'assets/tumpukan/tumpukan_resep_pistol.svg';
              break;
            case 'shotgun':
              recipeSrc = 'assets/tumpukan/tumpukan_1x2_senjata.svg';
              break;
            case 'grenade':
              recipeSrc = 'assets/tumpukan/tumpukan_resep_granat.svg';
              break;
            case 'medicUnit':
              recipeSrc = `assets/tumpukan/tumpukan_resep_buddy_baru_${tColor}.svg`;
              break;
            case 'medkit':
              recipeSrc = 'assets/tumpukan/tumpukan_resep_kotak_medis.svg';
              break;
            case 'bazooka':
              recipeSrc = 'assets/tumpukan/tumpukan_resep_bazoka.svg';
              break;
            case 'commando':
              recipeSrc = 'assets/tumpukan/tumpukan_resep_sniper.svg';
              break;
            case 'tank':
              recipeSrc = 'assets/tumpukan/tumpukan_resep_tank.svg';
              break;
            default:
              break;
          }

          if (recipeSrc) {
            const floatY = 2.4 + Math.sin(time * 3.5) * 0.18;
            const pBubble = this.project(origin.x, floatY, origin.z, camera, width, height);
            drawables.push({
              depth: origin.z + 0.3,
              draw: (c) => {
                const img = this.getImg(recipeSrc);
                if (!img) return;
                const size = pBubble.scale * 2.2;
                c.drawImage(img, pBubble.sx - size / 2, pBubble.sy - size / 2, size, size);
              }
            });
          }
        }
      }
    }

    // 3. Obstacles & Destructible Bricks
    const biome = world.biome ?? 'rumput';
    for (const obs of obstacles) {
      const pObs = this.project(obs.x, 0, obs.z, camera, width, height);
      if (!pObs.visible) continue;

      if (obs.kind === 'hard') {
        const isOuterEdge = Math.abs(obs.x) > 16 || Math.abs(obs.z) > 16;
        drawables.push({
          depth: obs.z,
          draw: (c) => {
            const wallImg = this.getImg('assets/png/tembok_keras.png')
              ?? this.getImg('assets/props/tembok_keras.svg');
            if (wallImg) {
              const w = pObs.scale * 1.8;
              const h = pObs.scale * 1.8;
              c.drawImage(wallImg, pObs.sx - w / 2, pObs.sy - h * 0.88, w, h);
            }
            if (isOuterEdge) {
              const propSrc = biome === 'gurun'
                ? 'assets/rintangan/gurun_kaktus.svg'
                : biome === 'salju'
                  ? 'assets/rintangan/salju_pinus.svg'
                  : 'assets/rintangan/rumput_pohon.svg';
              const propImg = this.getImg(propSrc);
              if (propImg) {
                const pw = pObs.scale * 2.0;
                const ph = pObs.scale * 2.2;
                c.drawImage(propImg, pObs.sx - pw / 2, pObs.sy - ph * 0.95, pw, ph);
              }
            }
          }
        });
      } else {
        const stageSrc = obs.stage === 'broken'
          ? 'assets/png/bata_pecah.png'
          : obs.stage === 'cracked'
            ? 'assets/png/bata_retak.png'
            : 'assets/png/bata_lunak.png';

        drawables.push({
          depth: obs.z,
          draw: (c) => {
            const brickImg = this.getImg(stageSrc);
            if (!brickImg) return;
            const w = pObs.scale * 1.8;
            const h = pObs.scale * 1.8;
            c.drawImage(brickImg, pObs.sx - w / 2, pObs.sy - h * 0.88, w, h);
          }
        });
      }
    }

    // 4. Power-Ups
    for (const pu of powerups) {
      const bobY = pu.y + Math.sin(time * 4) * 0.15;
      const pPu = this.project(pu.x, bobY, pu.z, camera, width, height);
      if (!pPu.visible) continue;

      const gleamFrame = (Math.floor(time * 6) % 4) + 1;
      const gleamSrc = `assets/efek/kilau_${gleamFrame}.svg`;
      const puSrc = `assets/png/${pu.kind}.png`;

      drawables.push({
        depth: pu.z + 0.05,
        draw: (c) => {
          const gleam = this.getImg(gleamSrc);
          if (gleam) {
            const gw = pPu.scale * 1.6;
            const gh = pPu.scale * 1.6;
            c.drawImage(gleam, pPu.sx - gw / 2, pPu.sy - gh / 2, gw, gh);
          }
          const img = this.getImg(puSrc);
          if (img) {
            const w = pPu.scale * 1.25;
            const h = pPu.scale * 1.25;
            c.drawImage(img, pPu.sx - w / 2, pPu.sy - h / 2, w, h);
          }
        }
      });
    }

    // 5. Crates
    for (let i = 0; i < crates.length; i++) {
      const crate = crates[i];
      const pCrate = this.project(crate.x, crate.y, crate.z, camera, width, height);
      if (!pCrate.visible) continue;

      const variety = CRATE_VARIETIES[i % CRATE_VARIETIES.length];
      const crateSrc = `assets/crate/crate_${variety}_tutup.svg`;

      drawables.push({
        depth: crate.z + (crate.y * 0.02),
        draw: (c) => {
          const img = this.getImg(crateSrc);
          if (!img) return;
          const w = pCrate.scale * 1.25 * crate.scale;
          const h = pCrate.scale * 1.25 * crate.scale;
          c.drawImage(img, pCrate.sx - w / 2, pCrate.sy - h * 0.88, w, h);
        }
      });
    }

    // 6. Tanks
    for (const tank of tanks) {
      const pTank = this.project(tank.x, 0, tank.z, camera, width, height);
      if (!pTank.visible) continue;

      const tColor = TEAM_ASSET_COLORS[tank.team];
      const cosH = Math.cos(tank.heading);
      const sinH = Math.sin(tank.heading);
      let dir = 'samping';
      let flipX = false;
      if (cosH > 0.55) dir = 'depan';
      else if (cosH < -0.55) dir = 'belakang';
      else flipX = sinH < 0;

      const tankSrc = `assets/kendaraan/tank_${tColor}_${dir}.svg`;

      drawables.push({
        depth: tank.z + 0.1,
        draw: (c) => {
          const img = this.getImg(tankSrc);
          if (!img) return;
          const w = pTank.scale * 2.8;
          const h = pTank.scale * 2.8;

          c.save();
          c.translate(pTank.sx, pTank.sy - pTank.scale * 0.5);
          if (flipX) c.scale(-1, 1);
          c.drawImage(img, -w / 2, -h / 2, w, h);
          c.restore();
        }
      });
    }

    // 7. Mascot Characters
    for (const actor of actors) {
      const pActor = this.project(actor.x, 0, actor.z, camera, width, height);
      if (!pActor.visible) continue;

      const buddyRec = world.buddies.find((b) => b.id === actor.id);
      const cls = buddyRec?.cls ?? 'fighter';
      const mascot = cls === 'fighter'
        ? 'bola_luncur'
        : cls === 'healer'
          ? 'biskuit_karamel'
          : 'tupai_gudang';

      const tColor = TEAM_ASSET_COLORS[actor.team];
      const cosH = Math.cos(actor.heading);
      const sinH = Math.sin(actor.heading);
      let dir: 'bawah' | 'atas' | 'kanan' = 'kanan';
      let flipX = false;
      if (cosH > 0.55) dir = 'bawah';
      else if (cosH < -0.55) dir = 'atas';
      else {
        dir = 'kanan';
        flipX = sinH < 0;
      }

      const frame = (Math.floor(time * 10 + actor.phase) % 4) + 1;
      let spriteSrc: string;
      let isKo = false;
      let isMelee = false;

      if (actor.state === 'ko') {
        spriteSrc = `assets/karakter_tim/${mascot}/${mascot}_${tColor}_ko.svg`;
        isKo = true;
      } else if ((actor.melee ?? 0) > 0) {
        spriteSrc = `assets/karakter_crate/${mascot}/${mascot}_${tColor}_lempar_${dir}_${frame}.svg`;
        isMelee = true;
      } else if (actor.state === 'carry') {
        spriteSrc = `assets/karakter_crate/${mascot}/${mascot}_${tColor}_bawa_${dir}_${frame}.svg`;
      } else if (actor.state === 'walk') {
        spriteSrc = `assets/karakter_tim/${mascot}/${mascot}_${tColor}_jalan_${dir}_${frame}.svg`;
      } else if (actor.hpRatio < 0.3) {
        spriteSrc = `assets/karakter_tim/${mascot}/${mascot}_${tColor}_panik.svg`;
      } else {
        spriteSrc = `assets/karakter_tim/${mascot}/${mascot}_${tColor}_diam_${dir}.svg`;
      }

      drawables.push({
        depth: actor.z + 0.15,
        draw: (c) => {
          const img = this.getImg(spriteSrc);
          if (img) {
            const w = pActor.scale * 2.2;
            const h = pActor.scale * 2.2;
            c.save();
            c.translate(pActor.sx, pActor.sy);
            if (flipX) c.scale(-1, 1);
            c.drawImage(img, -w / 2, -h * 0.9, w, h);
            c.restore();
          }

          // KO stars effect
          if (isKo) {
            const starImg = this.getImg('assets/efek/bintang_pusing.svg');
            if (starImg) {
              const sw = pActor.scale * 1.2;
              const sh = pActor.scale * 0.6;
              c.drawImage(starImg, pActor.sx - sw / 2, pActor.sy - pActor.scale * 1.8, sw, sh);
            }
          }

          // Melee impact effect
          if (isMelee) {
            const impactImg = this.getImg('assets/efek/bintang_benturan.svg');
            if (impactImg) {
              const iw = pActor.scale * 1.5;
              const ih = pActor.scale * 1.5;
              const offX = flipX ? -pActor.scale * 0.6 : pActor.scale * 0.6;
              c.drawImage(impactImg, pActor.sx + offX - iw / 2, pActor.sy - pActor.scale * 0.8 - ih / 2, iw, ih);
            }
          }

          // Weapon overlay
          if (actor.weapon !== 'none' && !isKo) {
            let wepSrc: string | null = null;
            switch (actor.weapon) {
              case 'pistol': wepSrc = 'assets/senjata/pistol.svg'; break;
              case 'shotgun': wepSrc = 'assets/senjata/senapan_mesin.svg'; break;
              case 'grenade': wepSrc = 'assets/senjata/granat.svg'; break;
              case 'bazooka': wepSrc = 'assets/senjata/bazoka.svg'; break;
              case 'medic': wepSrc = 'assets/senjata/kotak_medis.svg'; break;
              default: break;
            }
            if (wepSrc) {
              const wepImg = this.getImg(wepSrc);
              if (wepImg) {
                const ww = pActor.scale * 0.9;
                const wh = pActor.scale * 0.9;
                const hx = flipX ? pActor.sx - pActor.scale * 0.45 : pActor.sx + pActor.scale * 0.45;
                const hy = pActor.sy - pActor.scale * 0.75;
                c.drawImage(wepImg, hx - ww / 2, hy - wh / 2, ww, wh);
              }
            }
          }

          // Shield bubble
          if (actor.shield) {
            const shieldImg = this.getImg('assets/senjata/gelembung_perisai.svg');
            if (shieldImg) {
              const sw = pActor.scale * 2.6;
              const sh = pActor.scale * 2.6;
              c.drawImage(shieldImg, pActor.sx - sw / 2, pActor.sy - pActor.scale * 1.0 - sh / 2, sw, sh);
            }
          }

          // Health bar above mascot
          if (!isKo) {
            const barW = pActor.scale * 1.4;
            const barH = pActor.scale * 0.18;
            const barX = pActor.sx - barW / 2;
            const barY = pActor.sy - pActor.scale * 2.15;

            // Background bar
            c.fillStyle = 'rgba(20, 20, 24, 0.75)';
            c.beginPath();
            c.roundRect(barX - 1, barY - 1, barW + 2, barH + 2, 3);
            c.fill();

            // Remaining health
            const fillW = Math.max(0, barW * Math.min(1, actor.hpRatio));
            c.fillStyle = actor.hpRatio > 0.45
              ? '#22c55e'
              : actor.hpRatio > 0.2
                ? '#f59e0b'
                : '#ef4444';
            c.beginPath();
            c.roundRect(barX, barY, fillW, barH, 2);
            c.fill();
          }

          // Local Player Badge: "▼ KAMU"
          if (actor.id === world.localPlayer) {
            const badgeY = pActor.sy - pActor.scale * 2.45 + Math.sin(time * 6) * (pActor.scale * 0.08);
            const badgeW = pActor.scale * 1.5;
            const badgeH = pActor.scale * 0.38;

            c.save();
            c.fillStyle = '#f59e0b';
            c.strokeStyle = '#ffffff';
            c.lineWidth = 1.5;
            c.beginPath();
            c.roundRect(pActor.sx - badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH, 6);
            c.fill();
            c.stroke();

            c.fillStyle = '#1e1e24';
            c.font = `bold ${Math.round(pActor.scale * 0.22)}px sans-serif`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText('▼ KAMU', pActor.sx, badgeY);
            c.restore();
          }
        }
      });
    }

    // 8. Projectiles
    for (const proj of projectiles) {
      const pProj = this.project(proj.x, proj.y, proj.z, camera, width, height);
      if (!pProj.visible) continue;

      let pSrc: string | null = null;
      let sizeScale = 0.6;
      switch (proj.kind) {
        case 'bullet':
          pSrc = 'assets/senjata/peluru.svg';
          sizeScale = 0.55;
          break;
        case 'rocket':
          pSrc = 'assets/senjata/roket_mini.svg';
          sizeScale = 0.95;
          break;
        case 'grenade':
          pSrc = 'assets/png/bom_0-1.5s.png';
          sizeScale = 0.85;
          break;
        case 'shell':
          pSrc = 'assets/senjata/roket_mini.svg';
          sizeScale = 1.15;
          break;
        default:
          break;
      }

      if (pSrc) {
        drawables.push({
          depth: proj.z + 0.2,
          draw: (c) => {
            const img = this.getImg(pSrc);
            if (!img) return;
            const w = pProj.scale * sizeScale;
            const h = pProj.scale * sizeScale;
            c.save();
            c.translate(pProj.sx, pProj.sy);
            c.rotate(proj.heading);
            c.drawImage(img, -w / 2, -h / 2, w, h);
            c.restore();
          }
        });
      }
    }

    // 9. Animated VFX Bursts
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

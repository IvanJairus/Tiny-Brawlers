import * as THREE from 'three';
import { BUDGET } from './budget';
import type { SharedMaterials } from './materials';

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  maxLife: number;
  r: number; g: number; b: number;
  gravity: number;
}

/**
 * One pooled Points object serves every effect in the game, so a firefight costs
 * a single draw call instead of one mesh per spark.
 */
export class ParticlePool {
  public readonly points: THREE.Points;
  private positions: Float32Array;
  private colors: Float32Array;
  private pool: Particle[] = [];
  private cursor = 0;
  private geometry: THREE.BufferGeometry;

  constructor(materials: SharedMaterials) {
    const count = BUDGET.particles;
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.points = new THREE.Points(this.geometry, materials.particle);
    this.points.frustumCulled = false;

    for (let i = 0; i < count; i++) {
      this.pool.push({ x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, r: 1, g: 1, b: 1, gravity: 1 });
    }
  }

  burst(
    x: number, y: number, z: number, colour: Rgb,
    count: number, speed: number, gravity = 1, life = 0.6
  ): void {
    for (let i = 0; i < count; i++) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % this.pool.length;
      const angle = (i / count) * Math.PI * 2 + this.cursor * 0.13;
      const lift = 0.35 + ((i * 37) % 11) / 14;
      p.x = x; p.y = y; p.z = z;
      p.vx = Math.cos(angle) * speed;
      p.vz = Math.sin(angle) * speed;
      p.vy = lift * speed;
      p.life = life;
      p.maxLife = life;
      p.r = colour[0]; p.g = colour[1]; p.b = colour[2];
      p.gravity = gravity;
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      const o = i * 3;
      if (p.life <= 0) {
        this.positions[o + 1] = -999;
        this.colors[o] = 0; this.colors[o + 1] = 0; this.colors[o + 2] = 0;
        continue;
      }
      p.life -= dt;
      p.vy -= 12 * p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.05) {
        p.y = 0.05;
        p.vy = -p.vy * 0.3;
        p.vx *= 0.7;
        p.vz *= 0.7;
      }
      const fade = Math.max(0, p.life / p.maxLife);
      this.positions[o] = p.x;
      this.positions[o + 1] = p.y;
      this.positions[o + 2] = p.z;
      this.colors[o] = p.r * fade;
      this.colors[o + 1] = p.g * fade;
      this.colors[o + 2] = p.b * fade;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}

export type Rgb = readonly [number, number, number];

export const COLOR: Record<'wood' | 'fire' | 'smoke' | 'heal' | 'hit' | 'dirt', Rgb> = {
  wood: [0.71, 0.48, 0.22],
  fire: [1, 0.55, 0.15],
  smoke: [0.55, 0.58, 0.62],
  heal: [0.24, 0.86, 0.45],
  hit: [1, 0.95, 0.6],
  dirt: [0.45, 0.36, 0.27]
};

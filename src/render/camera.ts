import * as THREE from 'three';

export interface CameraOptions {
  reducedMotion?: boolean;
}

const NEAR = { distance: 13.5, height: 12.5 };
const FAR = { distance: 34, height: 30 };

/**
 * Action-isometric: the character stays readable up close and the camera pulls
 * back for the arena overview. There is no free rotation, same as the game this
 * replaces, which keeps the stick-to-screen mapping constant on touch.
 */
export class IsoCamera {
  public readonly camera: THREE.PerspectiveCamera;
  public zoom = 0;
  public shakeAmount = 0;
  private target = new THREE.Vector3();
  private smoothed = new THREE.Vector3();
  private reducedMotion: boolean;

  constructor(aspect: number, options: CameraOptions = {}) {
    this.reducedMotion = options.reducedMotion ?? false;
    this.camera = new THREE.PerspectiveCamera(46, aspect, 0.5, 300);
    this.camera.position.set(0, NEAR.height, NEAR.distance);
    this.smoothed.set(0, 0, 0);
  }

  setZoom(value: number): void {
    this.zoom = Math.max(0, Math.min(1, value));
  }

  nudgeZoom(delta: number): void {
    this.setZoom(this.zoom + delta);
  }

  shake(amount: number): void {
    if (this.reducedMotion) return;
    this.shakeAmount = Math.min(0.6, this.shakeAmount + amount);
  }

  follow(x: number, z: number, dt: number): void {
    this.target.set(x, 0, z);
    const lerp = Math.min(1, dt * 5.5);
    this.smoothed.lerp(this.target, lerp);

    const distance = NEAR.distance + (FAR.distance - NEAR.distance) * this.zoom;
    const height = NEAR.height + (FAR.height - NEAR.height) * this.zoom;

    this.shakeAmount *= Math.exp(-dt * 6);
    const jitter = this.reducedMotion ? 0 : this.shakeAmount;
    this.camera.position.set(
      this.smoothed.x + (Math.random() - 0.5) * jitter,
      height + (Math.random() - 0.5) * jitter,
      this.smoothed.z + distance + (Math.random() - 0.5) * jitter
    );
    this.camera.lookAt(this.smoothed.x, 1.1 + this.zoom * 1.4, this.smoothed.z);
  }

  updateAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}

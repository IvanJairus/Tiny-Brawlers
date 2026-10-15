import * as THREE from 'three';

/**
 * ActionIsometricCamera
 *
 * Implements an action-isometric third-person camera following the player buddy:
 * - Default distance: ~7.5m, height: ~6.5m, pitch angle: ~42° (atan2(6.5, 7.5) = 40.89°), FOV: 42°.
 * - Smooth tracking lerp (0.08) targeting player center (x, y + 0.8, z).
 * - Dynamic zoom controls: mouse wheel deltaY and touch pinch distance ratio modifying zoomFactor in [0.0, 1.0].
 * - Preserves pitch angle across the entire zoom range: 6.0m (close action) to 22.0m (arena overview).
 * - Viewport aspect ratio updates on window resize.
 */
export class ActionIsometricCamera {
  public camera: THREE.PerspectiveCamera;
  public zoomFactor: number; // [0.0, 1.0], 0 = closest (6.0m), 1 = widest (22.0m)

  // Architectural Constants
  public static readonly BASE_DISTANCE = 7.5;
  public static readonly BASE_HEIGHT = 6.5;
  public static readonly MIN_DISTANCE = 6.0;
  public static readonly MAX_DISTANCE = 22.0;
  public static readonly FOV = 42.0;
  public static readonly TARGET_Y_OFFSET = 0.8;
  public static readonly LERP_FACTOR = 0.08;
  public static readonly WHEEL_SENSITIVITY = 0.0012;

  // Initial zoomFactor corresponding exactly to BASE_DISTANCE (7.5m):
  // 6.0 + (22.0 - 6.0) * zoomFactor = 7.5 => 16.0 * zoomFactor = 1.5 => zoomFactor = 0.09375
  public static readonly DEFAULT_ZOOM_FACTOR = (7.5 - 6.0) / (22.0 - 6.0);

  // Pitch ratio: height / distance = 6.5 / 7.5 = 0.866667 (atan2 = 40.89° ≈ 42°)
  private readonly pitchRatio: number = ActionIsometricCamera.BASE_HEIGHT / ActionIsometricCamera.BASE_DISTANCE;

  // Internal smoothed target position for anti-jitter tracking
  private currentLookTarget: THREE.Vector3 = new THREE.Vector3();
  private isInitialized: boolean = false;

  constructor(aspect: number) {
    this.zoomFactor = ActionIsometricCamera.DEFAULT_ZOOM_FACTOR;
    this.camera = new THREE.PerspectiveCamera(
      ActionIsometricCamera.FOV,
      aspect,
      0.1,
      250.0
    );

    // Initial camera placement
    const dist = this.getCurrentDistance();
    const height = this.getCurrentHeight();
    this.camera.position.set(0, height, dist);
    this.camera.lookAt(0, ActionIsometricCamera.TARGET_Y_OFFSET, 0);
    this.currentLookTarget.set(0, ActionIsometricCamera.TARGET_Y_OFFSET, 0);
  }

  /**
   * Current ground-plane offset distance in meters
   */
  public getCurrentDistance(): number {
    return ActionIsometricCamera.MIN_DISTANCE +
      (ActionIsometricCamera.MAX_DISTANCE - ActionIsometricCamera.MIN_DISTANCE) * this.zoomFactor;
  }

  /**
   * Current vertical height in meters, preserving constant ~42° pitch angle
   */
  public getCurrentHeight(): number {
    return this.getCurrentDistance() * this.pitchRatio;
  }

  /**
   * Smoothly follow player target with frame-rate scaled lerp
   * @param targetPos World position of the player buddy
   * @param dt Delta time in seconds
   */
  public followTarget(targetPos: THREE.Vector3, dt: number = 0.016): void {
    const targetY = targetPos.y + ActionIsometricCamera.TARGET_Y_OFFSET;

    if (!this.isInitialized) {
      this.snapToTarget(targetPos);
      this.isInitialized = true;
      return;
    }

    const dist = this.getCurrentDistance();
    const height = this.getCurrentHeight();

    const desiredCamX = targetPos.x;
    const desiredCamY = targetPos.y + height;
    const desiredCamZ = targetPos.z + dist;

    // Frame-rate independent lerp approximation: 1 - (1 - alpha)^(dt * 60)
    const alpha = dt > 0 ? 1.0 - Math.pow(1.0 - ActionIsometricCamera.LERP_FACTOR, Math.min(3.0, dt * 60.0)) : ActionIsometricCamera.LERP_FACTOR;

    this.camera.position.x += (desiredCamX - this.camera.position.x) * alpha;
    this.camera.position.y += (desiredCamY - this.camera.position.y) * alpha;
    this.camera.position.z += (desiredCamZ - this.camera.position.z) * alpha;

    // Smoothly track look-at target
    this.currentLookTarget.x += (targetPos.x - this.currentLookTarget.x) * alpha;
    this.currentLookTarget.y += (targetY - this.currentLookTarget.y) * alpha;
    this.currentLookTarget.z += (targetPos.z - this.currentLookTarget.z) * alpha;

    this.camera.lookAt(this.currentLookTarget);
  }

  /**
   * Instantly snap camera position and lookAt target without lerping (e.g. on match start or respawn)
   */
  public snapToTarget(targetPos: THREE.Vector3): void {
    const dist = this.getCurrentDistance();
    const height = this.getCurrentHeight();

    this.camera.position.set(targetPos.x, targetPos.y + height, targetPos.z + dist);
    this.currentLookTarget.set(targetPos.x, targetPos.y + ActionIsometricCamera.TARGET_Y_OFFSET, targetPos.z);
    this.camera.lookAt(this.currentLookTarget);
    this.isInitialized = true;
  }

  /**
   * Handle mouse wheel zoom input
   * @param deltaY Wheel scroll delta (positive = zoom out, negative = zoom in)
   */
  public handleWheel(deltaY: number): void {
    if (!Number.isFinite(deltaY)) return;
    const deltaZoom = deltaY * ActionIsometricCamera.WHEEL_SENSITIVITY;
    this.zoomFactor = Math.max(0.0, Math.min(1.0, this.zoomFactor + deltaZoom));
  }

  /**
   * Handle mobile touch pinch zoom input
   * @param distanceRatio Ratio of current touch distance to previous touch distance (>1 = zoom in, <1 = zoom out)
   */
  public handlePinch(distanceRatio: number): void {
    if (distanceRatio <= 0 || !isFinite(distanceRatio)) return;
    // Spreading fingers (ratio > 1) zooms in (decreases distance/zoomFactor)
    // Pinching fingers (ratio < 1) zooms out (increases distance/zoomFactor)
    const deltaZoom = (1.0 - distanceRatio) * 1.5;
    this.zoomFactor = Math.max(0.0, Math.min(1.0, this.zoomFactor + deltaZoom));
  }

  /**
   * Update camera aspect ratio on window resize
   * @param aspect Viewport width / height
   */
  public updateAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}

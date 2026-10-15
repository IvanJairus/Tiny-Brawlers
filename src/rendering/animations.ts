import * as THREE from 'three';
import { BuddyEntity } from '../entities/buddy';
import { AnimState, BuddyClass, CLASS_PROPERTIES } from '../types';
import { ChibiRigInstance, ExpressionType } from './buddyRig';

/* =========================================================================
   Types & Interfaces
   ========================================================================= */

export type ProceduralAnimMode =
  | 'idle'
  | 'walk'
  | 'carry_idle'
  | 'carry_walk'
  | 'celebrate'
  | 'knocked'
  | 'throw';

export interface TransformFrame {
  // Body Torso
  bodyPosY: number;
  bodyRotX: number;
  bodyRotY: number;
  bodyRotZ: number;
  bodyScaleX: number;
  bodyScaleY: number;
  bodyScaleZ: number;

  // Hand Pivots
  leftHandPosY: number;
  leftHandRotX: number;
  leftHandRotY: number;
  leftHandRotZ: number;

  rightHandPosY: number;
  rightHandRotX: number;
  rightHandRotY: number;
  rightHandRotZ: number;

  // Boot Pivots
  leftBootPosY: number;
  leftBootPosZ: number;
  rightBootPosY: number;
  rightBootPosZ: number;

  // Shadow
  shadowScale: number;

  // Carried Crate Bob Offset
  crateBobY: number;
}

export interface BuddyAnimTracker {
  stridePhase: number;
  facingAngle: number;
  lastVelocity: { x: number; z: number };
  currentMode: ProceduralAnimMode;
  blinkTimer: number;
  throwTimer: number;
  celebrateTimer: number;
}

/* =========================================================================
   State Registry & Memory Management
   ========================================================================= */

const animTrackers = new Map<string, BuddyAnimTracker>();

export function getBuddyAnimTracker(buddyId: string): BuddyAnimTracker {
  let tracker = animTrackers.get(buddyId);
  if (!tracker) {
    tracker = {
      stridePhase: 0,
      facingAngle: 0,
      lastVelocity: { x: 0, z: 0 },
      currentMode: 'idle',
      blinkTimer: 2.0 + Math.random() * 3.0,
      throwTimer: 0,
      celebrateTimer: 0
    };
    animTrackers.set(buddyId, tracker);
  }
  return tracker;
}

export function triggerBuddyCelebrate(buddyId: string, durationSeconds: number = 2.5): void {
  const tracker = getBuddyAnimTracker(buddyId);
  tracker.celebrateTimer = durationSeconds;
}

export function triggerBuddyThrow(buddyId: string, durationSeconds: number = 0.3): void {
  const tracker = getBuddyAnimTracker(buddyId);
  tracker.throwTimer = durationSeconds;
}

export function cleanupStaleAnimTrackers(activeBuddyIds: string[]): void {
  const activeSet = new Set(activeBuddyIds);
  for (const id of animTrackers.keys()) {
    if (!activeSet.has(id)) {
      animTrackers.delete(id);
    }
  }
}

export function resetAllAnimTrackers(): void {
  animTrackers.clear();
}

/* =========================================================================
   Mathematical Helpers
   ========================================================================= */

/** Shortest-arc angular difference between two angles in radians */
export function shortestAngleDiff(target: number, current: number): number {
  let diff = (target - current) % (Math.PI * 2);
  if (diff < -Math.PI) diff += Math.PI * 2;
  if (diff > Math.PI) diff -= Math.PI * 2;
  return diff;
}

/** Smoothly interpolate an angle towards target using exponential decay */
export function lerpAngle(current: number, target: number, speed: number, dt: number): number {
  const diff = shortestAngleDiff(target, current);
  const factor = 1.0 - Math.exp(-speed * dt);
  return current + diff * factor;
}

/* =========================================================================
   Pure Mathematical Animation Evaluators
   ========================================================================= */

/**
 * 1. Procedural Squash-and-Stretch Volume-Preserving Idle Bounce
 * Derived from team-buddies-preview.html:983-995
 */
export function calculateIdleBounce(time: number): TransformFrame {
  const bounce = Math.sin(time * 4.0);
  const bodyPosY = 0.70 + Math.max(0, bounce) * 0.08;
  const scaleY = 1.0 + bounce * 0.06;
  const scaleXZ = 1.0 - bounce * 0.03; // Volume preservation (Sx*Sy*Sz = 0.997 ≈ 1.0)

  const armAngle = Math.sin(time * 4.0) * 0.20;

  return {
    bodyPosY,
    bodyRotX: 0,
    bodyRotY: 0,
    bodyRotZ: 0,
    bodyScaleX: scaleXZ,
    bodyScaleY: scaleY,
    bodyScaleZ: scaleXZ,

    leftHandPosY: -0.02,
    leftHandRotX: armAngle,
    leftHandRotY: 0,
    leftHandRotZ: 0,

    rightHandPosY: -0.02,
    rightHandRotX: -armAngle,
    rightHandRotY: 0,
    rightHandRotZ: 0,

    leftBootPosY: 0.14,
    leftBootPosZ: 0,
    rightBootPosY: 0.14,
    rightBootPosZ: 0,

    shadowScale: 1.0 - Math.max(0, bounce) * 0.12,
    crateBobY: 0
  };
}

/**
 * 2. Walk Cycle: Waddle Sway, Stride Bounce, Stepping Lift, Arm Swings
 * Derived from team-buddies-preview.html:996-1006
 */
export function calculateWalkCycle(phase: number, speedRatio: number = 1.0): TransformFrame {
  // Vertical bounce occurs at double the stride frequency (once per step)
  const bodyPosY = 0.72 + Math.abs(Math.sin(phase)) * 0.06;

  // Side-to-side waddle sway occurs across full stride cycle
  const bodyRotZ = Math.sin(phase) * 0.06;

  // Forward torso lean proportional to movement speed
  const bodyRotX = 0.05 * Math.min(1.0, speedRatio);

  // Alternating boot strides along local Z axis
  const leftBootPosZ = Math.sin(phase) * 0.22;
  const rightBootPosZ = -Math.sin(phase) * 0.22;

  // Half-wave rectified vertical foot lift (planted foot stays at 0.14m)
  const leftBootPosY = 0.14 + Math.max(0, -Math.sin(phase)) * 0.08;
  const rightBootPosY = 0.14 + Math.max(0, Math.sin(phase)) * 0.08;

  // Alternating counter-balancing arm swings
  const leftHandRotX = -Math.sin(phase) * 0.60;
  const rightHandRotX = Math.sin(phase) * 0.60;

  return {
    bodyPosY,
    bodyRotX,
    bodyRotY: 0,
    bodyRotZ,
    bodyScaleX: 1.0,
    bodyScaleY: 1.0,
    bodyScaleZ: 1.0,

    leftHandPosY: -0.02,
    leftHandRotX,
    leftHandRotY: 0,
    leftHandRotZ: 0,

    rightHandPosY: -0.02,
    rightHandRotX,
    rightHandRotY: 0,
    rightHandRotZ: 0,

    leftBootPosY,
    leftBootPosZ,
    rightBootPosY,
    rightBootPosZ,

    shadowScale: 1.0,
    crateBobY: 0
  };
}

/**
 * 3. Overhead Crate Carrying Pose (Stationary & Walking)
 * Derived from team-buddies-preview.html:1007-1013
 */
export function calculateCarryPose(time: number, isMoving: boolean, phase: number = 0): TransformFrame {
  const armRaiseX = -Math.PI * 0.65; // ~ -117 degrees overhead
  const shoulderY = 0.35; // Shrugged high

  if (!isMoving) {
    // Stationary carry: Breathing squish under load
    const breathe = Math.sin(time * 4.0) * 0.03;
    const bodyPosY = 0.68 + breathe;

    return {
      bodyPosY,
      bodyRotX: 0,
      bodyRotY: 0,
      bodyRotZ: 0,
      bodyScaleX: 1.04, // Under-load compression
      bodyScaleY: 0.96,
      bodyScaleZ: 1.04,

      leftHandPosY: shoulderY,
      leftHandRotX: armRaiseX,
      leftHandRotY: 0,
      leftHandRotZ: -0.12, // Slight flare to cradle crate

      rightHandPosY: shoulderY,
      rightHandRotX: armRaiseX,
      rightHandRotY: 0,
      rightHandRotZ: 0.12,

      leftBootPosY: 0.14,
      leftBootPosZ: 0,
      rightBootPosY: 0.14,
      rightBootPosZ: 0,

      shadowScale: 1.02,
      crateBobY: breathe
    };
  } else {
    // Walking carry: Legs waddle, torso sways, hands maintain overhead grip with dynamic bob
    const bodyPosY = 0.68 + Math.abs(Math.sin(phase)) * 0.05;
    const bodyRotZ = Math.sin(phase) * 0.06;
    const walkBob = Math.sin(phase) * 0.05;

    return {
      bodyPosY,
      bodyRotX: 0.04,
      bodyRotY: 0,
      bodyRotZ,
      bodyScaleX: 1.04,
      bodyScaleY: 0.96,
      bodyScaleZ: 1.04,

      leftHandPosY: shoulderY,
      leftHandRotX: armRaiseX + walkBob * 0.2,
      leftHandRotY: 0,
      leftHandRotZ: -0.12,

      rightHandPosY: shoulderY,
      rightHandRotX: armRaiseX + walkBob * 0.2,
      rightHandRotY: 0,
      rightHandRotZ: 0.12,

      leftBootPosY: 0.14 + Math.max(0, -Math.sin(phase)) * 0.08,
      leftBootPosZ: Math.sin(phase) * 0.20,
      rightBootPosY: 0.14 + Math.max(0, Math.sin(phase)) * 0.08,
      rightBootPosZ: -Math.sin(phase) * 0.20,

      shadowScale: 1.02,
      crateBobY: walkBob
    };
  }
}

/**
 * 4. Celebrate Jump: Vertical Leap, Cheering Arms Wave, In-Air Stretch
 * Derived from team-buddies-preview.html:1014-1021
 */
export function calculateCelebrateJump(time: number): TransformFrame {
  const jump = Math.abs(Math.sin(time * 7.0));
  const bodyPosY = 0.72 + jump * 0.30; // 0.30m vertical leap

  // Cheering arm wave at 12 rad/s
  const cheerBase = -Math.PI * 0.85; // ~ -153 degrees
  const wave = Math.sin(time * 12.0) * 0.25;

  // Stretch in air
  const scaleY = 1.0 + jump * 0.15;
  const scaleXZ = 1.0 - jump * 0.08;

  // Feet tuck slightly at leap apex
  const bootLift = 0.14 + jump * 0.15;

  return {
    bodyPosY,
    bodyRotX: 0,
    bodyRotY: Math.sin(time * 4.0) * 0.35, // Celebration dance twist
    bodyRotZ: 0,
    bodyScaleX: scaleXZ,
    bodyScaleY: scaleY,
    bodyScaleZ: scaleXZ,

    leftHandPosY: 0.20,
    leftHandRotX: cheerBase + wave,
    leftHandRotY: 0,
    leftHandRotZ: -0.20,

    rightHandPosY: 0.20,
    rightHandRotX: cheerBase - wave,
    rightHandRotY: 0,
    rightHandRotZ: 0.20,

    leftBootPosY: bootLift,
    leftBootPosZ: 0,
    rightBootPosY: bootLift,
    rightBootPosZ: 0,

    shadowScale: 1.0 - jump * 0.35,
    crateBobY: 0
  };
}

/**
 * 5. Knocked-Down Pose: Back Collapse, Limp Splayed Limbs, Dazed Twitch
 */
export function calculateKnockedPose(time: number): TransformFrame {
  const twitch = Math.sin(time * 3.0) * 0.04;

  return {
    bodyPosY: 0.25, // Down flat on the ground
    bodyRotX: -Math.PI * 0.45, // Fallen back ~81 degrees
    bodyRotY: 0,
    bodyRotZ: twitch,
    bodyScaleX: 1.10, // Flattened impact compression
    bodyScaleY: 0.85,
    bodyScaleZ: 1.10,

    leftHandPosY: 0.10,
    leftHandRotX: -0.30,
    leftHandRotY: 0,
    leftHandRotZ: -0.70, // Splayed out limp

    rightHandPosY: 0.10,
    rightHandRotX: -0.30,
    rightHandRotY: 0,
    rightHandRotZ: 0.70,

    leftBootPosY: 0.10,
    leftBootPosZ: 0.25,
    rightBootPosY: 0.10,
    rightBootPosZ: 0.25,

    shadowScale: 1.15,
    crateBobY: 0
  };
}

/**
 * 6. Throw Impulse Pose: Fast Forward Arm Swing & Torso Pitch (~0.3s)
 */
export function calculateThrowPose(progress01: number): TransformFrame {
  const p = Math.max(0, Math.min(1, progress01));
  // Arms swing from overhead (-0.65π) forward and down (+0.2π)
  const armAngle = -Math.PI * 0.65 + p * (Math.PI * 0.85);
  const handPosY = 0.35 * (1 - p) + (-0.02) * p;
  const torsoPitch = Math.sin(p * Math.PI) * 0.20;

  return {
    bodyPosY: 0.70,
    bodyRotX: torsoPitch,
    bodyRotY: 0,
    bodyRotZ: 0,
    bodyScaleX: 1.0,
    bodyScaleY: 1.0,
    bodyScaleZ: 1.0,

    leftHandPosY: handPosY,
    leftHandRotX: armAngle,
    leftHandRotY: 0,
    leftHandRotZ: 0,

    rightHandPosY: handPosY,
    rightHandRotX: armAngle,
    rightHandRotY: 0,
    rightHandRotZ: 0,

    leftBootPosY: 0.14,
    leftBootPosZ: 0,
    rightBootPosY: 0.14,
    rightBootPosZ: 0,

    shadowScale: 1.0,
    crateBobY: 0
  };
}

/* =========================================================================
   Primary Exported Animation Coordinator
   ========================================================================= */

/**
 * Evaluates and applies all procedural animations to a ChibiRigInstance
 * according to BuddyEntity physics, class stats, and gameplay state.
 */
export function updateBuddyProceduralAnimation(
  rig: ChibiRigInstance,
  buddy: BuddyEntity,
  dt: number,
  time: number
): void {
  const safeDt = Math.max(0, Math.min(dt, 0.1));
  const tracker = getBuddyAnimTracker(buddy.id);

  // 1. Calculate Velocity & Speed
  const vx = buddy.velocity ? buddy.velocity.x : 0;
  const vz = buddy.velocity ? buddy.velocity.z : 0;
  const speed = Math.hypot(vx, vz);
  const isMoving = speed > 0.05 && !buddy.isKnocked;

  // 2. Heading Rotation with Shortest-Arc Lerp
  if (isMoving) {
    // In Chibi rig, front is +Z, so target angle is atan2(vx, vz)
    const targetAngle = Math.atan2(vx, vz);
    tracker.facingAngle = lerpAngle(tracker.facingAngle, targetAngle, 14.0, safeDt);
  }
  rig.root.rotation.y = tracker.facingAngle;

  // 3. Stride Phase Accumulation (Speed-Adaptive Cadence)
  if (isMoving) {
    const baseSpeed = CLASS_PROPERTIES[buddy.classType]?.moveSpeed || 6.8;
    const speedRatio = Math.max(0.6, Math.min(1.4, speed / baseSpeed));
    const strideFreq = 10.0 * speedRatio; // Base cadence is 10 rad/s
    tracker.stridePhase = (tracker.stridePhase + strideFreq * safeDt) % (Math.PI * 2);
  }

  // 4. Update Timers
  if (tracker.throwTimer > 0) tracker.throwTimer -= safeDt;
  if (tracker.celebrateTimer > 0) tracker.celebrateTimer -= safeDt;
  tracker.blinkTimer -= safeDt;

  // 5. State Machine Resolution
  let frame: TransformFrame;
  let targetExpr: ExpressionType = 'happy';

  if (buddy.isKnocked) {
    tracker.currentMode = 'knocked';
    frame = calculateKnockedPose(time);
    targetExpr = 'surprise';
  } else if (tracker.celebrateTimer > 0) {
    tracker.currentMode = 'celebrate';
    frame = calculateCelebrateJump(time);
    targetExpr = 'wink';
  } else if (tracker.throwTimer > 0) {
    tracker.currentMode = 'throw';
    const progress = 1.0 - tracker.throwTimer / 0.3;
    frame = calculateThrowPose(progress);
    targetExpr = 'angry';
  } else if (buddy.isCarryingCrate) {
    if (isMoving) {
      tracker.currentMode = 'carry_walk';
      frame = calculateCarryPose(time, true, tracker.stridePhase);
    } else {
      tracker.currentMode = 'carry_idle';
      frame = calculateCarryPose(time, false);
    }
    targetExpr = 'angry'; // Effort expression under load
  } else if (isMoving) {
    tracker.currentMode = 'walk';
    const baseSpeed = CLASS_PROPERTIES[buddy.classType]?.moveSpeed || 6.8;
    frame = calculateWalkCycle(tracker.stridePhase, speed / baseSpeed);
    targetExpr = 'happy';
  } else {
    tracker.currentMode = 'idle';
    frame = calculateIdleBounce(time);
    targetExpr = 'happy';
  }

  // 6. Natural Playful Blinking & Winking in Idle/Walk
  if (targetExpr === 'happy') {
    if (tracker.blinkTimer <= 0) {
      targetExpr = 'wink';
      if (tracker.blinkTimer <= -0.22) {
        // Reset blink timer every 3 to 6 seconds
        tracker.blinkTimer = 3.0 + Math.random() * 3.0;
      }
    }
  }

  // 7. Apply Facial Expression
  if (rig.currentExpression !== targetExpr) {
    rig.setExpression(targetExpr);
  }

  // 8. Apply Transforms to Rig Pivots & Meshes
  // Torso
  rig.bodyMesh.position.y = frame.bodyPosY;
  rig.bodyMesh.rotation.x = frame.bodyRotX;
  rig.bodyMesh.rotation.y = frame.bodyRotY;
  rig.bodyMesh.rotation.z = frame.bodyRotZ;
  rig.bodyMesh.scale.set(frame.bodyScaleX, frame.bodyScaleY, frame.bodyScaleZ);

  // Left Hand
  rig.leftHandPivot.position.y = frame.leftHandPosY;
  rig.leftHandPivot.rotation.x = frame.leftHandRotX;
  rig.leftHandPivot.rotation.y = frame.leftHandRotY;
  rig.leftHandPivot.rotation.z = frame.leftHandRotZ;

  // Right Hand
  rig.rightHandPivot.position.y = frame.rightHandPosY;
  rig.rightHandPivot.rotation.x = frame.rightHandRotX;
  rig.rightHandPivot.rotation.y = frame.rightHandRotY;
  rig.rightHandPivot.rotation.z = frame.rightHandRotZ;

  // Boots
  rig.leftBootPivot.position.y = frame.leftBootPosY;
  rig.leftBootPivot.position.z = frame.leftBootPosZ;
  rig.rightBootPivot.position.y = frame.rightBootPosY;
  rig.rightBootPivot.position.z = frame.rightBootPosZ;

  // Shadow Scale
  rig.shadowMesh.scale.set(frame.shadowScale, frame.shadowScale, 1.0);

  // Sync Carried Crate Prop Visibility
  if (buddy.isCarryingCrate) {
    if (rig.currentWeapon !== 'crate') {
      rig.setEquippedWeapon('crate');
    }
    // Dynamic vertical walking bob of carried crate
    rig.carriedCrateProp.position.y = 1.05 + frame.crateBobY;
  } else {
    if (rig.currentWeapon === 'crate' || rig.currentWeapon !== buddy.weapon) {
      rig.setEquippedWeapon(buddy.weapon);
    }
  }
}

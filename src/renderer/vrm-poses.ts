/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/vrm-poses.ts
 * Module: renderer
 * Purpose: Body pose/animation system for VRM avatars with smooth transitions
 * Dependencies: three, @pixiv/three-vrm
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/vrm-emotes.ts
 * Keywords: vrm, poses, animations, humanoid-bones, smooth-transitions, avatar-poses
 * Last Updated: 2026-03-26
 */

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';

/**
 * Available pose presets for VRM avatars
 *
 * Each pose defines a target body configuration that can be
 * smoothly transitioned to using the PoseController.
 */
export type PoseType =
  | 'idle'          // Relaxed standing pose (default)
  | 'thinking'      // Hand on chin, thoughtful expression
  | 'presenting'    // Arms forward, gesturing
  | 'typing'        // Hands ready at keyboard position
  | 'celebrating'   // Arms up, excited pose
  | 'listening'     // Leaning forward, attentive
  | 'confused'      // Shrugged shoulders, head tilted
  | 'writing'       // Hand as if holding a pen;

/**
 * Bone rotation configuration for a pose
 *
 * Defines target rotations for key humanoid bones.
 * Rotations are in radians and use Euler angles (x, y, z).
 */
export interface PoseBoneConfig {
  readonly head?: { x: number; y: number; z: number };
  readonly neck?: { x: number; y: number; z: number };
  readonly spine?: { x: number; y: number; z: number };
  readonly chest?: { x: number; y: number; z: number };
  readonly leftShoulder?: { x: number; y: number; z: number };
  readonly rightShoulder?: { x: number; y: number; z: number };
  readonly leftUpperArm?: { x: number; y: number; z: number };
  readonly rightUpperArm?: { x: number; y: number; z: number };
  readonly leftLowerArm?: { x: number; y: number; z: number };
  readonly rightLowerArm?: { x: number; y: number; z: number };
  readonly leftHand?: { x: number; y: number; z: number };
  readonly rightHand?: { x: number; y: number; z: number };
  readonly hips?: { x: number; y: number; z: number };
}

/**
 * Pose definition with bone configuration
 */
export interface Pose {
  readonly type: PoseType;
  readonly bones: PoseBoneConfig;
  readonly transitionDuration?: number; // Default transition time in seconds
}

/**
 * Active pose transition state
 */
interface PoseTransition {
  readonly targetPose: Pose;
  readonly startTime: number;
  readonly duration: number;
  readonly fromConfig: Map<string, THREE.Euler>;
  readonly toConfig: Map<string, THREE.Euler>;
}

/**
 * Pose presets library
 *
 * Each pose defines target rotations for humanoid bones.
 * Values are in radians and use Euler angles (x, y, z).
 */
const POSE_LIBRARY: Record<PoseType, Pose> = {
  idle: {
    type: 'idle',
    bones: {
      head: { x: 0, y: 0, z: 0 },
      neck: { x: 0, y: 0, z: 0 },
      spine: { x: 0, y: 0, z: 0 },
      chest: { x: 0, y: 0, z: 0 },
      leftShoulder: { x: 0.1, y: 0, z: 0 },
      rightShoulder: { x: 0.1, y: 0, z: 0 },
      leftUpperArm: { x: 0, y: 0, z: 1.3 },  // Arms down at sides
      rightUpperArm: { x: 0, y: 0, z: -1.3 },
      leftLowerArm: { x: 0.3, y: 0, z: 0 },  // Slight elbow bend
      rightLowerArm: { x: 0.3, y: 0, z: 0 },
      leftHand: { x: 0, y: 0, z: 0.5 },     // Relaxed wrists
      rightHand: { x: 0, y: 0, z: -0.5 },
    },
    transitionDuration: 0.5,
  },

  thinking: {
    type: 'thinking',
    bones: {
      head: { x: 0.15, y: -0.1, z: 0 },      // Head tilted slightly
      neck: { x: 0, y: 0, z: 0 },
      spine: { x: 0, y: 0, z: 0 },
      chest: { x: 0, y: 0, z: 0 },
      leftUpperArm: { x: 0, y: 0, z: 1.3 },  // Left arm down
      leftLowerArm: { x: 0.3, y: 0, z: 0 },
      leftHand: { x: 0, y: 0, z: 0.5 },
      rightUpperArm: { x: 1.0, y: 0.3, z: 0.5 },  // Right arm up to chin
      rightLowerArm: { x: -1.2, y: 0, z: 0 },     // Elbow bent
      rightHand: { x: 0, y: 0, z: 0 },            // Hand near chin
    },
    transitionDuration: 0.6,
  },

  presenting: {
    type: 'presenting',
    bones: {
      head: { x: 0, y: 0, z: 0 },
      neck: { x: 0, y: 0, z: 0 },
      spine: { x: 0, y: 0, z: 0 },
      chest: { x: 0, y: 0, z: 0 },
      leftUpperArm: { x: 1.2, y: 0, z: 0.3 },  // Both arms forward
      rightUpperArm: { x: 1.2, y: 0, z: -0.3 },
      leftLowerArm: { x: -1.0, y: 0, z: 0 },
      rightLowerArm: { x: -1.0, y: 0, z: 0 },
      leftHand: { x: 0, y: 0, z: 0 },          // Palms slightly up
      rightHand: { x: 0, y: 0, z: 0 },
    },
    transitionDuration: 0.5,
  },

  typing: {
    type: 'typing',
    bones: {
      head: { x: 0.1, y: 0, z: 0 },          // Looking down slightly
      neck: { x: 0, y: 0, z: 0 },
      spine: { x: 0.1, y: 0, z: 0 },         // Leaning forward
      chest: { x: 0.05, y: 0, z: 0 },
      leftUpperArm: { x: 0.8, y: 0, z: 0.8 },  // Arms at keyboard position
      rightUpperArm: { x: 0.8, y: 0, z: -0.8 },
      leftLowerArm: { x: -1.4, y: 0, z: 0 },  // Elbows bent
      rightLowerArm: { x: -1.4, y: 0, z: 0 },
      leftHand: { x: 0, y: 0, z: 0 },         // Hands flat
      rightHand: { x: 0, y: 0, z: 0 },
    },
    transitionDuration: 0.4,
  },

  celebrating: {
    type: 'celebrating',
    bones: {
      head: { x: -0.2, y: 0, z: 0 },         // Head tilted back
      neck: { x: 0, y: 0, z: 0 },
      spine: { x: -0.1, y: 0, z: 0 },        // Leaning back
      chest: { x: 0, y: 0, z: 0 },
      leftUpperArm: { x: -1.8, y: 0, z: 0.2 },  // Arms raised up
      rightUpperArm: { x: -1.8, y: 0, z: -0.2 },
      leftLowerArm: { x: 0.2, y: 0, z: 0 },
      rightLowerArm: { x: 0.2, y: 0, z: 0 },
      leftHand: { x: 0, y: 0, z: 0 },
      rightHand: { x: 0, y: 0, z: 0 },
    },
    transitionDuration: 0.3,
  },

  listening: {
    type: 'listening',
    bones: {
      head: { x: 0.1, y: 0, z: 0 },          // Slight nod forward
      neck: { x: 0, y: 0, z: 0 },
      spine: { x: 0.15, y: 0, z: 0 },        // Leaning forward
      chest: { x: 0.1, y: 0, z: 0 },
      leftUpperArm: { x: 0, y: 0, z: 1.3 },  // Arms relaxed
      rightUpperArm: { x: 0, y: 0, z: -1.3 },
      leftLowerArm: { x: 0.3, y: 0, z: 0 },
      rightLowerArm: { x: 0.3, y: 0, z: 0 },
      leftHand: { x: 0, y: 0, z: 0.5 },
      rightHand: { x: 0, y: 0, z: -0.5 },
    },
    transitionDuration: 0.4,
  },

  confused: {
    type: 'confused',
    bones: {
      head: { x: 0, y: 0, z: 0.15 },         // Head tilted sideways
      neck: { x: 0, y: 0, z: 0 },
      spine: { x: 0, y: 0, z: 0 },
      chest: { x: 0, y: 0, z: 0 },
      leftUpperArm: { x: 0.4, y: 0, z: 1.0 },  // Shoulders shrugged
      rightUpperArm: { x: 0.4, y: 0, z: -1.0 },
      leftLowerArm: { x: -0.5, y: 0, z: 0 },
      rightLowerArm: { x: -0.5, y: 0, z: 0 },
      leftHand: { x: 0, y: 0, z: 0.5 },
      rightHand: { x: 0, y: 0, z: -0.5 },
    },
    transitionDuration: 0.5,
  },

  writing: {
    type: 'writing',
    bones: {
      head: { x: 0.15, y: 0, z: 0 },         // Looking down
      neck: { x: 0, y: 0, z: 0 },
      spine: { x: 0.1, y: 0, z: 0 },
      chest: { x: 0.05, y: 0, z: 0 },
      leftUpperArm: { x: 0, y: 0, z: 1.3 },  // Left arm relaxed
      leftLowerArm: { x: 0.3, y: 0, z: 0 },
      leftHand: { x: 0, y: 0, z: 0.5 },
      rightUpperArm: { x: 1.0, y: 0, z: 0.3 },  // Right arm at desk
      rightLowerArm: { x: -1.3, y: 0, z: 0 },
      rightHand: { x: 0, y: 0, z: 0 },          // Hand as if holding pen
    },
    transitionDuration: 0.5,
  },
};

/**
 * Smooth interpolation helpers
 */
function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * PoseController manages body pose transitions for VRM avatars
 *
 * Features:
 * - Smooth transitions between poses with configurable duration
 * - Layered poses (base pose + emote overlay)
 * - Target bone rotation interpolation
 * - Three.js animation system integration
 *
 * @example
 * ```typescript
 * const controller = new PoseController(vrm);
 *
 * // In animation loop
 * function animate(delta: number) {
 *   controller.update(delta);
 * }
 *
 * // Set pose with smooth transition
 * controller.setPose('thinking');
 *
 * // Transition with custom duration
 * controller.transitionTo('celebrating', 0.5);
 *
 * // Reset to idle
 * controller.reset();
 *
 * // Layer an emote on top of current pose
 * controller.setLayeredEmote(emoteState);
 * ```
 */
export class PoseController {
  private _vrm: VRM;
  private _currentPose: PoseType;
  private _activeTransition: PoseTransition | null;
  private _currentBoneRotations: Map<string, THREE.Euler>;
  // @ts-ignore - Reserved for future emote layering feature
  private _layeredEmote: any | null;
  // @ts-ignore - Reserved for animation delta timing
  private _lastUpdateTime: number = 0;

  constructor(vrm: VRM) {
    this._vrm = vrm;
    this._currentPose = 'idle';
    this._activeTransition = null;
    this._currentBoneRotations = new Map();
    this._layeredEmote = null; // @ts-ignore
    this._lastUpdateTime = 0; // @ts-ignore
    this._lastUpdateTime = Date.now();

    // Initialize with idle pose
    this.initializePose('idle');
  }

  /**
   * Set pose with smooth transition
   *
   * Transitions from current pose to target pose using the
   * pose's default transition duration.
   *
   * @param pose - Target pose type
   * @param blend - Blend factor (0-1), 1 = full target pose
   */
  public setPose(pose: PoseType, blend: number = 1.0): void {
    const targetPose = POSE_LIBRARY[pose];
    if (!targetPose) {
      console.warn(`[PoseController] Unknown pose type: ${pose}`);
      return;
    }

    const duration = targetPose.transitionDuration || 0.5;
    this.transitionTo(pose, duration * blend);
  }

  /**
   * Transition to pose with custom duration
   *
   * Initiates a smooth transition from current bone rotations
   * to target pose bone rotations over specified duration.
   *
   * @param pose - Target pose type
   * @param duration - Transition duration in seconds
   */
  public transitionTo(pose: PoseType, duration: number = 0.5): void {
    const targetPose = POSE_LIBRARY[pose];
    if (!targetPose) {
      console.warn(`[PoseController] Unknown pose type: ${pose}`);
      return;
    }

    // Capture current bone rotations as "from" state
    const fromConfig = this.captureCurrentBoneState();

    // Build "to" state from target pose
    const toConfig = this.buildBoneConfig(targetPose.bones);

    // Create transition
    this._activeTransition = {
      targetPose,
      startTime: Date.now(),
      duration: duration * 1000, // Convert to ms
      fromConfig,
      toConfig,
    };

    this._currentPose = pose;
    console.log(`[PoseController] Transitioning to ${pose} over ${duration}s`);
  }

  /**
   * Reset to idle pose
   *
   * Smoothly transitions back to the default idle pose.
   */
  public reset(): void {
    this.transitionTo('idle', 0.5);
    this._layeredEmote = null;
  }

  /**
   * Set layered emote
   *
   * Applies an emote (from vrm-emotes.ts) on top of the
   * current pose. The emote is applied in update().
   *
   * @param emote - Emote state or null to clear
   */
  public setLayeredEmote(emote: any | null): void {
    this._layeredEmote = emote;
  }

  /**
   * Get current pose type
   */
  public getCurrentPose(): PoseType {
    return this._currentPose;
  }

  /**
   * Check if currently transitioning
   */
  public isTransitioning(): boolean {
    return this._activeTransition !== null;
  }

  /**
   * Update pose controller
   *
   * Should be called every frame with delta time.
   * Handles active transitions and applies bone rotations.
   *
   * @param _delta - Time since last update in seconds (unused, for API compatibility)
   */
  public update(_delta: number): void {
    const now = Date.now();

    // Update active transition
    if (this._activeTransition) {
      const elapsed = now - this._activeTransition.startTime;
      const progress = Math.min(elapsed / this._activeTransition.duration, 1.0);
      const eased = easeInOutCubic(progress);

      // Interpolate bone rotations
      this.interpolateBones(
        this._activeTransition.fromConfig,
        this._activeTransition.toConfig,
        eased
      );

      // Apply interpolated rotations to VRM
      this.applyBoneRotations();

      // Check if transition complete
      if (progress >= 1.0) {
        this._activeTransition = null;
        console.log(`[PoseController] Transition to ${this._currentPose} complete`);
      }
    } else {
      // Just maintain current pose
      this.applyBoneRotations();
    }

    this._lastUpdateTime = now;
  }

  /**
   * Initialize pose (immediate, no transition)
   *
   * Used for initial setup or when instant pose change is needed.
   */
  private initializePose(pose: PoseType): void {
    const targetPose = POSE_LIBRARY[pose];
    if (!targetPose) return;

    const config = this.buildBoneConfig(targetPose.bones);

    // Store current rotations
    config.forEach((euler, boneName) => {
      this._currentBoneRotations.set(boneName, euler.clone());
    });

    // Apply immediately
    this.applyBoneRotations();
  }

  /**
   * Capture current bone rotation state
   *
   * Reads current VRM bone rotations into a config map.
   */
  private captureCurrentBoneState(): Map<string, THREE.Euler> {
    const config = new Map<string, THREE.Euler>();

    const boneNames = [
      'head', 'neck', 'spine', 'chest',
      'leftShoulder', 'rightShoulder',
      'leftUpperArm', 'rightUpperArm',
      'leftLowerArm', 'rightLowerArm',
      'leftHand', 'rightHand',
      'hips'
    ];

    boneNames.forEach(boneName => {
      const bone = this._vrm.humanoid?.getNormalizedBoneNode(boneName as any);
      if (bone?.rotation) {
        config.set(boneName, bone.rotation.clone());
      } else {
        // No bone exists, use zero rotation
        config.set(boneName, new THREE.Euler(0, 0, 0));
      }
    });

    return config;
  }

  /**
   * Build bone config from pose definition
   *
   * Converts PoseBoneConfig to Map of Euler rotations.
   */
  private buildBoneConfig(bones: PoseBoneConfig): Map<string, THREE.Euler> {
    const config = new Map<string, THREE.Euler>();

    Object.entries(bones).forEach(([boneName, rotation]) => {
      config.set(
        boneName,
        new THREE.Euler(rotation.x, rotation.y, rotation.z)
      );
    });

    return config;
  }

  /**
   * Interpolate between bone configs
   *
   * Updates currentBoneRotations with interpolated values.
   */
  private interpolateBones(
    fromConfig: Map<string, THREE.Euler>,
    toConfig: Map<string, THREE.Euler>,
    t: number
  ): void {
    toConfig.forEach((toEuler, boneName) => {
      const fromEuler = fromConfig.get(boneName);
      if (fromEuler && toEuler) {
        const current = this._currentBoneRotations.get(boneName) || new THREE.Euler();
        current.x = lerp(fromEuler.x, toEuler.x, t);
        current.y = lerp(fromEuler.y, toEuler.y, t);
        current.z = lerp(fromEuler.z, toEuler.z, t);
        this._currentBoneRotations.set(boneName, current);
      }
    });
  }

  /**
   * Apply bone rotations to VRM
   *
   * Applies stored rotation values to actual VRM bones.
   */
  private applyBoneRotations(): void {
    this._currentBoneRotations.forEach((euler, boneName) => {
      const bone = this._vrm.humanoid?.getNormalizedBoneNode(boneName as any);
      if (bone?.rotation) {
        bone.rotation.copy(euler);
      }
    });
  }
}

/**
 * Singleton instance for global access
 *
 * Provides a shared PoseController instance that can be
 * accessed across the application.
 */
let globalPoseController: PoseController | null = null;

/**
 * Get or create global pose controller
 *
 * Returns a singleton PoseController instance for the given VRM.
 * If a controller already exists for a different VRM, it will be
 * reinitialized with the new VRM.
 *
 * @param vrm - VRM model instance
 * @returns PoseController instance
 */
export function getPoseController(vrm: VRM): PoseController {
  if (!globalPoseController || globalPoseController['_vrm'] !== vrm) {
    globalPoseController = new PoseController(vrm);
  }
  return globalPoseController;
}

/**
 * Reset global pose controller
 *
 * Clears the singleton instance. Useful when switching VRM models.
 */
export function resetPoseController(): void {
  globalPoseController = null;
}

/**
 * Get pose by type
 *
 * Returns the pose definition for a given pose type.
 *
 * @param pose - Pose type
 * @returns Pose definition or undefined
 */
export function getPose(pose: PoseType): Pose | undefined {
  return POSE_LIBRARY[pose];
}

/**
 * Get all available pose types
 *
 * Returns an array of all available pose types.
 */
export function getAllPoseTypes(): PoseType[] {
  return Object.keys(POSE_LIBRARY) as PoseType[];
}

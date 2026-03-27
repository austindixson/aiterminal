/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/vrm-emotes.ts
 * Module: renderer
 * Purpose: Programmatic emote system for VRM avatars - wave, nod, bounce, think pose
 * Dependencies: three, @pixiv/three-vrm
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/components/InternAvatar.tsx
 * Keywords: vrm, emotes, animations, humanoid-bones, expressions, avatar-animations
 * Last Updated: 2026-03-25
 */

import type { VRM } from '@pixiv/three-vrm';

export type EmoteType =
  | 'idle'           // Subtle breathing/sway
  | 'wave'          // Wave hand (hello/goodbye)
  | 'nod-yes'       // Nod head forward (agreement)
  | 'nod-no'        // Shake head left/right (disagreement)
  | 'happy-bounce'  // Bounce up and down (excitement)
  | 'think-pose'    // Hand on chin (thinking)
  | 'dance'         // Simple dance loop
  | 'clap'          // Clap hands together;

export interface EmoteState {
  readonly type: EmoteType;
  readonly startTime: number;
  readonly duration?: number; // ms, undefined = infinite
  readonly intensity: number; // 0-1
}

// Smooth interpolation helper
function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

// Ease-in-out function for smooth animations
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/**
 * Apply emote animation to VRM model
 * @param vrm VRM model instance
 * @param emote Current emote state
 * @param elapsedTime Time since emote started (seconds)
 */
export function applyEmote(vrm: VRM, emote: EmoteState, elapsedTime: number): void {
  const { type, duration, intensity } = emote;

  // Calculate progress (0-1)
  const progress = duration ? Math.min(elapsedTime / duration, 1) : 1;
  const eased = easeInOut(progress);

  // Get humanoid bones
  const head = vrm.humanoid?.getNormalizedBoneNode('head');
  const spine = vrm.humanoid?.getNormalizedBoneNode('spine');
  const leftUpperArm = vrm.humanoid?.getNormalizedBoneNode('leftUpperArm');
  const leftLowerArm = vrm.humanoid?.getNormalizedBoneNode('leftLowerArm');
  const rightUpperArm = vrm.humanoid?.getNormalizedBoneNode('rightUpperArm');
  const rightLowerArm = vrm.humanoid?.getNormalizedBoneNode('rightLowerArm');
  const rightHand = vrm.humanoid?.getNormalizedBoneNode('rightHand');

  if (!head) return; // No head bone, can't animate

  switch (type) {
    case 'idle':
      // Subtle breathing animation
      const breathe = Math.sin(elapsedTime * 2) * 0.02 * intensity;
      spine?.rotation?.set(0, 0, breathe);
      head?.rotation?.set(0, 0, breathe * 0.5);

      // Subtle arm sway
      const sway = Math.sin(elapsedTime * 1.5) * 0.03 * intensity;
      leftUpperArm?.rotation?.set(sway, 0, 0);
      rightUpperArm?.rotation?.set(-sway, 0, 0);
      break;

    case 'wave':
      // Wave right hand
      const waveAngle = Math.sin(elapsedTime * 8) * 0.5 * intensity;
      const waveLift = Math.sin(Math.min(progress * 4, Math.PI)) * 1.5; // Lift arm over 1s

      rightUpperArm?.rotation?.set(waveLift, 0, -1.5);
      rightLowerArm?.rotation?.set(waveAngle, 0, 0);
      rightHand?.rotation?.set(0, 0, waveAngle * 0.5);
      break;

    case 'nod-yes':
      // Nod head forward/back
      const nodAngle = Math.sin(progress * Math.PI * 2) * 0.3 * intensity;
      head?.rotation?.set(nodAngle, 0, 0);
      break;

    case 'nod-no':
      // Shake head left/right
      const shakeAngle = Math.sin(progress * Math.PI * 3) * 0.4 * intensity;
      head?.rotation?.set(0, shakeAngle, 0);
      break;

    case 'happy-bounce':
      // Bounce entire body up/down
      const bounceOffset = Math.abs(Math.sin(progress * Math.PI * 4)) * 0.1 * intensity;
      if (vrm.scene.parent) {
        const baseY = vrm.scene.position.y;
        vrm.scene.position.y = baseY + bounceOffset;
      }

      // Add happy head tilt
      head?.rotation?.set(0.2 * eased, 0.1 * eased, 0);
      break;

    case 'think-pose':
      // Move right hand toward chin
      const handToChin = Math.min(progress * 2, 1);

      rightUpperArm?.rotation?.set(
        lerp(0, 1.0, handToChin) * intensity,
        lerp(0, 0.3, handToChin) * intensity,
        lerp(0, 0.5, handToChin) * intensity
      );

      rightLowerArm?.rotation?.set(
        lerp(0, -1.2, handToChin) * intensity,
        0,
        0
      );

      // Slight head tilt while thinking
      head?.rotation?.set(
        lerp(0, 0.15, eased) * intensity,
        lerp(0, -0.1, eased) * intensity,
        0
      );
      break;

    case 'dance':
      // Simple dance loop
      const danceBeat = Math.sin(elapsedTime * 6);

      // Body bounce
      if (vrm.scene.parent) {
        vrm.scene.position.y = Math.abs(danceBeat) * 0.05 * intensity;
      }

      // Arm sway
      leftUpperArm?.rotation?.set(danceBeat * 0.5 * intensity, 0, 0);
      rightUpperArm?.rotation?.set(-danceBeat * 0.5 * intensity, 0, 0);

      // Head bob
      head?.rotation?.set(danceBeat * 0.1, 0, 0);
      break;

    case 'clap':
      // Clap hands together
      const clapCycle = (progress * 4) % 1; // 4 claps per emote duration
      const clapOpen = clapCycle < 0.5;
      const clapAngle = clapOpen ? 0.5 : 0;

      // Both arms forward
      leftUpperArm?.rotation?.set(1.5 * eased, 0, 0.5 * eased);
      rightUpperArm?.rotation?.set(1.5 * eased, 0, -0.5 * eased);

      leftLowerArm?.rotation?.set(-1.5 * eased, 0, clapAngle * intensity);
      rightLowerArm?.rotation?.set(-1.5 * eased, 0, -clapAngle * intensity);
      break;
  }
}

/**
 * Reset all bones to resting pose
 */
export function resetPose(vrm: VRM): void {
  const bones = [
    'head', 'neck', 'spine', 'chest', 'upperChest',
    'leftUpperArm', 'leftLowerArm', 'leftHand',
    'rightUpperArm', 'rightLowerArm', 'rightHand',
    'leftUpperLeg', 'leftLowerLeg', 'leftFoot',
    'rightUpperLeg', 'rightLowerLeg', 'rightFoot'
  ];

  bones.forEach(boneName => {
    const bone = vrm.humanoid?.getNormalizedBoneNode(boneName as any);
    if (bone?.rotation) {
      bone.rotation.set(0, 0, 0);
    }
  });
}

/**
 * Create emote state
 */
export function createEmote(type: EmoteType, duration?: number, intensity = 1.0): EmoteState {
  return {
    type,
    startTime: Date.now(),
    duration,
    intensity
  };
}

/**
 * Check if emote is complete
 */
export function isEmoteComplete(emote: EmoteState): boolean {
  if (!emote.duration) return false; // Infinite emotes never complete
  return Date.now() - emote.startTime > emote.duration;
}

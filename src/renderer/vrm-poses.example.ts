/*
 * VRM Pose System - Usage Examples
 *
 * This file demonstrates how to use the VRM pose system
 * Copy relevant sections into your components as needed.
 */

import { getPoseController, type PoseType } from './vrm-poses';
import { createEmote } from './vrm-emotes';
import type { VRM } from '@pixiv/three-vrm';

// ============================================================================
// EXAMPLE 1: Basic Pose Transitions
// ============================================================================

export function example1_BasicPoses(vrm: VRM) {
  const controller = getPoseController(vrm);

  // Set different poses
  controller.setPose('thinking');      // Hand on chin
  controller.setPose('celebrating');   // Arms up
  controller.setPose('typing');        // Keyboard position

  // Reset to idle
  controller.reset();

  // In animation loop
  function animate(delta: number) {
    controller.update(delta);
  }
}

// ============================================================================
// EXAMPLE 2: Event-Driven Pose Switching
// ============================================================================

export function example2_EventDriven(vrm: VRM) {
  const controller = getPoseController(vrm);

  // Map agent events to poses
  const EVENT_TO_POSE: Record<string, PoseType> = {
    'tool:start': 'thinking',        // Processing
    'tool:end': 'celebrating',       // Success
    'assistant:delta': 'listening',  // Responding
    'editor:typing': 'typing',       // Writing
  };

  // Apply pose based on event
  function handleEvent(eventStream: string) {
    const poseType = EVENT_TO_POSE[eventStream];
    if (poseType) {
      controller.setPose(poseType);
      console.log(`[PoseController] Pose: ${poseType}`);
    }
  }

  // Usage
  handleEvent('tool:start');      // → thinking pose
  handleEvent('assistant:delta'); // → listening pose
  handleEvent('tool:end');        // → celebrating pose
}

// ============================================================================
// EXAMPLE 3: Custom Transition Duration
// ============================================================================

export function example3_CustomDuration(vrm: VRM) {
  const controller = getPoseController(vrm);

  // Slow, dramatic transition
  controller.transitionTo('celebrating', 1.5);

  // Quick, snappy transition
  controller.transitionTo('typing', 0.2);

  // Default transition (uses pose's duration)
  controller.transitionTo('thinking', 0.6);  // 0.6s = thinking's default
}

// ============================================================================
// EXAMPLE 4: Blend Factor Control
// ============================================================================

export function example4_BlendFactor(vrm: VRM) {
  const controller = getPoseController(vrm);

  // Full pose (100%)
  controller.setPose('celebrating', 1.0);

  // Half pose (50%) - subtle hint
  controller.setPose('thinking', 0.5);

  // Minimal pose (10%) - very subtle
  controller.setPose('presenting', 0.1);
}

// ============================================================================
// EXAMPLE 5: Layered Poses + Emotes
// ============================================================================

export function example5_LayeredEmotes(vrm: VRM) {
  const controller = getPoseController(vrm);

  // Set base pose
  controller.setPose('presenting');

  // Layer wave emote on top
  const waveEmote = createEmote('wave', 2000);  // 2 second wave
  controller.setLayeredEmote(waveEmote);

  // Clear emote after 2 seconds
  setTimeout(() => {
    controller.setLayeredEmote(null);  // Keep presenting pose
  }, 2000);
}

// ============================================================================
// EXAMPLE 6: Pose Sequences
// ============================================================================

export async function example6_PoseSequence(vrm: VRM) {
  const controller = getPoseController(vrm);

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Sequential workflow
  controller.setPose('idle');
  await delay(1000);

  controller.setPose('thinking');
  await delay(2000);

  controller.setPose('celebrating');
  await delay(1500);

  controller.reset();
}

// ============================================================================
// EXAMPLE 7: React Integration
// ============================================================================

import { useEffect, useRef } from 'react';

export function example7_ReactIntegration(vrm: VRM, events: any[]) {
  const controllerRef = useRef(getPoseController(vrm));
  const currentPoseRef = useRef<PoseType>('idle');

  // Initialize
  useEffect(() => {
    controllerRef.current.setPose('idle');
  }, []);

  // Event-driven pose switching
  useEffect(() => {
    if (!events.length) return;

    const latestEvent = events[events.length - 1];
    const poseType = getPoseForEvent(latestEvent.stream);

    if (poseType && poseType !== currentPoseRef.current) {
      controllerRef.current.setPose(poseType);
      currentPoseRef.current = poseType;
    }
  }, [events]);

  // Auto-reset to idle
  useEffect(() => {
    const timer = setTimeout(() => {
      controllerRef.current.reset();
      currentPoseRef.current = 'idle';
    }, 3000);

    return () => clearTimeout(timer);
  }, [events]);
}

function getPoseForEvent(eventStream: string): PoseType | null {
  const map: Record<string, PoseType> = {
    'tool:start': 'thinking',
    'tool:end': 'celebrating',
    'assistant:delta': 'listening',
  };
  return map[eventStream] || null;
}

// ============================================================================
// EXAMPLE 8: Pose + Expression Combo
// ============================================================================

import { ExpressionController } from './vrm-expression-controller';

export function example8_PosePlusExpression(vrm: VRM) {
  const poseController = getPoseController(vrm);
  const expressionController = new ExpressionController(vrm, null as any);

  // Thoughtful pose + neutral face
  poseController.setPose('thinking');
  expressionController.playEmotion('neutral');

  // Celebrating pose + happy face
  poseController.setPose('celebrating');
  expressionController.playEmotion('happy');

  // Reset both
  poseController.reset();
  expressionController.reset();
}

// ============================================================================
// EXAMPLE 9: State Monitoring
// ============================================================================

export function example9_StateMonitoring(vrm: VRM) {
  const controller = getPoseController(vrm);

  // Check current pose
  const currentPose = controller.getCurrentPose();
  console.log(`Current pose: ${currentPose}`);  // 'thinking'

  // Check if transitioning
  if (controller.isTransitioning()) {
    console.log('Pose transition in progress...');
  }

  // Monitor pose changes
  let lastPose = controller.getCurrentPose();

  function checkPoseChange() {
    const currentPose = controller.getCurrentPose();
    if (currentPose !== lastPose) {
      console.log(`Pose changed: ${lastPose} → ${currentPose}`);
      lastPose = currentPose;
    }
  }
}

// ============================================================================
// EXAMPLE 10: Error Handling
// ============================================================================

export function example10_ErrorHandling(vrm: VRM) {
  const controller = getPoseController(vrm);

  // Safe pose setting with error handling
  function safeSetPose(pose: string) {
    try {
      controller.setPose(pose as PoseType);
      console.log(`✅ Pose set to: ${pose}`);
    } catch (error) {
      console.error(`❌ Invalid pose: ${pose}`, error);
      // Fallback to idle
      controller.reset();
    }
  }

  // Usage
  safeSetPose('thinking');   // ✅ Valid
  safeSetPose('dancing');    // ❌ Invalid (not a PoseType)
}

// ============================================================================
// EXAMPLE 11: Performance Monitoring
// ============================================================================

export function example11_PerformanceMonitoring(vrm: VRM) {
  const controller = getPoseController(vrm);

  let frameCount = 0;
  let startTime = performance.now();

  function animate(delta: number) {
    // Measure pose update time
    const poseStart = performance.now();
    controller.update(delta);
    const poseEnd = performance.now();

    frameCount++;

    // Log every 60 frames
    if (frameCount % 60 === 0) {
      const elapsed = poseEnd - startTime;
      const avgFrameTime = elapsed / frameCount;
      const avgPoseTime = (poseEnd - poseStart);

      console.log(`Frame: ${avgFrameTime.toFixed(2)}ms, Pose: ${avgPoseTime.toFixed(2)}ms`);
    }
  }
}

// ============================================================================
// EXAMPLE 12: Cleanup on Unmount
// ============================================================================

import { resetPoseController } from './vrm-poses';

export function example12_Cleanup(vrm: VRM) {
  useEffect(() => {
    const controller = getPoseController(vrm);

    return () => {
      // Cleanup when switching VRM models
      resetPoseController();
    };
  }, [vrm]);
}

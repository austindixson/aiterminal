/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/vrm-expression-controller.ts
 * Module: renderer
 * Purpose: Manages VRM avatar expressions including auto-blink and lip-sync
 * Dependencies: three, @pixiv/three-vrm
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/components/InternAvatar.tsx
 * Keywords: vrm, expressions, auto-blink, lip-sync, avatar-animation
 * Last Updated: 2026-03-25
 */

import * as THREE from 'three';
import type {
  VRM,
  VRMExpressionManager,
  VRMExpressionPresetName,
} from '@pixiv/three-vrm';

/**
 * Blink timing constants (in seconds)
 */
const BLINK_CLOSE_MAX = 0.15; // Duration to close eyes

/**
 * AutoBlink manages automatic eye blinking for VRM avatars
 *
 * Randomly triggers blinks at natural intervals and handles the
 * open/close animation timing. Can be disabled temporarily for
 * emotional expressions.
 *
 * @example
 * ```typescript
 * const autoBlink = new AutoBlink(vrm.expressionManager);
 *
 * // In animation loop
 * function animate(delta: number) {
 *   autoBlink.update(delta);
 * }
 *
 * // Disable before playing emotion
 * const waitTime = autoBlink.setEnable(false);
 * setTimeout(() => playEmotion('happy'), waitTime * 1000);
 *
 * // Re-enable after emotion
 * autoBlink.setEnable(true);
 * ```
 */
export class AutoBlink {
  private _expressionManager: VRMExpressionManager;
  private _remainingTime: number;
  private _isOpen: boolean;
  private _isAutoBlink: boolean;

  constructor(expressionManager: VRMExpressionManager) {
    this._expressionManager = expressionManager;
    this._remainingTime = 0;
    this._isAutoBlink = true;
    this._isOpen = true;
  }

  /**
   * Enable or disable automatic blinking
   *
   * When disabling, returns the time remaining until eyes would be fully open.
   * This is useful for delaying emotion changes until the blink completes.
   *
   * @param enabled - Whether auto-blink should be active
   * @returns Time in seconds until eyes are open (0 if already open)
   */
  public setEnable(enabled: boolean): number {
    this._isAutoBlink = enabled;

    // If eyes are closed, return time until they open
    if (!this._isOpen) {
      return this._remainingTime;
    }

    return 0;
  }

  /**
   * Update blink state
   *
   * Should be called every frame with delta time.
   * Handles the blink open/close cycle and triggers random blinks.
   *
   * @param delta - Time since last update in seconds
   */
  public update(delta: number): void {
    if (this._remainingTime > 0) {
      this._remainingTime -= delta;
      return;
    }

    if (this._isOpen && this._isAutoBlink) {
      this.close();
      return;
    }

    this.open();
  }

  /**
   * Close eyes for a blink
   */
  private close(): void {
    this._isOpen = false;
    this._remainingTime = BLINK_CLOSE_MAX;
    this._expressionManager.setValue('blink', 1);
  }

  /**
   * Open eyes after a blink
   */
  private open(): void {
    this._isOpen = true;
    this._remainingTime = this.calculateNextBlinkInterval();
    this._expressionManager.setValue('blink', 0);
  }

  /**
   * Calculate random interval until next blink
   *
   * Natural blink interval is typically 3-5 seconds
   */
  private calculateNextBlinkInterval(): number {
    // Random interval between 3 and 5 seconds
    return 3 + Math.random() * 2;
  }
}

/**
 * ExpressionController manages VRM avatar facial expressions
 *
 * Handles:
 * - Automatic eye blinking with random intervals
 * - Emotion preset transitions (happy, sad, angry, etc.)
 * - Lip-sync animation for speech
 * - Expression state management with smooth transitions
 *
 * Expressions are applied with proper timing:
 * - Previous expressions are reset before applying new ones
 * - Neutral expressions re-enable auto-blink
 * - Non-neutral expressions disable auto-blink and wait for blinks to complete
 * - Lip-sync weights are scaled based on current emotion (0.5 neutral, 0.25 emoting)
 *
 * @example
 * ```typescript
 * const controller = new ExpressionController(vrm, camera);
 *
 * // In animation loop
 * function animate(delta: number) {
 *   controller.update(delta);
 * }
 *
 * // Play emotion
 * controller.playEmotion('happy');
 *
 * // Lip sync during speech
 * controller.lipSync('aa', 0.8);
 * ```
 */
export class ExpressionController {
  private _autoBlink?: AutoBlink;
  private _expressionManager?: VRMExpressionManager;
  private _currentEmotion: VRMExpressionPresetName;
  private _currentLipSync: {
    preset: VRMExpressionPresetName;
    value: number;
  } | null;

  constructor(vrm: VRM, _camera: THREE.Object3D) {
    this._currentEmotion = 'neutral';
    this._currentLipSync = null;

    if (vrm.expressionManager) {
      this._expressionManager = vrm.expressionManager;
      this._autoBlink = new AutoBlink(vrm.expressionManager);
    }

    // Note: AutoLookAt would be initialized here if needed
    // ChatVRM uses it for eye tracking, but AITerminal has custom
    // cursor-following logic in InternAvatar.tsx
  }

  /**
   * Play an emotion expression
   *
   * Resets the previous expression to 0 before applying the new one.
   * Special handling for "neutral" to re-enable blinking.
   * Waits for any in-progress blink to complete before applying emotion.
   *
   * @param preset - VRM expression preset name (happy, sad, angry, etc.)
   */
  public playEmotion(preset: VRMExpressionPresetName): void {
    // Reset previous emotion if not neutral
    if (this._currentEmotion !== 'neutral') {
      this._expressionManager?.setValue(this._currentEmotion, 0);
    }

    // Special handling for neutral - re-enable blinking
    if (preset === 'neutral') {
      this._autoBlink?.setEnable(true);
      this._currentEmotion = preset;
      return;
    }

    // For non-neutral emotions, disable blinking and wait for any blink to complete
    const waitTime = this._autoBlink?.setEnable(false) || 0;
    this._currentEmotion = preset;

    // Delay expression application until blink completes
    if (waitTime > 0) {
      setTimeout(() => {
        this._expressionManager?.setValue(preset, 1);
      }, waitTime * 1000);
    } else {
      this._expressionManager?.setValue(preset, 1);
    }
  }

  /**
   * Set lip-sync expression weight
   *
   * Resets the previous lip-sync preset before applying the new one.
   * The actual weight is applied in update() with scaling based on emotion.
   *
   * @param preset - VRM lip-sync preset (aa, ih, ou, ee, oh)
   * @param value - Weight value (0-1)
   */
  public lipSync(preset: VRMExpressionPresetName, value: number): void {
    // Reset previous lip-sync if any
    if (this._currentLipSync) {
      this._expressionManager?.setValue(this._currentLipSync.preset, 0);
    }

    // Store new lip-sync state (applied in update())
    this._currentLipSync = {
      preset,
      value,
    };
  }

  /**
   * Update expression controller
   *
   * Should be called every frame with delta time.
   * Updates auto-blink and applies lip-sync weights with emotion-based scaling.
   *
   * Lip-sync scaling:
   * - Neutral: 0.5x (more pronounced mouth movement)
   * - Emoting: 0.25x (subtler mouth movement during emotions)
   *
   * @param delta - Time since last update in seconds
   */
  public update(delta: number): void {
    // Update auto-blink
    if (this._autoBlink) {
      this._autoBlink.update(delta);
    }

    // Apply lip-sync with emotion-based scaling
    if (this._currentLipSync && this._expressionManager) {
      const weight =
        this._currentEmotion === 'neutral'
          ? this._currentLipSync.value * 0.5
          : this._currentLipSync.value * 0.25;

      this._expressionManager.setValue(this._currentLipSync.preset, weight);
    }
  }

  /**
   * Get current emotion preset
   */
  public getCurrentEmotion(): VRMExpressionPresetName {
    return this._currentEmotion;
  }

  /**
   * Check if currently blinking
   */
  public isBlinking(): boolean {
    // AutoBlink doesn't expose this directly, but we could add it if needed
    return false;
  }

  /**
   * Clear lip-sync state
   */
  public clearLipSync(): void {
    if (this._currentLipSync) {
      this._expressionManager?.setValue(this._currentLipSync.preset, 0);
      this._currentLipSync = null;
    }
  }

  /**
   * Reset all expressions to neutral
   */
  public reset(): void {
    this.playEmotion('neutral');
    this.clearLipSync();
  }
}

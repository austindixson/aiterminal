/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/vrm-facial-emotes.ts
 * Module: renderer
 * Purpose: VRM facial expression emotes system with queue management
 * Dependencies: @pixiv/three-vrm
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/vrm-expression-controller.ts
 * Keywords: vrm, facial-emotes, expressions, queue, avatar, blend-shapes
 * Last Updated: 2026-03-26
 */

import type { VRMExpressionManager } from '@pixiv/three-vrm';

/**
 * Facial emote preset names
 */
export type FacialEmotePreset =
  | 'neutral'
  | 'happy'
  | 'thinking'
  | 'surprised'
  | 'confused'
  | 'excited'
  | 'concerned';

/**
 * Facial emote blend shape configuration
 *
 * Maps facial emotes to VRM blend shape values.
 * Each emote can use multiple blend shapes weighted to create the desired expression.
 */
export interface FacialEmoteBlendShapes {
  /** VRM preset expressions (happy, sad, angry, etc.) */
  preset?: {
    name: string;
    weight: number;
  };
  /** Individual blend shapes (aa, ih, ou, ee, oh, blink, etc.) */
  blendShapes?: {
    name: string;
    weight: number;
  }[];
}

/**
 * Facial emote configuration
 */
export interface FacialEmoteConfig {
  /** Unique identifier */
  id: FacialEmotePreset;
  /** Display name */
  name: string;
  /** Description of when to use this emote */
  description: string;
  /** Blend shape configuration */
  shapes: FacialEmoteBlendShapes;
  /** Default intensity (0-1) */
  defaultIntensity: number;
  /** Default duration in milliseconds (0 = hold until cleared) */
  defaultDuration: number;
}

/**
 * Queued facial emote item
 */
interface QueuedFacialEmote {
  config: FacialEmoteConfig;
  intensity: number;
  duration: number;
  resolve: () => void;
}

/**
 * Facial emote presets configuration
 *
 * Each emote maps to VRM blend shapes to create expressive facial animations.
 * Intensity scales all weights, allowing subtle to dramatic expressions.
 */
export const FACIAL_EMOTE_PRESETS: Record<FacialEmotePreset, FacialEmoteConfig> = {
  neutral: {
    id: 'neutral',
    name: 'Neutral',
    description: 'Default resting state',
    shapes: {},
    defaultIntensity: 0,
    defaultDuration: 0
  },
  happy: {
    id: 'happy',
    name: 'Happy',
    description: 'Positive response, success, agreement',
    shapes: {
      preset: { name: 'happy', weight: 1.0 },
      blendShapes: [
        { name: 'aa', weight: 0.2 },  // Slight smile
        { name: 'ih', weight: 0.1 }
      ]
    },
    defaultIntensity: 1.0,
    defaultDuration: 2000
  },
  thinking: {
    id: 'thinking',
    name: 'Thinking',
    description: 'Processing, considering, analyzing',
    shapes: {
      preset: { name: 'neutral', weight: 0.5 },
      blendShapes: [
        { name: 'blink', weight: 0.3 },  // Slightly squinting
        { name: 'ih', weight: 0.4 },     // Thoughtful expression
        { name: 'oh', weight: 0.1 }
      ]
    },
    defaultIntensity: 0.8,
    defaultDuration: 3000
  },
  surprised: {
    id: 'surprised',
    name: 'Surprised',
    description: 'Unexpected results, new information',
    shapes: {
      preset: { name: 'neutral', weight: 0.7 },
      blendShapes: [
        { name: 'aa', weight: 0.5 },    // Open mouth
        { name: 'oh', weight: 0.6 },    // Rounded lips
        { name: 'blink', weight: 0.1 }  // Eyes wide
      ]
    },
    defaultIntensity: 1.0,
    defaultDuration: 1500
  },
  confused: {
    id: 'confused',
    name: 'Confused',
    description: 'Uncertainty, need clarification',
    shapes: {
      preset: { name: 'neutral', weight: 0.6 },
      blendShapes: [
        { name: 'ih', weight: 0.5 },    // Slightly pursed
        { name: 'ee', weight: 0.2 },    // Squinting
        { name: 'blink', weight: 0.4 }  // Thoughtful squint
      ]
    },
    defaultIntensity: 0.7,
    defaultDuration: 2500
  },
  excited: {
    id: 'excited',
    name: 'Excited',
    description: 'Enthusiasm, breakthrough, discovery',
    shapes: {
      preset: { name: 'happy', weight: 1.0 },
      blendShapes: [
        { name: 'aa', weight: 0.4 },    // Big smile
        { name: 'ih', weight: 0.3 },
        { name: 'ee', weight: 0.2 }     // Bright eyes
      ]
    },
    defaultIntensity: 1.0,
    defaultDuration: 2500
  },
  concerned: {
    id: 'concerned',
    name: 'Concerned',
    description: 'Warning, error, caution',
    shapes: {
      preset: { name: 'sad', weight: 0.7 },
      blendShapes: [
        { name: 'oh', weight: 0.4 },    // Worried expression
        { name: 'ih', weight: 0.3 },
        { name: 'blink', weight: 0.5 }  // Furrowed brow
      ]
    },
    defaultIntensity: 0.8,
    defaultDuration: 2000
  }
};

/**
 * FacialEmoteController manages VRM facial expression emotes
 *
 * Features:
 * - Play facial emotes with configurable intensity and duration
 * - Hold emotes until cleared (duration = 0)
 * - Queue system to prevent overlapping emotes
 * - Smooth transitions between emotes
 * - Automatic return to neutral after timed emotes
 *
 * This system is separate from body emotes (vrm-emotes.ts) and focuses
 * purely on facial expressions using VRM blend shapes.
 *
 * @example
 * ```typescript
 * const controller = new FacialEmoteController();
 * controller.initialize(vrm.expressionManager);
 *
 * // Play emote then return to neutral
 * await controller.playEmote('happy');
 *
 * // Play with custom intensity and duration
 * await controller.playEmote('excited', 0.8, 3000);
 *
 * // Hold emote until manually cleared
 * controller.setEmote('thinking');
 * // ... later ...
 * controller.clearEmote();
 *
 * // Queue multiple emotes (plays sequentially)
 * controller.playEmote('surprised');
 * controller.playEmote('happy');
 * controller.playEmote('neutral');
 * ```
 */
export class FacialEmoteController {
  private expressionManager: VRMExpressionManager | null = null;
  private currentEmote: FacialEmotePreset = 'neutral';
  private emoteQueue: QueuedFacialEmote[] = [];
  private isProcessingQueue = false;
  private currentEmoteTimeout: ReturnType<typeof setTimeout> | null = null;
  private activeBlendShapes = new Map<string, number>();

  /**
   * Initialize the facial emote controller
   *
   * @param expressionManager - VRM expression manager instance
   */
  public initialize(expressionManager: VRMExpressionManager): void {
    this.expressionManager = expressionManager;
    console.log('[FacialEmoteController] Initialized');
  }

  /**
   * Play a facial emote then automatically return to neutral
   *
   * If another emote is currently playing, this emote will be queued
   * and played after the current one completes.
   *
   * @param emote - Facial emote preset to play
   * @param intensity - Optional intensity (0-1), defaults to emote's default
   * @param duration - Optional duration in ms, defaults to emote's default
   * @returns Promise that resolves when the emote completes
   */
  public async playEmote(
    emote: FacialEmotePreset,
    intensity?: number,
    duration?: number
  ): Promise<void> {
    const config = FACIAL_EMOTE_PRESETS[emote];
    if (!config) {
      console.warn(`[FacialEmoteController] Unknown emote: ${emote}`);
      return Promise.resolve();
    }

    const actualIntensity = intensity ?? config.defaultIntensity;
    const actualDuration = duration ?? config.defaultDuration;

    // If no duration, treat as setEmote
    if (actualDuration === 0) {
      this.setEmote(emote, actualIntensity);
      return Promise.resolve();
    }

    // Queue the emote
    return new Promise<void>((resolve) => {
      this.emoteQueue.push({
        config,
        intensity: actualIntensity,
        duration: actualDuration,
        resolve
      });

      this.processQueue();
    });
  }

  /**
   * Set a facial emote to be held until manually cleared
   *
   * Interrupts any current emote and clears the queue.
   *
   * @param emote - Facial emote preset to hold
   * @param intensity - Optional intensity (0-1), defaults to emote's default
   */
  public setEmote(emote: FacialEmotePreset, intensity?: number): void {
    // Clear any pending emotes
    this.clearQueue();

    // Clear current emote timeout
    if (this.currentEmoteTimeout) {
      clearTimeout(this.currentEmoteTimeout);
      this.currentEmoteTimeout = null;
    }

    const config = FACIAL_EMOTE_PRESETS[emote];
    if (!config) {
      console.warn(`[FacialEmoteController] Unknown emote: ${emote}`);
      return;
    }

    const actualIntensity = intensity ?? config.defaultIntensity;
    this.applyEmote(config, actualIntensity);
    this.currentEmote = emote;
  }

  /**
   * Clear current facial emote and return to neutral
   *
   * Also clears the queue to prevent pending emotes from playing.
   */
  public clearEmote(): void {
    this.clearQueue();

    // Clear current emote timeout
    if (this.currentEmoteTimeout) {
      clearTimeout(this.currentEmoteTimeout);
      this.currentEmoteTimeout = null;
    }

    // Return to neutral
    const neutralConfig = FACIAL_EMOTE_PRESETS.neutral;
    this.applyEmote(neutralConfig, 0);
    this.currentEmote = 'neutral';
  }

  /**
   * Get the currently active facial emote
   */
  public getCurrentEmote(): FacialEmotePreset {
    return this.currentEmote;
  }

  /**
   * Check if a facial emote is currently active (not neutral)
   */
  public isEmoting(): boolean {
    return this.currentEmote !== 'neutral';
  }

  /**
   * Get the length of the facial emote queue
   */
  public getQueueLength(): number {
    return this.emoteQueue.length;
  }

  /**
   * Clear all pending facial emotes from the queue
   */
  private clearQueue(): void {
    // Resolve all pending promises
    this.emoteQueue.forEach(item => item.resolve());
    this.emoteQueue = [];
    this.isProcessingQueue = false;
  }

  /**
   * Process the facial emote queue
   *
   * Plays emotes sequentially, preventing overlapping expressions.
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.emoteQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.emoteQueue.length > 0) {
      const item = this.emoteQueue.shift();
      if (!item) break;

      // Apply the emote
      this.applyEmote(item.config, item.intensity);
      this.currentEmote = item.config.id;

      // Wait for duration
      await new Promise<void>(resolve => {
        this.currentEmoteTimeout = setTimeout(() => {
          this.currentEmoteTimeout = null;
          resolve();
        }, item.duration);
      });

      // Mark this emote as complete
      item.resolve();
    }

    // Return to neutral after queue is empty
    const neutralConfig = FACIAL_EMOTE_PRESETS.neutral;
    this.applyEmote(neutralConfig, 0);
    this.currentEmote = 'neutral';

    this.isProcessingQueue = false;
  }

  /**
   * Apply a facial emote configuration to the VRM model
   *
   * Resets previous blend shapes and applies new ones with intensity scaling.
   *
   * @param config - Facial emote configuration to apply
   * @param intensity - Intensity multiplier (0-1)
   */
  private applyEmote(config: FacialEmoteConfig, intensity: number): void {
    if (!this.expressionManager) {
      console.warn('[FacialEmoteController] No expression manager set');
      return;
    }

    // Reset all previously active blend shapes
    this.activeBlendShapes.forEach((_weight, name) => {
      this.expressionManager!.setValue(name as any, 0);
    });
    this.activeBlendShapes.clear();

    // Early return for neutral
    if (config.id === 'neutral') {
      return;
    }

    // Apply preset expression if configured
    if (config.shapes.preset) {
      const { name, weight } = config.shapes.preset;
      const finalWeight = weight * intensity;
      this.expressionManager.setValue(name as any, finalWeight);
      this.activeBlendShapes.set(name, finalWeight);
    }

    // Apply individual blend shapes if configured
    if (config.shapes.blendShapes) {
      for (const shape of config.shapes.blendShapes) {
        const { name, weight } = shape;
        const finalWeight = Math.max(0, Math.min(1, weight * intensity));
        this.expressionManager.setValue(name as any, finalWeight);
        this.activeBlendShapes.set(name, finalWeight);
      }
    }
  }

  /**
   * Clean up resources
   *
   * Clears queue, timeouts, and resets all expressions.
   */
  public dispose(): void {
    this.clearQueue();

    if (this.currentEmoteTimeout) {
      clearTimeout(this.currentEmoteTimeout);
      this.currentEmoteTimeout = null;
    }

    // Reset all blend shapes
    if (this.expressionManager) {
      this.activeBlendShapes.forEach((_weight, name) => {
        this.expressionManager!.setValue(name as any, 0);
      });
    }

    this.activeBlendShapes.clear();
    this.currentEmote = 'neutral';
    this.expressionManager = null;

    console.log('[FacialEmoteController] Disposed');
  }
}

/**
 * Global singleton instance for facial emote control
 *
 * Use this singleton to share the facial emote controller across components.
 * Initialize with the VRM expression manager when the model loads.
 *
 * @example
 * ```typescript
 * // In InternAvatar.tsx when VRM loads
 * import { facialEmoteController } from './vrm-facial-emotes';
 * facialEmoteController.initialize(vrm.expressionManager);
 *
 * // In any component
 * await facialEmoteController.playEmote('happy');
 * ```
 */
export const facialEmoteController = new FacialEmoteController();

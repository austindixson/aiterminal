/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/vrm-tts-bridge.ts
 * Module: renderer
 * Purpose: Bridge between Kokoro TTS audio playback and VRM LipSync system
 * Dependencies: ./vrm-lip-sync.ts, window.electronAPI
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/hooks/useVoiceIO.ts, /Users/ghost/Desktop/aiterminal/src/renderer/components/InternAvatar.tsx
 * Keywords: TTS, lip-sync, audio-analysis, VRM, avatar, mouth-animation
 * Last Updated: 2026-03-25
 */

import { LipSync } from './vrm-lip-sync';

/**
 * TTS-LipSync Bridge
 *
 * Manages the connection between TTS audio playback and VRM lip sync animation.
 * Handles audio context, lip sync lifecycle, and cleanup.
 *
 * Based on ChatVRM's speak() method in model.ts:
 * - Creates/uses existing AudioContext
 * - Passes audio ArrayBuffer to LipSync
 * - Runs lip-sync update loop during playback
 * - Cleans up resources after playback ends
 */
export class TTSLipSyncBridge {
  private lipSync: LipSync | null = null;
  private audioContext: AudioContext | null = null;
  private isPlaying = false;
  private currentAbortController: AbortController | null = null;

  /**
   * Initialize the lip sync system with an AudioContext
   *
   * @param audioContext - Optional existing AudioContext (will create new if not provided)
   */
  public initialize(audioContext?: AudioContext): void {
    if (this.lipSync) {
      console.warn('[TTSLipSyncBridge] Already initialized, skipping');
      return;
    }

    // Create or reuse AudioContext
    this.audioContext = audioContext ?? new AudioContext();
    this.lipSync = new LipSync(this.audioContext);

    console.log('[TTSLipSyncBridge] Initialized with AudioContext');
  }

  /**
   * Play TTS audio with lip sync
   *
   * Takes the audio ArrayBuffer from Kokoro TTS and plays it while
   * driving the VRM avatar's lip animation based on audio volume.
   *
   * @param audioBuffer - Raw audio data from Kokoro TTS (base64 decoded)
   * @returns Promise that resolves when playback completes
   */
  public async playWithLipSync(audioBuffer: ArrayBuffer): Promise<void> {
    if (!this.lipSync || !this.audioContext) {
      throw new Error('[TTSLipSyncBridge] Not initialized. Call initialize() first.');
    }

    if (this.isPlaying) {
      console.warn('[TTSLipSyncBridge] Already playing, stopping previous audio');
      this.stop();
    }

    this.isPlaying = true;
    this.currentAbortController = new AbortController();
    const signal = this.currentAbortController.signal;

    try {
      // Play audio with lip sync analysis
      await this.lipSync.playFromArrayBuffer(audioBuffer, () => {
        // Playback ended callback
        this.isPlaying = false;
        console.log('[TTSLipSyncBridge] Playback completed');
      });

      // Wait for playback to complete or be aborted
      return new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(new Error('Playback aborted'));
          return;
        }

        signal.addEventListener('abort', () => {
          reject(new Error('Playback aborted'));
        });

        // Resolve when playback naturally ends
        const checkInterval = setInterval(() => {
          if (!this.isPlaying) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });

    } catch (error) {
      this.isPlaying = false;
      throw error;
    }
  }

  /**
   * Update lip sync analysis (call in animation loop)
   *
   * Should be called every frame in the VRM animation loop to get
   * the current lip sync volume value for driving mouth animations.
   *
   * @returns Volume value (0-1) for lip animation, or 0 if not playing
   */
  public update(): number {
    if (!this.lipSync || !this.isPlaying) {
      return 0;
    }

    try {
      const result = this.lipSync.update();
      return result.volume;
    } catch (error) {
      console.error('[TTSLipSyncBridge] Update failed:', error);
      return 0;
    }
  }

  /**
   * Stop current playback
   *
   * Aborts ongoing audio playback and cleans up resources.
   */
  public stop(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }

    this.isPlaying = false;
    console.log('[TTSLipSyncBridge] Stopped playback');
  }

  /**
   * Check if currently playing audio
   */
  public get active(): boolean {
    return this.isPlaying;
  }

  /**
   * Clean up resources
   *
   * Stops playback and closes the AudioContext if we created it.
   */
  public dispose(): void {
    this.stop();

    // Note: Don't close AudioContext if it was provided externally
    // The caller is responsible for managing its own AudioContext lifecycle
    this.lipSync = null;

    console.log('[TTSLipSyncBridge] Disposed');
  }
}

/**
 * Global singleton instance for TTS-LipSync bridge
 *
 * Use this singleton to share the bridge across components.
 * The InternAvatar component will call update() in its animation loop,
 * while useVoiceIO will call playWithLipSync() when TTS speaks.
 */
export const ttsLipSyncBridge = new TTSLipSyncBridge();

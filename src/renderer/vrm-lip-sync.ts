/**
 * VRM LipSync Implementation
 *
 * Analyzes audio data in real-time to drive VRM lip sync animations.
 * Based on ChatVRM's lipSync architecture.
 *
 * Features:
 * - Real-time audio analysis via Web Audio API
 * - Volume-based lip sync with sigmoid curve processing
 * - Audio playback from ArrayBuffer or URL
 * - Noise gate to prevent mouth movement from background noise
 */

/**
 * Result of lip sync analysis
 */
export interface LipSyncAnalyzeResult {
  /** Normalized volume value (0-1) for driving lip animations */
  volume: number;
}

/**
 * FFT size for audio analysis
 * Larger values provide better frequency resolution but slower response
 */
const TIME_DOMAIN_DATA_LENGTH = 2048;

/**
 * Minimum volume threshold to prevent noise from triggering lip movement
 */
const MIN_VOLUME_THRESHOLD = 0.1;

/**
 * LipSync class for VRM avatar lip animation
 *
 * Analyzes audio data in real-time and produces volume values that can be
 * used to drive VRM lip blend shapes. The volume is processed through a
 * sigmoid curve to provide smooth, natural-looking movement.
 *
 * @example
 * ```typescript
 * const audioContext = new AudioContext();
 * const lipSync = new LipSync(audioContext);
 *
 * // Play audio with lip sync
 * await lipSync.playFromURL('/audio/speech.mp3');
 *
 * // Update lip sync in animation loop
 * function animate() {
 *   const result = lipSync.update();
 *   vrmManager.setLipSync(result.volume);
 *   requestAnimationFrame(animate);
 * }
 * ```
 */
export class LipSync {
  /**
   * Web Audio API context for audio processing
   */
  public readonly audio: AudioContext;

  /**
   * Analyser node for real-time audio analysis
   */
  public readonly analyser: AnalyserNode;

  /**
   * Float array to hold time-domain audio data
   */
  public readonly timeDomainData: Float32Array;

  /**
   * Create a new LipSync instance
   *
   * @param audio - Web Audio API context (will be resumed if suspended)
   */
  public constructor(audio: AudioContext) {
    this.audio = audio;

    // Create analyser node for audio analysis
    this.analyser = audio.createAnalyser();
    this.analyser.fftSize = TIME_DOMAIN_DATA_LENGTH;

    // Initialize buffer for time-domain data
    // Note: Use Uint8Array to avoid type issues, convert during analysis
    this.timeDomainData = new Float32Array(this.analyser.frequencyBinCount);
  }

  /**
   * Update lip sync analysis
   *
   * Should be called in the animation loop to get the current volume value.
   * The volume is processed through a sigmoid curve for natural movement.
   *
   * @returns Analysis result with normalized volume (0-1)
   */
  public update(): LipSyncAnalyzeResult {
    // Get current time-domain data from analyser
    const dataLength = this.analyser.frequencyBinCount;
    const dataArray = new Float32Array(dataLength);
    this.analyser.getFloatTimeDomainData(dataArray);

    // Find maximum absolute volume in the buffer
    let volume = 0.0;
    for (let i = 0; i < dataLength; i++) {
      volume = Math.max(volume, Math.abs(dataArray[i]));
    }

    // Apply sigmoid curve for smooth response
    // Formula: 1 / (1 + exp(-45 * volume + 5))
    // This maps low volumes to near 0, high volumes to near 1
    volume = 1 / (1 + Math.exp(-45 * volume + 5));

    // Apply noise gate to prevent mouth movement from background noise
    if (volume < MIN_VOLUME_THRESHOLD) {
      volume = 0;
    }

    return {
      volume,
    };
  }

  /**
   * Play audio from ArrayBuffer with lip sync
   *
   * Decodes the audio data, plays it through the audio context, and connects
   * it to the analyser for lip sync analysis.
   *
   * @param buffer - Raw audio data as ArrayBuffer
   * @param onEnded - Optional callback when playback completes
   * @returns Promise that resolves when playback starts
   */
  public async playFromArrayBuffer(
    buffer: ArrayBuffer,
    onEnded?: () => void
  ): Promise<void> {
    // Ensure audio context is running
    if (this.audio.state === 'suspended') {
      await this.audio.resume();
    }

    // Decode audio data
    const audioBuffer = await this.audio.decodeAudioData(buffer);

    // Create buffer source
    const bufferSource = this.audio.createBufferSource();
    bufferSource.buffer = audioBuffer;

    // Connect to both destination (speakers) and analyser (lip sync)
    bufferSource.connect(this.audio.destination);
    bufferSource.connect(this.analyser);

    // Start playback
    bufferSource.start();

    // Register ended callback if provided
    if (onEnded) {
      bufferSource.addEventListener('ended', onEnded);
    }
  }

  /**
   * Play audio from URL with lip sync
   *
   * Fetches audio from the given URL and delegates to playFromArrayBuffer.
   *
   * @param url - URL of audio file to play
   * @param onEnded - Optional callback when playback completes
   * @returns Promise that resolves when playback starts
   */
  public async playFromURL(url: string, onEnded?: () => void): Promise<void> {
    // Fetch audio data from URL
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();

    // Delegate to ArrayBuffer playback method
    return this.playFromArrayBuffer(buffer, onEnded);
  }
}

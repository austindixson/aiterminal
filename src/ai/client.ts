/**
 * AI client interface.
 *
 * This is a contract only — the concrete implementation (backed by
 * OpenRouter's OpenAI-compatible REST API) will be added separately.
 */

import type { AIRequest, AIResponse, ModelConfig, TaskType } from './types';

export interface IAIClient {
  /**
   * Send a one-shot query and receive a complete response.
   */
  query(request: AIRequest): Promise<AIResponse>;

  /**
   * Stream a response token-by-token.
   * The async iterable yields content deltas (string chunks).
   */
  streamQuery(request: AIRequest): AsyncIterable<string>;

  /**
   * Return the ModelConfig that would be used for the given task type
   * under the currently active preset.
   */
  getActiveModel(taskType: TaskType): ModelConfig;

  /**
   * Switch to a different router preset by name.
   * Throws if the preset name is not recognised.
   */
  setPreset(presetName: string): void;

  /** Current router preset name (e.g. balanced, performance, budget). */
  getActivePresetName(): string;
}

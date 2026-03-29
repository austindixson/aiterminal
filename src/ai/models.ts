/**
 * Available models registry.
 *
 * Every entry uses the real OpenRouter model ID and approximate pricing
 * as of early 2026.  Pricing may drift — treat these as defaults that
 * can be overridden by a runtime fetch from the OpenRouter /models endpoint.
 */

import type { ModelConfig } from './types';

// ---------------------------------------------------------------------------
// Model catalogue
// ---------------------------------------------------------------------------

const claudeSonnet4: ModelConfig = {
  id: 'anthropic/claude-sonnet-4-20250514',
  name: 'Claude Sonnet 4',
  provider: 'anthropic',
  inputCostPer1M: 3.0,
  outputCostPer1M: 15.0,
  maxTokens: 16384,
  contextWindow: 200_000,
};

const claudeHaiku35: ModelConfig = {
  id: 'anthropic/claude-3.5-haiku-20241022',
  name: 'Claude 3.5 Haiku',
  provider: 'anthropic',
  inputCostPer1M: 0.8,
  outputCostPer1M: 4.0,
  maxTokens: 8192,
  contextWindow: 200_000,
};

const gpt4o: ModelConfig = {
  id: 'openai/gpt-4o-2024-11-20',
  name: 'GPT-4o',
  provider: 'openai',
  inputCostPer1M: 2.5,
  outputCostPer1M: 10.0,
  maxTokens: 16384,
  contextWindow: 128_000,
};

const gpt4oMini: ModelConfig = {
  id: 'openai/gpt-4o-mini-2024-07-18',
  name: 'GPT-4o Mini',
  provider: 'openai',
  inputCostPer1M: 0.15,
  outputCostPer1M: 0.6,
  maxTokens: 16384,
  contextWindow: 128_000,
};

const llama31_70b: ModelConfig = {
  id: 'meta-llama/llama-3.1-70b-instruct',
  name: 'Llama 3.1 70B',
  provider: 'meta-llama',
  inputCostPer1M: 0.35,
  outputCostPer1M: 0.4,
  maxTokens: 8192,
  contextWindow: 131_072,
};

const mistralLarge: ModelConfig = {
  id: 'mistralai/mistral-large-2411',
  name: 'Mistral Large',
  provider: 'mistralai',
  inputCostPer1M: 2.0,
  outputCostPer1M: 6.0,
  maxTokens: 8192,
  contextWindow: 128_000,
};

const deepseekV3: ModelConfig = {
  id: 'deepseek/deepseek-chat',
  name: 'DeepSeek V3',
  provider: 'deepseek',
  inputCostPer1M: 0.14,
  outputCostPer1M: 0.28,
  maxTokens: 8192,
  contextWindow: 128_000,
};

const gemini20Flash: ModelConfig = {
  id: 'google/gemini-2.0-flash-001',
  name: 'Gemini 2.0 Flash',
  provider: 'google',
  inputCostPer1M: 0.1,
  outputCostPer1M: 0.4,
  maxTokens: 8192,
  contextWindow: 1_000_000,
};

const gemini25Pro: ModelConfig = {
  id: 'google/gemini-2.5-pro-preview-03-25',
  name: 'Gemini 2.5 Pro',
  provider: 'google',
  inputCostPer1M: 1.25,
  outputCostPer1M: 10.0,
  maxTokens: 16384,
  contextWindow: 1_000_000,
};

const nemotronNano: ModelConfig = {
  id: 'nvidia/nemotron-3-nano-30b-a3b:free',
  name: 'Nemotron Nano 30B',
  provider: 'nvidia',
  inputCostPer1M: 0,
  outputCostPer1M: 0,
  maxTokens: 8192,
  contextWindow: 131_072,
};

const nemotronSuper: ModelConfig = {
  id: 'nvidia/nemotron-3-super-120b-a12b:free',
  name: 'Nemotron Super 120B',
  provider: 'nvidia',
  inputCostPer1M: 0,
  outputCostPer1M: 0,
  maxTokens: 8192,
  contextWindow: 131_072,
};

// ---------------------------------------------------------------------------
// Exported registry  (keyed by OpenRouter model ID)
// ---------------------------------------------------------------------------

export const MODELS: ReadonlyMap<string, ModelConfig> = new Map<string, ModelConfig>([
  [claudeSonnet4.id, claudeSonnet4],
  [claudeHaiku35.id, claudeHaiku35],
  [gpt4o.id, gpt4o],
  [gpt4oMini.id, gpt4oMini],
  [llama31_70b.id, llama31_70b],
  [mistralLarge.id, mistralLarge],
  [deepseekV3.id, deepseekV3],
  [gemini20Flash.id, gemini20Flash],
  [gemini25Pro.id, gemini25Pro],
  [nemotronNano.id, nemotronNano],
  [nemotronSuper.id, nemotronSuper],
]);

/**
 * Look up a model by its OpenRouter ID.
 * Throws if the ID is not in the registry.
 */
export function getModel(id: string): ModelConfig {
  const model = MODELS.get(id);
  if (!model) {
    throw new Error(`Unknown model ID: "${id}". Available: ${[...MODELS.keys()].join(', ')}`);
  }
  return model;
}

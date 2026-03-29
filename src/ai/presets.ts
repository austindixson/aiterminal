/**
 * Router presets.
 *
 * Each preset maps a TaskType to the model best suited for that job.
 * The model IDs reference entries in the MODELS registry (./models.ts).
 */

import type { RouterPreset } from './types';

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

const balanced: RouterPreset = {
  name: 'balanced',
  description: 'QWen3 Coder Next — escalates to GLM-5 for complex tasks.',
  commandHelper: 'z-ai/glm-4.7-flash',
  codeExplainer: 'qwen/qwen3-coder-next',
  generalAssistant: 'qwen/qwen3-coder-next',
  errorAnalyzer: 'qwen/qwen3-coder-next',
  escalationModel: 'z-ai/glm-5',
};

const performance: RouterPreset = {
  name: 'performance',
  description: 'Best available — escalates to Claude Sonnet for complex tasks.',
  commandHelper: 'openai/gpt-4o-2024-11-20',
  codeExplainer: 'qwen/qwen3-coder-next',
  generalAssistant: 'google/gemini-2.5-pro-preview-03-25',
  errorAnalyzer: 'qwen/qwen3-coder-next',
  escalationModel: 'anthropic/claude-sonnet-4-20250514',
};

// Note: errorAnalyzer is qwen3-coder-next across ALL presets

const budget: RouterPreset = {
  name: 'budget',
  description: 'Free models — escalates to QWen3 Coder for complex tasks.',
  commandHelper: 'z-ai/glm-4.5-air:free',
  codeExplainer: 'nvidia/nemotron-3-super-120b-a12b:free',
  generalAssistant: 'z-ai/glm-4.5-air:free',
  errorAnalyzer: 'qwen/qwen3-coder-next',
  escalationModel: 'qwen/qwen3-coder-next',
};

const speed: RouterPreset = {
  name: 'speed',
  description: 'GLM-4.7 Flash — escalates to QWen3 Coder for complex tasks.',
  commandHelper: 'z-ai/glm-4.7-flash',
  codeExplainer: 'z-ai/glm-4.7-flash',
  generalAssistant: 'z-ai/glm-4.7-flash',
  errorAnalyzer: 'z-ai/glm-4.7-flash',
  escalationModel: 'qwen/qwen3-coder-next',
};

// ---------------------------------------------------------------------------
// Exported registry
// ---------------------------------------------------------------------------

export const PRESETS: ReadonlyMap<string, RouterPreset> = new Map<string, RouterPreset>([
  [balanced.name, balanced],
  [performance.name, performance],
  [budget.name, budget],
  [speed.name, speed],
]);

export const DEFAULT_PRESET = 'budget';

/**
 * Look up a preset by name.
 * Throws if the name is not in the registry.
 */
export function getPreset(name: string): RouterPreset {
  const preset = PRESETS.get(name);
  if (!preset) {
    throw new Error(
      `Unknown preset: "${name}". Available: ${[...PRESETS.keys()].join(', ')}`,
    );
  }
  return preset;
}

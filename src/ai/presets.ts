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
  description: 'QWen3 Coder Next for all tasks — strong coding with good general ability.',
  commandHelper: 'qwen/qwen3-coder-next',
  codeExplainer: 'qwen/qwen3-coder-next',
  generalAssistant: 'qwen/qwen3-coder-next',
  errorAnalyzer: 'qwen/qwen3-coder-next',
};

const performance: RouterPreset = {
  name: 'performance',
  description: 'Best available model for every task — highest quality regardless of cost.',
  commandHelper: 'openai/gpt-4o-2024-11-20',
  codeExplainer: 'anthropic/claude-sonnet-4-20250514',
  generalAssistant: 'google/gemini-2.5-pro-preview-03-25',
  errorAnalyzer: 'anthropic/claude-sonnet-4-20250514',
};

const budget: RouterPreset = {
  name: 'budget',
  description: 'Free Nvidia Nemotron models — zero cost for daily use.',
  commandHelper: 'nvidia/nemotron-3-nano-30b-a3b:free',
  codeExplainer: 'nvidia/nemotron-3-super-120b-a12b:free',
  generalAssistant: 'nvidia/nemotron-3-nano-30b-a3b:free',
  errorAnalyzer: 'nvidia/nemotron-3-super-120b-a12b:free',
};

const speed: RouterPreset = {
  name: 'speed',
  description: 'Fastest responses with streaming — optimized for real-time voice chat.',
  commandHelper: 'google/gemini-2.0-flash-exp',
  codeExplainer: 'openai/gpt-4o-2024-11-20',
  generalAssistant: 'google/gemini-2.0-flash-exp',
  errorAnalyzer: 'openai/gpt-4o-mini-2024-07-18',
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

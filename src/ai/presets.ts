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
  description: 'Good mix of quality and cost — sensible default for daily use.',
  commandHelper: 'openai/gpt-4o-mini-2024-07-18',
  codeExplainer: 'anthropic/claude-sonnet-4-20250514',
  generalAssistant: 'openai/gpt-4o-2024-11-20',
  errorAnalyzer: 'anthropic/claude-sonnet-4-20250514',
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
  description: 'Cheapest viable model for each task — ideal for high-volume or cost-sensitive usage.',
  commandHelper: 'google/gemini-2.0-flash-001',
  codeExplainer: 'deepseek/deepseek-chat',
  generalAssistant: 'openai/gpt-4o-mini-2024-07-18',
  errorAnalyzer: 'deepseek/deepseek-chat',
};

// ---------------------------------------------------------------------------
// Exported registry
// ---------------------------------------------------------------------------

export const PRESETS: ReadonlyMap<string, RouterPreset> = new Map<string, RouterPreset>([
  [balanced.name, balanced],
  [performance.name, performance],
  [budget.name, budget],
]);

export const DEFAULT_PRESET = 'balanced';

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

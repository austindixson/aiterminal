/**
 * AI module barrel export.
 *
 * Re-exports the public surface of the AI routing engine so consumers
 * can import everything from `@/ai`.
 */

// Types
export type {
  AIRequest,
  AIResponse,
  AIServiceConfig,
  ContextMessage,
  ModelConfig,
  RouterPreset,
  TaskType,
} from './types';

// Interface
export type { IAIClient } from './client';

// Registries
export { MODELS, getModel } from './models';
export { PRESETS, DEFAULT_PRESET, getPreset } from './presets';

// Client implementation
export { OpenRouterClient, resolveModelForTask } from './openrouter-client';

/**
 * Core AI types for AITerminal.
 *
 * AITerminal routes requests to different models via OpenRouter's
 * OpenAI-compatible API.  A "RouterPreset" maps each TaskType to
 * the model best suited for that job.
 */

// ---------------------------------------------------------------------------
// Model metadata
// ---------------------------------------------------------------------------

export interface ModelConfig {
  readonly id: string;              // OpenRouter model ID, e.g. "anthropic/claude-sonnet-4-20250514"
  readonly name: string;            // Human-friendly label, e.g. "Claude Sonnet 4"
  readonly provider: string;        // Provider slug, e.g. "anthropic"
  readonly inputCostPer1M: number;  // USD per 1 million input tokens
  readonly outputCostPer1M: number; // USD per 1 million output tokens
  readonly maxTokens: number;       // Maximum output tokens the model supports
  readonly contextWindow: number;   // Total context window size in tokens
}

// ---------------------------------------------------------------------------
// Router presets
// ---------------------------------------------------------------------------

export interface RouterPreset {
  readonly name: string;
  readonly description: string;
  readonly commandHelper: string;    // Model ID for shell help        (fast, cheap)
  readonly codeExplainer: string;    // Model ID for code explanation   (smart)
  readonly generalAssistant: string; // Model ID for general questions  (balanced)
  readonly errorAnalyzer: string;    // Model ID for error analysis     (accurate)
}

// ---------------------------------------------------------------------------
// Request / Response
// ---------------------------------------------------------------------------

export interface AIRequest {
  readonly prompt: string;
  readonly context: ReadonlyArray<ContextMessage>;
  readonly taskType: TaskType;
  readonly maxTokens?: number;
}

export interface AIResponse {
  readonly content: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly latencyMs: number;
  readonly cost: number;
}

// ---------------------------------------------------------------------------
// Conversation context
// ---------------------------------------------------------------------------

export interface ContextMessage {
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
}

// ---------------------------------------------------------------------------
// Task classification
// ---------------------------------------------------------------------------

export type TaskType =
  | 'command_help'
  | 'code_explain'
  | 'general'
  | 'error_analysis';

// ---------------------------------------------------------------------------
// Service configuration
// ---------------------------------------------------------------------------

export interface AIServiceConfig {
  readonly apiKey: string;
  readonly baseUrl: string;        // default: "https://openrouter.ai/api/v1"
  readonly activePreset: string;
  readonly systemPrompt: string;
}

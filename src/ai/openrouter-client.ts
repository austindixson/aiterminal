/**
 * OpenRouterClient — concrete IAIClient backed by OpenRouter's
 * OpenAI-compatible REST API.
 *
 * Uses the `openai` npm package configured with OpenRouter's base URL.
 * All error handling is graceful: public methods return error AIResponse
 * objects instead of throwing.
 */

import OpenAI from 'openai';
import type { IAIClient } from './client';
import type {
  AIRequest,
  AIResponse,
  AIServiceConfig,
  ContextMessage,
  ModelConfig,
  RouterPreset,
  TaskType,
} from './types';
import { getModel } from './models';
import { getPreset } from './presets';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MAX_TOKENS = 4096;

// ---------------------------------------------------------------------------
// Pure helper: map TaskType → RouterPreset field
// ---------------------------------------------------------------------------

const TASK_TO_PRESET_FIELD: Readonly<Record<string, keyof RouterPreset>> = {
  command_help: 'commandHelper',
  code_explain: 'codeExplainer',
  general: 'generalAssistant',
  error_analysis: 'errorAnalyzer',
};

/**
 * Pure function that resolves the model ID for a given task type and preset.
 *
 * Falls back to `generalAssistant` when the task type is not recognized.
 */
export function resolveModelForTask(
  taskType: TaskType,
  presetName: string,
): string {
  const preset = getPreset(presetName);
  const field = TASK_TO_PRESET_FIELD[taskType] ?? 'generalAssistant';
  return preset[field];
}

// ---------------------------------------------------------------------------
// Cost calculation
// ---------------------------------------------------------------------------

function calculateCost(
  model: ModelConfig,
  inputTokens: number,
  outputTokens: number,
): number {
  const inputCost = (inputTokens / 1_000_000) * model.inputCostPer1M;
  const outputCost = (outputTokens / 1_000_000) * model.outputCostPer1M;
  return inputCost + outputCost;
}

// ---------------------------------------------------------------------------
// Error response factory
// ---------------------------------------------------------------------------

function createErrorResponse(error: unknown): AIResponse {
  const isRateLimit =
    error instanceof Error &&
    'status' in error &&
    (error as { status: number }).status === 429;

  const message = isRateLimit
    ? 'Rate limit exceeded. Please wait a moment and try again.'
    : error instanceof Error
      ? `Error: ${error.message}`
      : 'An unknown error occurred.';

  return {
    content: message,
    model: '',
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    cost: 0,
  };
}

// ---------------------------------------------------------------------------
// Build messages array (immutable)
// ---------------------------------------------------------------------------

function buildMessages(
  systemPrompt: string,
  context: ReadonlyArray<ContextMessage>,
  userPrompt: string,
): ReadonlyArray<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const system = { role: 'system' as const, content: systemPrompt };
  const contextMessages = context.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
  const user = { role: 'user' as const, content: userPrompt };

  return [system, ...contextMessages, user];
}

// ---------------------------------------------------------------------------
// OpenRouterClient
// ---------------------------------------------------------------------------

export class OpenRouterClient implements IAIClient {
  private readonly openai: OpenAI;
  private readonly systemPrompt: string;
  private activePresetName: string;

  constructor(config: AIServiceConfig) {
    if (!config.apiKey) {
      throw new Error('API key is required to create an OpenRouterClient.');
    }

    const baseURL = config.baseUrl || DEFAULT_BASE_URL;

    this.openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL,
      defaultHeaders: {
        'HTTP-Referer': 'https://aiterminal.dev',
        'X-Title': 'AITerminal',
      },
    });

    this.systemPrompt = config.systemPrompt;
    this.activePresetName = config.activePreset;

    // Validate that the preset exists at construction time.
    getPreset(this.activePresetName);
  }

  // -------------------------------------------------------------------------
  // IAIClient — getActiveModel
  // -------------------------------------------------------------------------

  getActiveModel(taskType: TaskType): ModelConfig {
    const modelId = resolveModelForTask(taskType, this.activePresetName);
    return getModel(modelId);
  }

  // -------------------------------------------------------------------------
  // IAIClient — setPreset
  // -------------------------------------------------------------------------

  setPreset(presetName: string): void {
    // Validate before mutating — getPreset throws on invalid names.
    getPreset(presetName);
    this.activePresetName = presetName;
  }

  getActivePresetName(): string {
    return this.activePresetName;
  }

  // -------------------------------------------------------------------------
  // IAIClient — query
  // -------------------------------------------------------------------------

  async query(request: AIRequest): Promise<AIResponse> {
    const startMs = Date.now();

    try {
      const modelId = resolveModelForTask(
        request.taskType,
        this.activePresetName,
      );
      const modelConfig = getModel(modelId);
      const messages = buildMessages(
        this.systemPrompt,
        request.context,
        request.prompt,
      );

      const completion = await this.openai.chat.completions.create({
        model: modelId,
        messages: [...messages],
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      });

      const latencyMs = Date.now() - startMs;
      const content = completion.choices[0]?.message?.content ?? '';
      const inputTokens = completion.usage?.prompt_tokens ?? 0;
      const outputTokens = completion.usage?.completion_tokens ?? 0;
      const cost = calculateCost(modelConfig, inputTokens, outputTokens);

      return {
        content,
        model: completion.model ?? modelId,
        inputTokens,
        outputTokens,
        latencyMs,
        cost,
      };
    } catch (error: unknown) {
      return createErrorResponse(error);
    }
  }

  // -------------------------------------------------------------------------
  // IAIClient — streamQuery
  // -------------------------------------------------------------------------

  async *streamQuery(request: AIRequest): AsyncIterable<string> {
    try {
      const modelId = resolveModelForTask(
        request.taskType,
        this.activePresetName,
      );
      const messages = buildMessages(
        this.systemPrompt,
        request.context,
        request.prompt,
      );

      const stream = await this.openai.chat.completions.create({
        model: modelId,
        messages: [...messages],
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        stream: true,
      });

      for await (const chunk of stream as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          yield delta;
        }
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Stream error occurred.';
      yield `Error: ${errorMessage}`;
    }
  }
}

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
const DEFAULT_MAX_TOKENS = 8192;

const RETRY_DELAYS_MS = [1000, 2000, 4000];
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503]);

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
/**
 * Detect if a prompt requires a more capable model.
 * Lightweight keyword/pattern detection — no LLM call.
 */
function isComplexPrompt(prompt: string): boolean {
  const lower = prompt.toLowerCase()

  // Multi-file operations
  if (/refactor|restructur|migrat|architect|redesign/i.test(lower)) return true
  // Debugging complex issues
  if (/debug|troubleshoot|investigate|root cause|race condition|memory leak/i.test(lower)) return true
  // Multi-step tasks
  if (/implement.*and.*test|build.*deploy|fix.*all|overhaul/i.test(lower)) return true
  // Error recovery signals
  if (/still.*fail|doesn't work|broke|crash|not working|tried everything/i.test(lower)) return true
  // Architecture questions
  if (/how should I.*structur|best approach|design pattern|system design/i.test(lower)) return true
  // Agent loop continuation with errors — needs a stronger model
  if (/error.*compil|compilation.*error|build.*fail|test.*fail/i.test(lower)) return true
  // Agent loop continuation (multiple tool calls accumulated)
  if (/Applied edits to:|Read:.*Continue/i.test(lower)) return true
  // End-to-end testing (complex multi-step)
  if (/end.to.end|e2e|comprehensive.*test|full.*test/i.test(lower)) return true
  // Long prompts (>500 chars) suggest complexity
  if (prompt.length > 500) return true

  return false
}

export function resolveModelForTask(
  taskType: TaskType,
  presetName: string,
  prompt?: string,
): string {
  const preset = getPreset(presetName);
  const field = TASK_TO_PRESET_FIELD[taskType] ?? 'generalAssistant';
  const baseModel = preset[field] as string;

  // Auto-escalate to stronger model for complex prompts
  const escalation = preset.escalationModel;
  if (prompt && escalation && isComplexPrompt(prompt)) {
    console.log(`[OpenRouter] Escalating to ${escalation} (complex prompt detected)`);
    return escalation;
  }

  return baseModel;
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

// ---------------------------------------------------------------------------
// Provider routing (Hermes-style)
// ---------------------------------------------------------------------------

export interface ProviderRouting {
  readonly sort?: 'price' | 'throughput' | 'latency'
  readonly only?: readonly string[]
  readonly ignore?: readonly string[]
  readonly order?: readonly string[]
  readonly require_parameters?: boolean
  readonly data_collection?: 'allow' | 'deny'
}

function loadProviderRouting(): ProviderRouting | undefined {
  try {
    const fs = require('fs')
    const path = require('path')
    const os = require('os')
    const configPath = path.join(os.homedir(), '.aiterminal', 'provider-routing.json')
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8')
      return JSON.parse(raw) as ProviderRouting
    }
  } catch {
    // No routing config — use defaults
  }

  // Also check env var
  const envRouting = process.env.AITERMINAL_PROVIDER_ROUTING
  if (envRouting) {
    try {
      return JSON.parse(envRouting) as ProviderRouting
    } catch { /* ignore */ }
  }

  return undefined
}

export class OpenRouterClient implements IAIClient {
  private readonly openai: OpenAI;
  private systemPrompt: string;
  private activePresetName: string;
  private readonly providerRouting: ProviderRouting | undefined;

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
    this.providerRouting = loadProviderRouting();

    if (this.providerRouting) {
      console.log('[OpenRouterClient] Provider routing loaded:', this.providerRouting);
    }

    // Validate that the preset exists at construction time.
    getPreset(this.activePresetName);
  }

  /** Build extra body params for provider routing */
  private getProviderBody(): Record<string, unknown> {
    if (!this.providerRouting) return {};
    return { provider: { ...this.providerRouting } };
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
  // Update system prompt (for agent mode)
  // -------------------------------------------------------------------------

  setSystemPrompt(systemPrompt: string): void {
    this.systemPrompt = systemPrompt;
  }

  getSystemPrompt(): string {
    return this.systemPrompt;
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
        request.prompt,
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
        ...this.getProviderBody(),
      } as any);

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
    const modelId = request.modelOverride ?? resolveModelForTask(
      request.taskType,
      this.activePresetName,
      request.prompt,
    );
    const messages = buildMessages(
      this.systemPrompt,
      request.context,
      request.prompt,
    );

    // Retry only on connection/setup errors (before streaming starts).
    // Once streaming begins, yield chunks in real-time for responsive UX.
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const stream = await (this.openai.chat.completions.create as Function)({
          model: modelId,
          messages: [...messages],
          max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          stream: true,
          timeout: 120000, // 2 minute timeout for stream setup
          ...this.getProviderBody(),
        });

        // Connection succeeded — stream in real-time (no more retries possible)
        for await (const chunk of stream as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
          const choice = chunk.choices[0];
          const delta = choice?.delta?.content;
          if (delta) {
            yield delta;
          }
          if (choice?.finish_reason && choice.finish_reason !== 'stop') {
            console.warn(`[OpenRouter] Stream ended with finish_reason: ${choice.finish_reason}`);
          }
          const usage = (chunk as any).usage;
          if (usage) {
            yield `\x00USAGE:${JSON.stringify(usage)}`;
          }
        }
        return; // Stream completed successfully
      } catch (error: unknown) {
        const status =
          error instanceof Error && 'status' in error
            ? (error as { status: number }).status
            : undefined;

        const isRetryable = status !== undefined && RETRYABLE_STATUS_CODES.has(status);

        if (!isRetryable || attempt >= RETRY_DELAYS_MS.length) {
          const errorMessage =
            error instanceof Error ? error.message : 'Stream error occurred.';
          yield `Error: ${errorMessage}`;
          return;
        }

        const delayMs = RETRY_DELAYS_MS[attempt];
        console.warn(
          `[OpenRouter] Retryable error (status ${status}), attempt ${attempt + 1}/${RETRY_DELAYS_MS.length}. Retrying in ${delayMs}ms…`,
        );
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
}

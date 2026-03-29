/**
 * Tests for OpenRouterClient — the concrete IAIClient backed by OpenRouter.
 *
 * These tests mock the `openai` package so no real API calls are made.
 * TDD: this file was written BEFORE the implementation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenRouterClient, resolveModelForTask } from './openrouter-client';
import type { AIRequest, AIServiceConfig, TaskType } from './types';

// ---------------------------------------------------------------------------
// Mock the `openai` package
// ---------------------------------------------------------------------------

const mockCreate = vi.fn();

vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<AIServiceConfig> = {}): AIServiceConfig {
  return {
    apiKey: 'test-api-key-123',
    baseUrl: 'https://openrouter.ai/api/v1',
    activePreset: 'balanced',
    systemPrompt: 'You are a helpful terminal assistant.',
    ...overrides,
  };
}

function makeRequest(overrides: Partial<AIRequest> = {}): AIRequest {
  return {
    prompt: 'How do I list files?',
    context: [],
    taskType: 'command_help',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Constructor
// ---------------------------------------------------------------------------

describe('OpenRouterClient — constructor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates client with valid config', () => {
    const client = new OpenRouterClient(makeConfig());
    expect(client).toBeDefined();
  });

  it('throws on missing API key', () => {
    expect(() => new OpenRouterClient(makeConfig({ apiKey: '' }))).toThrow(
      /api key/i,
    );
  });

  it('uses default base URL when not provided', () => {
    // Pass an empty baseUrl — constructor should fall back to the default.
    const client = new OpenRouterClient(makeConfig({ baseUrl: '' }));
    expect(client).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. getActiveModel(taskType)
// ---------------------------------------------------------------------------

describe('OpenRouterClient — getActiveModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('"balanced" preset + "command_help" returns GLM-4.7 Flash', () => {
    const client = new OpenRouterClient(makeConfig({ activePreset: 'balanced' }));
    const model = client.getActiveModel('command_help');
    expect(model.name).toBe('GLM-4.7 Flash');
    expect(model.id).toBe('z-ai/glm-4.7-flash');
  });

  it('"balanced" preset + "code_explain" returns QWen3 Coder Next', () => {
    const client = new OpenRouterClient(makeConfig({ activePreset: 'balanced' }));
    const model = client.getActiveModel('code_explain');
    expect(model.name).toBe('QWen3 Coder Next');
    expect(model.id).toBe('qwen/qwen3-coder-next');
  });

  it('"performance" preset + "general" returns Gemini 2.5 Pro', () => {
    const client = new OpenRouterClient(
      makeConfig({ activePreset: 'performance' }),
    );
    const model = client.getActiveModel('general');
    expect(model.name).toBe('Gemini 2.5 Pro');
    expect(model.id).toBe('google/gemini-2.5-pro-preview-03-25');
  });

  it('"budget" preset + "error_analysis" returns QWen3 Coder Next', () => {
    const client = new OpenRouterClient(makeConfig({ activePreset: 'budget' }));
    const model = client.getActiveModel('error_analysis');
    expect(model.name).toBe('QWen3 Coder Next');
    expect(model.id).toBe('qwen/qwen3-coder-next');
  });
});

// ---------------------------------------------------------------------------
// 3. setPreset(name)
// ---------------------------------------------------------------------------

describe('OpenRouterClient — setPreset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('valid preset name switches successfully', () => {
    const client = new OpenRouterClient(makeConfig({ activePreset: 'balanced' }));
    client.setPreset('performance');
    // After switching, general should use Gemini 2.5 Pro (performance preset).
    const model = client.getActiveModel('general');
    expect(model.name).toBe('Gemini 2.5 Pro');
  });

  it('invalid preset name throws error', () => {
    const client = new OpenRouterClient(makeConfig());
    expect(() => client.setPreset('nonexistent')).toThrow(/unknown preset/i);
  });

  it('after switching, getActiveModel returns models from new preset', () => {
    const client = new OpenRouterClient(makeConfig({ activePreset: 'balanced' }));
    // balanced → command_help = GLM-4.7 Flash
    expect(client.getActiveModel('command_help').name).toBe('GLM-4.7 Flash');

    client.setPreset('budget');
    // budget → command_help = GLM-4.5 Air
    expect(client.getActiveModel('command_help').name).toBe('GLM-4.5 Air');
  });
});

// ---------------------------------------------------------------------------
// 4. query(request) — mock fetch/openai
// ---------------------------------------------------------------------------

describe('OpenRouterClient — query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends correct model ID based on task type', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'Use `ls`.' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
      model: 'z-ai/glm-4.7-flash',
    });

    const client = new OpenRouterClient(makeConfig());
    await client.query(makeRequest({ taskType: 'command_help' }));

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe('z-ai/glm-4.7-flash');
  });

  it('includes system prompt in messages', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'Hello!' } }],
      usage: { prompt_tokens: 10, completion_tokens: 3 },
      model: 'qwen/qwen3-coder-next',
    });

    const systemPrompt = 'You are a terminal AI.';
    const client = new OpenRouterClient(makeConfig({ systemPrompt }));
    await client.query(makeRequest());

    const callArgs = mockCreate.mock.calls[0][0];
    const systemMessage = callArgs.messages.find(
      (m: { role: string }) => m.role === 'system',
    );
    expect(systemMessage).toBeDefined();
    expect(systemMessage.content).toBe(systemPrompt);
  });

  it('returns properly formatted AIResponse', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'Run `ls -la`.' } }],
      usage: { prompt_tokens: 20, completion_tokens: 10 },
      model: 'qwen/qwen3-coder-next',
    });

    const client = new OpenRouterClient(makeConfig());
    const response = await client.query(makeRequest());

    expect(response.content).toBe('Run `ls -la`.');
    expect(response.model).toBe('qwen/qwen3-coder-next');
    expect(response.inputTokens).toBe(20);
    expect(response.outputTokens).toBe(10);
    expect(response.latencyMs).toBeGreaterThanOrEqual(0);
    expect(typeof response.cost).toBe('number');
    expect(response.cost).toBeGreaterThanOrEqual(0);
  });

  it('handles API error gracefully (returns error message, does not throw)', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Internal Server Error'));

    const client = new OpenRouterClient(makeConfig());
    const response = await client.query(makeRequest());

    // Should NOT throw — returns an error AIResponse.
    expect(response.content).toMatch(/error/i);
    expect(response.inputTokens).toBe(0);
    expect(response.outputTokens).toBe(0);
  });

  it('handles rate limiting (429 status)', async () => {
    const rateLimitError = Object.assign(new Error('Rate limit exceeded'), {
      status: 429,
    });
    mockCreate.mockRejectedValueOnce(rateLimitError);

    const client = new OpenRouterClient(makeConfig());
    const response = await client.query(makeRequest());

    expect(response.content).toMatch(/rate.limit/i);
    expect(response.inputTokens).toBe(0);
    expect(response.outputTokens).toBe(0);
  });

  it('handles network errors', async () => {
    mockCreate.mockRejectedValueOnce(new TypeError('fetch failed'));

    const client = new OpenRouterClient(makeConfig());
    const response = await client.query(makeRequest());

    expect(response.content).toMatch(/error/i);
    expect(response.inputTokens).toBe(0);
    expect(response.outputTokens).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. resolveModelForTask — pure function
// ---------------------------------------------------------------------------

describe('resolveModelForTask', () => {
  it('command_help maps to commandHelper field', () => {
    const modelId = resolveModelForTask('command_help', 'balanced');
    expect(modelId).toBe('z-ai/glm-4.7-flash');
  });

  it('code_explain maps to codeExplainer field', () => {
    const modelId = resolveModelForTask('code_explain', 'balanced');
    expect(modelId).toBe('qwen/qwen3-coder-next');
  });

  it('general maps to generalAssistant field', () => {
    const modelId = resolveModelForTask('general', 'performance');
    expect(modelId).toBe('google/gemini-2.5-pro-preview-03-25');
  });

  it('error_analysis maps to errorAnalyzer field', () => {
    const modelId = resolveModelForTask('error_analysis', 'budget');
    expect(modelId).toBe('qwen/qwen3-coder-next');
  });

  it('falls back to generalAssistant for unknown task types', () => {
    // Cast to TaskType to simulate an unexpected value at runtime.
    const modelId = resolveModelForTask('unknown_task' as TaskType, 'balanced');
    expect(modelId).toBe('qwen/qwen3-coder-next'); // balanced generalAssistant
  });
});

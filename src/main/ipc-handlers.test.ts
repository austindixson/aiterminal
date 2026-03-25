/*
 * Path: /Users/ghost/Desktop/aiterminal/src/main/ipc-handlers.test.ts
 * Module: main/test
 * Purpose: Unit tests for IPC handlers — command execution, AI queries, theme management, PTY bridge
 * Dependencies: vitest, ipc-handlers, IAIClient, Theme types
 * Related: /Users/ghost/Desktop/aiterminal/src/main/ipc-handlers.ts
 * Keywords: test, IPC, handlers, command-execution, AI-queries, theme-management, PTY-bridge, unit-tests, mocks
 * Last Updated: 2026-03-24
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  createCommandHandler,
  createAIQueryHandler,
  createThemeHandlers,
  createPtyBridge,
  setupAllHandlers,
} from './ipc-handlers';

import type { IAIClient } from '@/ai/client';
import type { Theme } from '@/themes/types';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

/** Vitest mock typing can infer `never` for PTY callbacks; narrow explicitly. */
function callDataCb(cb: ((data: string) => void) | null, data: string): void {
  if (cb) (cb as (d: string) => void)(data);
}

function callExitCb(
  cb: ((exitResult: { exitCode: number; signal?: number }) => void) | null,
  exitResult: { exitCode: number; signal?: number },
): void {
  if (cb) (cb as (e: { exitCode: number; signal?: number }) => void)(exitResult);
}

function createMockPty() {
  return {
    pid: 12345,
    cols: 80,
    rows: 24,
    process: '/bin/zsh',
    handleFlowControl: false,
    onData: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    onExit: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    write: vi.fn(),
    resize: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    kill: vi.fn(),
    clear: vi.fn(),
  };
}

function createMockAIClient(overrides: Partial<IAIClient> = {}): IAIClient {
  return {
    query: vi.fn().mockResolvedValue({
      content: 'Mock AI response',
      model: 'test-model',
      inputTokens: 10,
      outputTokens: 20,
      latencyMs: 100,
      cost: 0.001,
    }),
    streamQuery: vi.fn(),
    getActiveModel: vi.fn().mockReturnValue({
      id: 'test-model',
      name: 'Test Model',
      provider: 'test',
      inputCostPer1M: 1,
      outputCostPer1M: 2,
      maxTokens: 4096,
      contextWindow: 128_000,
    }),
    setPreset: vi.fn(),
    getActivePresetName: vi.fn().mockReturnValue('balanced'),
    ...overrides,
  };
}

function createMockWindow() {
  return {
    webContents: {
      send: vi.fn(),
      on: vi.fn(),
    },
    on: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
  } as unknown as Electron.BrowserWindow;
}

function createMockIpcMainHandle() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
    on: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
    getHandler: (channel: string) => handlers.get(channel),
    handlers,
  };
}

// ---------------------------------------------------------------------------
// createCommandHandler
// ---------------------------------------------------------------------------

describe('createCommandHandler', () => {
  let mockPty: ReturnType<typeof createMockPty>;
  let handler: ReturnType<typeof createCommandHandler>;

  beforeEach(() => {
    mockPty = createMockPty();
    handler = createCommandHandler(mockPty);
  });

  it('writes command to PTY and captures output', async () => {
    // Simulate PTY producing output then exiting
    let dataCallback: ((data: string) => void) | null = null;
    let exitCallback: ((exitResult: { exitCode: number; signal?: number }) => void) | null = null;

    mockPty.onData.mockImplementation((cb: (data: string) => void) => {
      dataCallback = cb;
      return { dispose: vi.fn() };
    });
    mockPty.onExit.mockImplementation((cb: (exitResult: { exitCode: number; signal?: number }) => void) => {
      exitCallback = cb;
      return { dispose: vi.fn() };
    });

    // Re-create handler with the updated mocks
    handler = createCommandHandler(mockPty);

    const resultPromise = handler('echo hello');

    // Simulate data flowing back from PTY
    callDataCb(dataCallback, 'hello\n');
    callExitCb(exitCallback, { exitCode: 0 });

    const result = await resultPromise;

    expect(mockPty.write).toHaveBeenCalledWith('echo hello\r');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello');
    expect(result.isAITriggered).toBe(false);
  });

  it('returns CommandResult with non-zero exitCode on failure', async () => {
    let dataCallback: ((data: string) => void) | null = null;
    let exitCallback: ((exitResult: { exitCode: number; signal?: number }) => void) | null = null;

    mockPty.onData.mockImplementation((cb: (data: string) => void) => {
      dataCallback = cb;
      return { dispose: vi.fn() };
    });
    mockPty.onExit.mockImplementation((cb: (exitResult: { exitCode: number; signal?: number }) => void) => {
      exitCallback = cb;
      return { dispose: vi.fn() };
    });

    handler = createCommandHandler(mockPty);

    const resultPromise = handler('nonexistent-cmd');

    callDataCb(dataCallback, 'zsh: command not found: nonexistent-cmd\n');
    callExitCb(exitCallback, { exitCode: 127 });

    const result = await resultPromise;

    expect(result.exitCode).toBe(127);
    expect(result.isAITriggered).toBe(true);
  });

  it('handles command timeout (5s default)', async () => {
    vi.useFakeTimers();

    mockPty.onData.mockReturnValue({ dispose: vi.fn() });
    mockPty.onExit.mockReturnValue({ dispose: vi.fn() });

    handler = createCommandHandler(mockPty);

    const resultPromise = handler('sleep 100');

    // Advance past the timeout
    vi.advanceTimersByTime(5_100);

    const result = await resultPromise;

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toContain('timeout');

    vi.useRealTimers();
  });

  it('disposes event listeners after command completes', async () => {
    const disposeData = vi.fn();
    const disposeExit = vi.fn();
    let exitCallback: ((exitResult: { exitCode: number; signal?: number }) => void) | null = null;

    mockPty.onData.mockImplementation(() => {
      return { dispose: disposeData };
    });
    mockPty.onExit.mockImplementation((cb: (exitResult: { exitCode: number; signal?: number }) => void) => {
      exitCallback = cb;
      return { dispose: disposeExit };
    });

    handler = createCommandHandler(mockPty);

    const resultPromise = handler('ls');

    callExitCb(exitCallback, { exitCode: 0 });

    await resultPromise;

    expect(disposeData).toHaveBeenCalled();
    expect(disposeExit).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createAIQueryHandler
// ---------------------------------------------------------------------------

describe('createAIQueryHandler', () => {
  let mockClient: IAIClient;
  let handler: ReturnType<typeof createAIQueryHandler>;

  beforeEach(() => {
    mockClient = createMockAIClient();
    handler = createAIQueryHandler(mockClient);
  });

  it('forwards request to AI client and returns response', async () => {
    const request = {
      prompt: 'How do I list files?',
      taskType: 'general' as const,
      context: [],
    };

    const result = await handler(request);

    expect(mockClient.query).toHaveBeenCalledWith({
      prompt: request.prompt,
      taskType: request.taskType,
      context: request.context,
    });
    expect(result.content).toBe('Mock AI response');
    expect(result.model).toBe('test-model');
  });

  it('passes context messages through to the client', async () => {
    const request = {
      prompt: 'Explain this error',
      taskType: 'error_analysis' as const,
      context: [
        { role: 'user' as const, content: 'I ran npm install' },
        { role: 'assistant' as const, content: 'What error did you see?' },
      ],
    };

    await handler(request);

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.objectContaining({
        context: request.context,
      }),
    );
  });

  it('handles missing API key gracefully', async () => {
    const errorClient = createMockAIClient({
      query: vi.fn().mockRejectedValue(new Error('API key is required to create an OpenRouterClient.')),
    });

    handler = createAIQueryHandler(errorClient);

    const request = {
      prompt: 'test',
      taskType: 'general' as const,
      context: [],
    };

    const result = await handler(request);

    expect(result.content).toContain('API key');
    expect(result.model).toBe('');
  });

  it('returns error response when AI client throws', async () => {
    const errorClient = createMockAIClient({
      query: vi.fn().mockRejectedValue(new Error('Network failure')),
    });

    handler = createAIQueryHandler(errorClient);

    const request = {
      prompt: 'test',
      taskType: 'general' as const,
      context: [],
    };

    const result = await handler(request);

    expect(result.content).toContain('Network failure');
    expect(result.cost).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createThemeHandlers
// ---------------------------------------------------------------------------

describe('createThemeHandlers', () => {
  let handlers: ReturnType<typeof createThemeHandlers>;

  beforeEach(() => {
    handlers = createThemeHandlers();
  });

  describe('getThemes', () => {
    it('returns all available themes', () => {
      const themes = handlers.getThemes();

      expect(themes.length).toBeGreaterThan(0);
      expect(themes.some((t: Theme) => t.name === 'dracula')).toBe(true);
      expect(themes.some((t: Theme) => t.name === 'nord')).toBe(true);
    });

    it('returns themes as readonly array', () => {
      const themes = handlers.getThemes();

      // Verify shape
      for (const theme of themes) {
        expect(theme).toHaveProperty('name');
        expect(theme).toHaveProperty('colors');
        expect(theme).toHaveProperty('opacity');
        expect(theme).toHaveProperty('blur');
      }
    });
  });

  describe('setTheme', () => {
    it('switches theme and returns the new theme', () => {
      const result = handlers.setTheme('nord');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('nord');
    });

    it('returns null for unknown theme name', () => {
      const result = handlers.setTheme('nonexistent-theme');

      expect(result).toBeNull();
    });

    it('persists theme selection across getThemes calls', () => {
      handlers.setTheme('nord');
      const activeTheme = handlers.getActiveTheme();

      expect(activeTheme.name).toBe('nord');
    });
  });

  describe('getThemeConfig', () => {
    it('returns serialized config as string', () => {
      const config = handlers.getThemeConfig();

      expect(typeof config).toBe('string');

      const parsed = JSON.parse(config);
      expect(parsed).toHaveProperty('activeTheme');
    });

    it('reflects current theme in config', () => {
      handlers.setTheme('gruvbox');
      const config = handlers.getThemeConfig();
      const parsed = JSON.parse(config);

      expect(parsed.activeTheme).toBe('gruvbox');
    });
  });
});

// ---------------------------------------------------------------------------
// createPtyBridge
// ---------------------------------------------------------------------------

describe('createPtyBridge', () => {
  let mockWindow: Electron.BrowserWindow;
  let mockPty: ReturnType<typeof createMockPty>;

  beforeEach(() => {
    mockWindow = createMockWindow();
    mockPty = createMockPty();
  });

  it('creates PTY bridge that forwards data to renderer', () => {
    let dataCallback: ((data: string) => void) | null = null;
    mockPty.onData.mockImplementation((cb: (data: string) => void) => {
      dataCallback = cb;
      return { dispose: vi.fn() };
    });

    const sessionId = 'test-session-pty';
    const bridge = createPtyBridge(mockWindow, mockPty, sessionId);

    expect(bridge).toBeDefined();
    expect(mockPty.onData).toHaveBeenCalled();

    callDataCb(dataCallback, 'some output');

    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      'session-data',
      sessionId,
      'some output',
    );
  });

  it('writes data from renderer to PTY', () => {
    const bridge = createPtyBridge(mockWindow, mockPty, 'sid');

    bridge.writeToPty('ls -la\r');

    expect(mockPty.write).toHaveBeenCalledWith('ls -la\r');
  });

  it('resizes PTY when terminal resizes', () => {
    const bridge = createPtyBridge(mockWindow, mockPty, 'sid');

    bridge.resizePty(120, 40);

    expect(mockPty.resize).toHaveBeenCalledWith(120, 40);
  });

  it('cleans up PTY on dispose', () => {
    const bridge = createPtyBridge(mockWindow, mockPty, 'sid');

    bridge.dispose();

    expect(mockPty.kill).toHaveBeenCalled();
  });

  it('does not send data to destroyed window', () => {
    let dataCallback: ((data: string) => void) | null = null;
    mockPty.onData.mockImplementation((cb: (data: string) => void) => {
      dataCallback = cb;
      return { dispose: vi.fn() };
    });

    createPtyBridge(mockWindow, mockPty, 'sid');

    // Mark window as destroyed
    (mockWindow.isDestroyed as ReturnType<typeof vi.fn>).mockReturnValue(true);

    callDataCb(dataCallback, 'should not be sent');

    expect(mockWindow.webContents.send).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// setupAllHandlers
// ---------------------------------------------------------------------------

function createMockSessionManagerRef() {
  const mockSm = {
    createSession: vi.fn(() => ({
      sessionId: 'test-session',
      pty: { pid: 12345 },
      shell: '/bin/zsh',
      cwd: '/',
    })),
    destroySession: vi.fn(() => true),
    writeToSession: vi.fn(),
    resizeSession: vi.fn(),
    getSession: vi.fn(() => ({
      cwd: '/tmp',
      pty: { pid: 1 },
    })),
    destroyAll: vi.fn(),
  };
  return { current: mockSm as never };
}

describe('setupAllHandlers', () => {
  it('registers all required IPC channels', () => {
    const mockIpc = createMockIpcMainHandle();
    const mockWindow = createMockWindow();
    const mockClient = createMockAIClient();
    const sessionRef = createMockSessionManagerRef();

    setupAllHandlers(
      mockIpc as unknown as typeof Electron.ipcMain,
      mockWindow,
      sessionRef,
      mockClient,
    );

    const registeredChannels = [...mockIpc.handlers.keys()];

    expect(registeredChannels).toContain('ai-query');
    expect(registeredChannels).toContain('ai-query-stream');
    expect(registeredChannels).toContain('get-themes');
    expect(registeredChannels).toContain('set-theme');
    expect(registeredChannels).toContain('get-theme-config');
    expect(registeredChannels).toContain('create-terminal-session');
    expect(registeredChannels).toContain('write-to-session');
    expect(registeredChannels).toContain('resize-session');
  });

  it('create-terminal-session handler is callable', async () => {
    const mockIpc = createMockIpcMainHandle();
    const mockWindow = createMockWindow();
    const mockClient = createMockAIClient();
    const sessionRef = createMockSessionManagerRef();

    setupAllHandlers(
      mockIpc as unknown as typeof Electron.ipcMain,
      mockWindow,
      sessionRef,
      mockClient,
    );

    const handler = mockIpc.getHandler('create-terminal-session');
    expect(handler).toBeDefined();
    const result = await (handler as (e: unknown, o: object) => Promise<unknown>)({}, {});
    expect(result).toMatchObject({ success: true, sessionId: 'test-session' });
  });
});

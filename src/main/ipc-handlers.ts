/*
 * Path: /Users/ghost/Desktop/aiterminal/src/main/ipc-handlers.ts
 * Module: main
 * Purpose: IPC handlers — bridges Electron renderer to PTY, AI service, and ecosystem integrations
 * Dependencies: electron, IAIClient, ThemeManager, file-tree-service, workspace-policy, cwd-probe, lossless-bridge, ecosystem-exec, kokoro-service
 * Related: /Users/ghost/Desktop/aiterminal/src/main/main.ts, /Users/ghost/Desktop/aiterminal/src/main/preload.ts, /Users/ghost/Desktop/aiterminal/src/main/terminal-session-manager.ts
 * Keywords: IPC, handlers, renderer-communication, PTY, AI, OpenRouter, theme-management, file-operations, workspace-policy, ecosystem-integrations, session-management
 * Last Updated: 2026-03-24
 */

/**
 * IPC handlers — bridges the Electron renderer to the shell (node-pty)
 * and AI service (OpenRouter).
 *
 * Each factory returns a handler or object that can be registered with
 * ipcMain. The `setupAllHandlers` function wires everything together.
 */

import type { IpcMain, BrowserWindow } from 'electron';
import type { IAIClient } from '../ai/client';
import type { AIRequest, AIResponse, ContextMessage, TaskType } from '../ai/types';
import type { CommandResult } from '../types/index';
import type { Theme, ThemeConfig } from '../themes/types';
import type { TerminalSessionManager } from './terminal-session-manager.js';
import { ThemeManager, serializeThemeConfig } from '../themes/theme-manager';
import { readDirectory, readDirectoryTree } from '../file-tree/file-tree-service';
import * as fs from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  validateWorkspacePath,
  MAX_FILE_BYTES,
} from './workspace-policy.js';
import { resolveCwdFromPid } from './cwd-probe.js';
import { runLosslessCapture } from './lossless-bridge.js';
import { execDietMcp, execFerroclaw, execSkinnytoolsWrap } from './ecosystem-exec.js';
import { kokoroTtsService } from './kokoro-service.js';

// ---------------------------------------------------------------------------
// Session manager ref (survives window recreation on macOS activate)
// ---------------------------------------------------------------------------

export interface SessionManagerRef {
  current: TerminalSessionManager | null;
}

// ---------------------------------------------------------------------------
// PTY interface (matches the subset of node-pty's IPty we use)
// ---------------------------------------------------------------------------

export interface IPtyProcess {
  readonly pid: number;
  readonly cols: number;
  readonly rows: number;
  readonly process: string;
  onData: (callback: (data: string) => void) => { dispose: () => void };
  onExit: (callback: (exitResult: { exitCode: number; signal?: number }) => void) => { dispose: () => void };
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: (signal?: string) => void;
}

// ---------------------------------------------------------------------------
// PTY bridge return type
// ---------------------------------------------------------------------------

export interface PtyBridge {
  readonly writeToPty: (data: string) => void;
  readonly resizePty: (cols: number, rows: number) => void;
  readonly dispose: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_COMMAND_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// createCommandHandler
// ---------------------------------------------------------------------------

/**
 * Creates a handler that executes a command via the PTY process,
 * captures output, and returns a CommandResult.
 *
 * The PTY's onData/onExit listeners are used to collect output and
 * detect completion. A timeout guard ensures hung commands don't
 * block the renderer forever.
 */
export function createCommandHandler(pty: IPtyProcess) {
  return (command: string, timeoutMs: number = DEFAULT_COMMAND_TIMEOUT_MS): Promise<CommandResult> => {
    return new Promise<CommandResult>((resolve) => {
      let stdout = '';
      let resolved = false;

      const cleanup = () => {
        dataDisposable.dispose();
        exitDisposable.dispose();
      };

      const dataDisposable = pty.onData((data: string) => {
        stdout += data;
      });

      const exitDisposable = pty.onExit((exitResult: { exitCode: number; signal?: number }) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        clearTimeout(timer);

        const isAITriggered = exitResult.exitCode !== 0;
        resolve({
          exitCode: exitResult.exitCode,
          stdout,
          stderr: isAITriggered ? stdout : '',
          isAITriggered,
        });
      });

      // Timeout guard
      const timer = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        cleanup();

        resolve({
          exitCode: -1,
          stdout,
          stderr: `Command timeout after ${timeoutMs}ms`,
          isAITriggered: true,
        });
      }, timeoutMs);

      // Write the command to PTY (append \r for enter key)
      pty.write(`${command}\r`);
    });
  };
}

// ---------------------------------------------------------------------------
// createAIQueryHandler
// ---------------------------------------------------------------------------

/**
 * AI query request shape from the renderer.
 */
export interface AIQueryRequest {
  readonly prompt: string;
  readonly taskType: string;
  readonly context?: ReadonlyArray<ContextMessage>;
}

/** Streaming AI query — includes correlation id for chunk events. */
export interface AIQueryStreamRequest extends AIQueryRequest {
  readonly requestId: string;
}

/**
 * Creates a handler that forwards AI queries to the OpenRouter client
 * and returns the response. Handles errors gracefully by returning
 * an error AIResponse instead of throwing.
 */
export function createAIQueryHandler(client: IAIClient) {
  return async (request: AIQueryRequest): Promise<AIResponse> => {
    try {
      const aiRequest: AIRequest = {
        prompt: request.prompt,
        taskType: request.taskType as AIRequest['taskType'],
        context: request.context ?? [],
      };

      return await client.query(aiRequest);
    } catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : 'An unknown error occurred while querying AI.';

      return {
        content: message,
        model: '',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
        cost: 0,
      };
    }
  };
}

// ---------------------------------------------------------------------------
// createThemeHandlers
// ---------------------------------------------------------------------------

/**
 * Creates theme management handlers with encapsulated state.
 *
 * The ThemeManager is immutable — each setTheme call returns a new
 * manager instance, which we swap in place.
 */
export function createThemeHandlers() {
  let themeManager = ThemeManager.create();

  return {
    getThemes: (): readonly Theme[] => {
      return themeManager.getAvailableThemes();
    },

    setTheme: (name: string): Theme | null => {
      const nextManager = themeManager.setTheme(name);
      if (nextManager === null) {
        return null;
      }
      themeManager = nextManager;
      return themeManager.getActiveTheme();
    },

    getActiveTheme: (): Theme => {
      return themeManager.getActiveTheme();
    },

    getThemeConfig: (): string => {
      const config: ThemeConfig = {
        activeTheme: themeManager.getActiveTheme().name,
        customOpacity: null,
        customBlur: null,
      };
      return serializeThemeConfig(config);
    },
  };
}

// ---------------------------------------------------------------------------
// createPtyBridge
// ---------------------------------------------------------------------------

/**
 * Creates a bidirectional bridge between the PTY process and the
 * BrowserWindow renderer.
 *
 * - PTY data is forwarded to the renderer via webContents.send('session-data', sessionId, data)
 * - The renderer writes to PTY via the returned writeToPty method
 * - Terminal resize events are forwarded to the PTY
 * - dispose() kills the PTY and cleans up listeners
 */
export function createPtyBridge(
  window: BrowserWindow,
  pty: IPtyProcess,
  sessionId: string,
): PtyBridge {
  const dataDisposable = pty.onData((data: string) => {
    if (!window.isDestroyed()) {
      // Include sessionId in the data event so renderer knows which session it belongs to
      window.webContents.send('session-data', sessionId, data);
    }
  });

  const writeToPty = (data: string): void => {
    pty.write(data);
  };

  const resizePty = (cols: number, rows: number): void => {
    pty.resize(cols, rows);
  };

  const dispose = (): void => {
    dataDisposable.dispose();
    pty.kill();
  };

  return { writeToPty, resizePty, dispose };
}

// ---------------------------------------------------------------------------
// setupAllHandlers
// ---------------------------------------------------------------------------

/**
 * Registers all IPC handlers on the given ipcMain instance.
 *
 * This is the single entry point called from main.ts to wire
 * the renderer to the shell and AI service.
 *
 * Now accepts a SessionManagerRef so handlers always use the active window's sessions.
 */
export function setupAllHandlers(
  ipc: IpcMain,
  _window: BrowserWindow,
  sessionManagerRef: SessionManagerRef,
  aiClient: IAIClient,
): void {
  const aiQueryHandler = createAIQueryHandler(aiClient);
  const themeHandlers = createThemeHandlers();
  const cancelledStreamIds = new Set<string>();

  const getSessionManager = (): TerminalSessionManager | null => sessionManagerRef.current;

  // AI queries
  ipc.handle('ai-query', (_event, request: AIQueryRequest) => {
    return aiQueryHandler(request);
  });

  ipc.handle('get-active-ai-model', (_event, taskType?: string) => {
    try {
      const tt = (taskType ?? 'general') as TaskType;
      const m = aiClient.getActiveModel(tt);
      return {
        id: m.id,
        displayName: m.name,
        presetName: aiClient.getActivePresetName(),
      };
    } catch {
      return { id: '', displayName: '', presetName: '' };
    }
  });

  ipc.handle('ai-query-stream', async (event, request: AIQueryStreamRequest) => {
    const { requestId, prompt, taskType, context } = request;
    const send = (payload: {
      requestId: string;
      chunk: string;
      done: boolean;
      error?: string;
      cancelled?: boolean;
      model?: string;
      modelLabel?: string;
    }) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('ai-stream-chunk', payload);
      }
    };

    try {
      const tt = taskType as TaskType;
      const activeModel = aiClient.getActiveModel(tt);

      const aiRequest: AIRequest = {
        prompt,
        taskType: tt,
        context: context ?? [],
      };

      for await (const chunk of aiClient.streamQuery(aiRequest)) {
        if (cancelledStreamIds.has(requestId)) {
          cancelledStreamIds.delete(requestId);
          send({ requestId, chunk: '', done: true, cancelled: true });
          return;
        }
        send({ requestId, chunk, done: false });
      }
      send({
        requestId,
        chunk: '',
        done: true,
        model: activeModel.id,
        modelLabel: activeModel.name,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Stream failed';
      send({ requestId, chunk: '', done: true, error: message });
    }
  });

  ipc.on('ai-query-stream-cancel', (_e, requestId: string) => {
    cancelledStreamIds.add(requestId);
  });

  // Theme management
  ipc.handle('get-themes', () => {
    return themeHandlers.getThemes();
  });

  ipc.handle('set-theme', (_event, name: string) => {
    return themeHandlers.setTheme(name);
  });

  ipc.handle('get-theme-config', () => {
    return themeHandlers.getThemeConfig();
  });

  // ---------------------------------------------------------------------------
  // Session management (NEW for multi-terminal support)
  // ---------------------------------------------------------------------------

  ipc.handle('create-terminal-session', (_event, options: { shell?: string; cwd?: string }) => {
    const sm = getSessionManager();
    if (!sm) {
      return { success: false, error: 'No active terminal session manager' };
    }
    const session = sm.createSession(options);
    if (!session) {
      return { success: false, error: 'Failed to create session' };
    }
    return {
      success: true,
      sessionId: session.sessionId,
      ptyPid: session.pty.pid,
      shell: session.shell,
      cwd: session.cwd,
    };
  });

  ipc.handle('destroy-terminal-session', (_event, sessionId: string) => {
    const sm = getSessionManager();
    if (!sm) {
      return { success: false };
    }
    const destroyed = sm.destroySession(sessionId);
    return { success: destroyed };
  });

  ipc.on('write-to-session', (_event, sessionId: string, data: string) => {
    getSessionManager()?.writeToSession(sessionId, data);
  });

  ipc.on('resize-session', (_event, sessionId: string, cols: number, rows: number) => {
    getSessionManager()?.resizeSession(sessionId, cols, rows);
  });

  ipc.handle('get-session-cwd', (_event, sessionId: string) => {
    const sm = getSessionManager();
    if (!sm) {
      return { success: false, error: 'No active session manager' };
    }
    const session = sm.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }
    const pid = session.pty.pid;
    const resolved = resolveCwdFromPid(pid);
    const cwd = resolved ?? session.cwd;
    if (resolved && resolved !== session.cwd) {
      sm.updateSessionCwd(sessionId, resolved);
    }
    return { success: true, cwd };
  });

  // ---------------------------------------------------------------------------
  // File operations
  // ---------------------------------------------------------------------------

  ipc.handle('read-directory', (_event, dirPath: string) => {
    const policy = validateWorkspacePath(dirPath, { forWrite: false });
    if (!policy.allowed) {
      return Promise.reject(new Error(policy.error ?? 'Path not allowed'));
    }
    return readDirectory(dirPath);
  });

  ipc.handle('read-directory-tree', (_event, dirPath: string, depth: number) => {
    const policy = validateWorkspacePath(dirPath, { forWrite: false });
    if (!policy.allowed) {
      return Promise.reject(new Error(policy.error ?? 'Path not allowed'));
    }
    return readDirectoryTree(dirPath, depth);
  });

  ipc.handle('read-file', async (_event, filePath: string) => {
    const policy = validateWorkspacePath(filePath, { forWrite: false });
    if (!policy.allowed) {
      return { content: '', size: 0, error: policy.error };
    }
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_FILE_BYTES) {
      return {
        content: '',
        size: stat.size,
        error: `File exceeds maximum read size (${MAX_FILE_BYTES} bytes)`,
      };
    }
    const content = await fs.readFile(filePath, 'utf-8');
    return { content, size: stat.size };
  });

  // Agent file operations
  ipc.handle('write-file', async (_event, filePath: string, content: string) => {
    const policy = validateWorkspacePath(filePath, {
      forWrite: true,
      contentLength: Buffer.byteLength(content, 'utf8'),
    });
    if (!policy.allowed) {
      return { success: false, error: policy.error };
    }
    try {
      const dir = dirname(filePath);
      if (dir && dir !== '.') {
        await fs.mkdir(dir, { recursive: true });
      }
      await fs.writeFile(filePath, content, 'utf-8');
      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to write file';
      return { success: false, error: message };
    }
  });

  ipc.handle('delete-file', async (_event, filePath: string) => {
    const policy = validateWorkspacePath(filePath, { forWrite: true });
    if (!policy.allowed) {
      return { success: false, error: policy.error };
    }
    try {
      await fs.unlink(filePath);
      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete file';
      return { success: false, error: message };
    }
  });

  // Autocomplete context
  ipc.handle('get-autocomplete-context', (_event, sessionId?: string) => {
    let cwd = process.cwd();
    if (sessionId) {
      const sm = getSessionManager();
      const session = sm?.getSession(sessionId);
      if (session && sm) {
        const resolved = resolveCwdFromPid(session.pty.pid);
        cwd = resolved ?? session.cwd;
        if (resolved && resolved !== session.cwd) {
          sm.updateSessionCwd(sessionId, resolved);
        }
      }
    }
    return {
      cwd,
      recentCommands: [] as readonly string[],
    };
  });

  // ---------------------------------------------------------------------------
  // Local ecosystem (dietmcp, lossless-recall, skinnytools, ferroclaw)
  // ---------------------------------------------------------------------------

  ipc.handle(
    'lossless-sync',
    async (
      _event,
      payload: {
        sessionId: string;
        messages: ReadonlyArray<{ role: string; content: string }>;
      },
    ) => {
      const mapped = payload.messages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      }));
      return runLosslessCapture(payload.sessionId, mapped);
    },
  );

  ipc.handle(
    'dietmcp-exec',
    async (_event, p: { server: string; tool: string; argsJson: string }) => {
      return execDietMcp(p.server, p.tool, p.argsJson);
    },
  );

  ipc.handle('skinnytools-wrap', async (_event, cmd: string) => {
    return execSkinnytoolsWrap(cmd);
  });

  ipc.handle('ferroclaw-exec', async (_event, goal: string) => {
    return execFerroclaw(goal);
  });

  // ---------------------------------------------------------------------------
  // Kokoro TTS (optional Python sidecar — see docs/ECOSYSTEM.md)
  // ---------------------------------------------------------------------------

  ipc.handle('kokoro-tts-status', () => kokoroTtsService.getStatus());

  ipc.handle('kokoro-tts-speak', async (_event, text: string) => {
    return kokoroTtsService.speak(typeof text === 'string' ? text : '');
  });
}

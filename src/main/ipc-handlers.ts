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
import type { FSWatcher } from 'node:fs';
import type { IAIClient } from '../ai/client';
import type { AIRequest, AIResponse, ContextMessage, TaskType } from '../ai/types';
import type { CommandResult } from '../types/index';
import type { Theme, ThemeConfig } from '../themes/types';
import type { TerminalSessionManager } from './terminal-session-manager.js';
import { ThemeManager, serializeThemeConfig } from '../themes/theme-manager';
import { readDirectory, readDirectoryTree } from '../file-tree/file-tree-service';
import * as fs from 'node:fs/promises';
import { watch, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import {
  validateWorkspacePath,
  MAX_FILE_BYTES,
} from './workspace-policy.js';
import { resolveCwdFromPid } from './cwd-probe.js';
import { runLosslessCapture } from './lossless-bridge.js';
import { execDietMcp, execFerroclaw, execSkinnytoolsWrap } from './ecosystem-exec.js';
import { kokoroTtsService } from './kokoro-service.js';
import { claudeCodeService } from './claude-code-service.js';

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
  readonly modelOverride?: string;
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

  ipc.handle('ai-set-preset', (_event, presetName: string) => {
    try {
      aiClient.setPreset(presetName);
      const m = aiClient.getActiveModel('general' as TaskType);
      return {
        success: true,
        presetName,
        activeModel: { id: m.id, displayName: m.name },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  ipc.handle('ai-get-presets', async () => {
    try {
      const { PRESETS } = await import('../ai/presets.js');
      const presets = Array.from(PRESETS.entries() as IterableIterator<[string, any]>).map(([name, preset]: [string, any]) => ({
        name,
        description: preset.description,
        models: {
          commandHelper: preset.commandHelper,
          codeExplainer: preset.codeExplainer,
          generalAssistant: preset.generalAssistant,
          errorAnalyzer: preset.errorAnalyzer,
        },
      }));
      return { success: true, presets, activePreset: aiClient.getActivePresetName() };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipc.handle('ai-query-stream', async (event, request: AIQueryStreamRequest) => {
    const { requestId, prompt, taskType, context, modelOverride } = request;
    const send = (payload: {
      requestId: string;
      chunk: string;
      done: boolean;
      error?: string;
      cancelled?: boolean;
      model?: string;
      modelLabel?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    }) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('ai-stream-chunk', payload);
      }
    };

    try {
      const tt = taskType as TaskType;

      const aiRequest: AIRequest = {
        prompt,
        taskType: tt,
        context: context ?? [],
        modelOverride,
      };

      // Resolve the actual model (may escalate for complex prompts)
      const { resolveModelForTask } = require('../ai/openrouter-client');
      const actualModelId = modelOverride ?? resolveModelForTask(tt, aiClient.getActivePresetName(), prompt);
      let actualModelLabel = actualModelId;
      try {
        const { getModel } = require('../ai/models');
        actualModelLabel = getModel(actualModelId)?.name ?? actualModelId;
      } catch { /* use raw ID */ }
      console.log(`[IPC] ai-query-stream: model=${actualModelId} (${actualModelLabel})`);

      let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;

      for await (const chunk of aiClient.streamQuery(aiRequest)) {
        if (cancelledStreamIds.has(requestId)) {
          cancelledStreamIds.delete(requestId);
          send({ requestId, chunk: '', done: true, cancelled: true });
          return;
        }
        // Check for usage sentinel from stream
        if (chunk.startsWith('\x00USAGE:')) {
          try {
            usage = JSON.parse(chunk.slice(7));
          } catch { /* ignore parse errors */ }
          continue;
        }
        send({ requestId, chunk, done: false });
      }
      send({
        requestId,
        chunk: '',
        done: true,
        model: actualModelId,
        modelLabel: actualModelLabel,
        usage,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Stream failed';
      send({ requestId, chunk: '', done: true, error: message });
    } finally {
      cancelledStreamIds.delete(requestId);
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

  // Update session cwd (called by renderer after cd command)
  ipc.on('update-session-cwd', (_event, sessionId: string, cwd: string) => {
    if (cwd && typeof cwd === 'string' && existsSync(cwd)) {
      getSessionManager()?.updateSessionCwd(sessionId, cwd);
    }
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

  // ---------------------------------------------------------------------------
  // Claude Code CLI TUI capture
  // ---------------------------------------------------------------------------

  // Track TUI capture state per session
  const tuiCaptureSessions = new Map<string, {
    buffer: string[];
    isActive: boolean;
    dataDisposable?: { dispose: () => void };
  }>();

  ipc.handle('start-tui-capture', async (_event, sessionId: string) => {
    const sm = getSessionManager();
    if (!sm) {
      return { success: false, error: 'No active session manager' };
    }

    const session = sm.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    // Initialize capture state
    tuiCaptureSessions.set(sessionId, {
      buffer: [],
      isActive: true,
    });

    // Listen to PTY data and capture it
    const dataDisposable = session.pty.onData((data: string) => {
      const capture = tuiCaptureSessions.get(sessionId);
      if (capture?.isActive) {
        capture.buffer.push(data);

        // Notify renderer of new content (debounced in real implementation)
        const fullContent = capture.buffer.join('');
        if (!_window.isDestroyed()) {
          _window.webContents.send('tui-content-updated', {
            sessionId,
            content: fullContent,
            timestamp: Date.now(),
          });
        }
      }
    });

    const capture = tuiCaptureSessions.get(sessionId);
    if (capture) {
      capture.dataDisposable = dataDisposable;
    }

    return { success: true };
  });

  ipc.handle('stop-tui-capture', async (_event, sessionId: string) => {
    const capture = tuiCaptureSessions.get(sessionId);
    if (!capture) {
      return { success: false, error: 'No active capture for session' };
    }

    // Stop capturing
    capture.isActive = false;
    capture.dataDisposable?.dispose();

    // Clear capture state
    tuiCaptureSessions.delete(sessionId);

    return { success: true };
  });

  ipc.handle('get-tui-content', async (_event, sessionId: string) => {
    const capture = tuiCaptureSessions.get(sessionId);
    if (!capture) {
      return { content: '', timestamp: 0 };
    }

    return {
      content: capture.buffer.join(''),
      timestamp: Date.now(),
    };
  });

  // ---------------------------------------------------------------------------
  // Claude Code CLI service
  // ---------------------------------------------------------------------------

  ipc.handle('claude-code-spawn', async (_event, args?: string[]) => {
    return claudeCodeService.spawn(args);
  });

  ipc.handle('claude-code-write', (_event, input: string) => {
    claudeCodeService.write(input);
  });

  ipc.handle('claude-code-kill', () => {
    claudeCodeService.kill();
  });

  ipc.handle('claude-code-is-running', () => {
    return claudeCodeService.isRunning();
  });

  // Listen to Claude Code output and forward to renderer
  claudeCodeService.onOutput((data: string) => {
    if (!_window.isDestroyed()) {
      _window.webContents.send('claude-code-output', data);
    }
  });

  claudeCodeService.onError((error: string) => {
    if (!_window.isDestroyed()) {
      _window.webContents.send('claude-code-error', error);
    }
  });

  claudeCodeService.onClose((code: number) => {
    if (!_window.isDestroyed()) {
      _window.webContents.send('claude-code-close', code);
    }
  });

  // ---------------------------------------------------------------------------
  // Claude Code log reading
  // ---------------------------------------------------------------------------

  /**
   * Find Claude Code sessions directory.
   * Checks both ~/.config/claude-code/sessions and ~/.claude-code/sessions
   */
  async function getClaudeCodeSessionsDir(): Promise<string | null> {
    const possiblePaths = [
      join(homedir(), '.config', 'claude-code', 'sessions'),
      join(homedir(), '.claude-code', 'sessions'),
    ];

    for (const dirPath of possiblePaths) {
      try {
        const stat = await fs.stat(dirPath);
        if (stat.isDirectory()) {
          return dirPath;
        }
      } catch {
        // Directory doesn't exist, continue to next option
        continue;
      }
    }

    return null;
  }

  /**
   * Read and parse JSONL session file.
   * Each line is a JSON object representing a message.
   */
  async function readSessionFile(filePath: string): Promise<any[]> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      const messages: any[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          messages.push(msg);
        } catch {
          // Skip invalid JSON lines
          continue;
        }
      }

      return messages;
    } catch {
      return [];
    }
  }

  /**
   * Get the most recent session file from the sessions directory.
   */
  async function getMostRecentSession(sessionsDir: string): Promise<string | null> {
    try {
      const files = await fs.readdir(sessionsDir);
      const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

      if (jsonlFiles.length === 0) {
        return null;
      }

      // Sort by modification time (most recent first)
      const filesWithStats = await Promise.all(
        jsonlFiles.map(async (filename) => {
          const filePath = join(sessionsDir, filename);
          const stat = await fs.stat(filePath);
          return { filePath, mtime: stat.mtimeMs };
        })
      );

      filesWithStats.sort((a, b) => b.mtime - a.mtime);
      return filesWithStats[0]?.filePath ?? null;
    } catch {
      return null;
    }
  }

  // File watcher for Claude Code session directory
  let claudeCodeWatcher: FSWatcher | null = null;

  ipc.handle('get-claude-code-log', async (_event, limit: number = 50) => {
    try {
      const sessionsDir = await getClaudeCodeSessionsDir();
      if (!sessionsDir) {
        return {
          success: false,
          error: 'Claude Code sessions directory not found',
        };
      }

      const sessionFile = await getMostRecentSession(sessionsDir);
      if (!sessionFile) {
        return {
          success: false,
          error: 'No Claude Code sessions found',
        };
      }

      const messages = await readSessionFile(sessionFile);

      // Return last N messages
      const limitedMessages = messages.slice(-limit);

      return {
        success: true,
        messages: limitedMessages,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to read Claude Code log';
      return {
        success: false,
        error: message,
      };
    }
  });

  // Setup file watcher for Claude Code session updates
  ipc.handle('start-claude-code-log-watcher', async () => {
    try {
      const sessionsDir = await getClaudeCodeSessionsDir();
      if (!sessionsDir) {
        return { success: false, error: 'Claude Code sessions directory not found' };
      }

      // Clean up existing watcher
      if (claudeCodeWatcher) {
        claudeCodeWatcher.close();
        claudeCodeWatcher = null;
      }

      // Watch for changes in the sessions directory
      claudeCodeWatcher = watch(sessionsDir, async (_eventType: string, filename: string | null) => {
        if (!filename || !filename.endsWith('.jsonl')) {
          return;
        }

        // Read the updated session file
        const sessionPath = join(sessionsDir, filename);
        const messages = await readSessionFile(sessionPath);

        // Notify renderer of update
        if (!_window.isDestroyed()) {
          _window.webContents.send('claude-code-log-updated', {
            messages,
            timestamp: Date.now(),
          });
        }
      });

      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to start watcher';
      return { success: false, error: message };
    }
  });

  ipc.handle('stop-claude-code-log-watcher', async () => {
    if (claudeCodeWatcher) {
      claudeCodeWatcher.close();
      claudeCodeWatcher = null;
    }
    return { success: true };
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  Memory system (Hermes-style persistent agent memory)
  // ═══════════════════════════════════════════════════════════════════════

  ipc.handle('memory-read', (_event, file: string) => {
    const { memoryRead } = require('./memory-store');
    return memoryRead(file);
  });

  ipc.handle('memory-read-all', () => {
    const { memoryReadAll } = require('./memory-store');
    return memoryReadAll();
  });

  ipc.handle('memory-tool', (_event, args: {
    action: string;
    file: string;
    content?: string;
    oldText?: string;
    newText?: string;
  }) => {
    const { memoryTool } = require('./memory-store');
    return memoryTool(args.action, args.file, args.content, args.oldText, args.newText);
  });

  ipc.handle('memory-format-for-prompt', () => {
    const { formatMemoryForPrompt } = require('./memory-store');
    return formatMemoryForPrompt();
  });
}

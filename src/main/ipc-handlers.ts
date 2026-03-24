/**
 * IPC handlers — bridges the Electron renderer to the shell (node-pty)
 * and AI service (OpenRouter).
 *
 * Each factory returns a handler or object that can be registered with
 * ipcMain. The `setupAllHandlers` function wires everything together.
 */

import type { IpcMain, BrowserWindow } from 'electron';
import type { IAIClient } from '@/ai/client';
import type { AIRequest, AIResponse, ContextMessage } from '@/ai/types';
import type { CommandResult } from '@/types/index';
import type { Theme, ThemeConfig } from '@/themes/types';
import { ThemeManager, serializeThemeConfig } from '@/themes/theme-manager';
import { readDirectory, readDirectoryTree } from '@/file-tree/file-tree-service';

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
 * - PTY data is forwarded to the renderer via webContents.send('pty-data', ...)
 * - The renderer writes to PTY via the returned writeToPty method
 * - Terminal resize events are forwarded to the PTY
 * - dispose() kills the PTY and cleans up listeners
 */
export function createPtyBridge(
  window: BrowserWindow,
  pty: IPtyProcess,
): PtyBridge {
  const dataDisposable = pty.onData((data: string) => {
    if (!window.isDestroyed()) {
      window.webContents.send('pty-data', data);
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
 */
export function setupAllHandlers(
  ipc: IpcMain,
  window: BrowserWindow,
  pty: IPtyProcess,
  aiClient: IAIClient,
): PtyBridge {
  const commandHandler = createCommandHandler(pty);
  const aiQueryHandler = createAIQueryHandler(aiClient);
  const themeHandlers = createThemeHandlers();
  const ptyBridge = createPtyBridge(window, pty);

  // Command execution
  ipc.handle('execute-command', (_event, command: string) => {
    return commandHandler(command);
  });

  // AI queries
  ipc.handle('ai-query', (_event, request: AIQueryRequest) => {
    return aiQueryHandler(request);
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

  // PTY data bridge (renderer → PTY)
  ipc.on('write-to-pty', (_event, data: string) => {
    ptyBridge.writeToPty(data);
  });

  ipc.on('resize-pty', (_event, cols: number, rows: number) => {
    ptyBridge.resizePty(cols, rows);
  });

  // File tree
  ipc.handle('read-directory', (_event, dirPath: string) => {
    return readDirectory(dirPath);
  });

  ipc.handle('read-directory-tree', (_event, dirPath: string, depth: number) => {
    return readDirectoryTree(dirPath, depth);
  });

  return ptyBridge;
}

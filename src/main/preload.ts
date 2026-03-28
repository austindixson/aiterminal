/*
 * Path: /Users/ghost/Desktop/aiterminal/src/main/preload.ts
 * Module: main
 * Purpose: Electron preload script — exposes typed IPC methods to renderer via contextBridge
 * Dependencies: electron (contextBridge, ipcRenderer), ../types/index
 * Related: /Users/ghost/Desktop/aiterminal/src/main/ipc-handlers.ts, /Users/ghost/Desktop/aiterminal/src/types/index.ts
 * Keywords: electron, preload, contextBridge, IPC, renderer-communication, PTY-buffering, typed-API
 * Last Updated: 2026-03-24
 */

/**
 * Preload script — exposes typed IPC methods to the renderer
 * via Electron's contextBridge.
 *
 * Every method maps to an IPC channel registered in ipc-handlers.ts.
 * The renderer accesses these via `window.electronAPI`.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../types/index.js';

// ---------------------------------------------------------------------------
// Session-specific PTY data buffering
// ---------------------------------------------------------------------------
// Each terminal session has its own data buffer and callback.
// The shell prompt arrives from PTY before xterm.js mounts and registers its
// onSessionData listener. We buffer all incoming session data and flush it
// once the renderer explicitly subscribes via onSessionData.
// ---------------------------------------------------------------------------

interface SessionBuffer {
  buffer: string[];
  callback: ((data: string) => void) | null;
}

const sessionBuffers = new Map<string, SessionBuffer>();

// Global callback for all session data (used for TUI detection, etc.)
let globalSessionCallback: ((sessionId: string, data: string) => void) | null = null;

// Listen for session-data events (new session-aware channel)
ipcRenderer.on('session-data', (_event, sessionId: string, data: string) => {
  // Call global callback first (for TUI detection, etc.)
  if (globalSessionCallback) {
    try {
      globalSessionCallback(sessionId, data);
    } catch (e) {
      console.error('[session-data] Global callback error:', e);
    }
  }

  // Then deliver to specific session callback
  const session = sessionBuffers.get(sessionId);
  if (session?.callback) {
    session.callback(data);
  } else {
    // Initialize buffer if not exists
    if (!session) {
      sessionBuffers.set(sessionId, { buffer: [], callback: null });
    }
    sessionBuffers.get(sessionId)!.buffer.push(data);
  }
});

// Listen for session lifecycle events (for cleanup)
ipcRenderer.on('session-destroyed', (_event, sessionId: string) => {
  sessionBuffers.delete(sessionId);
});

const electronAPI: ElectronAPI = {
  // --- Command execution (deprecated, use session-based API) ---
  executeCommand: (command: string) =>
    ipcRenderer.invoke('execute-command', command),

  // --- AI queries ---
  aiQuery: (request) =>
    ipcRenderer.invoke('ai-query', request),

  getActiveAiModel: (taskType?: string) =>
    ipcRenderer.invoke('get-active-ai-model', taskType),

  aiQueryStream: (request, onChunk) => {
    const requestId = globalThis.crypto.randomUUID();
    const handler = (
      _event: unknown,
      payload: {
        requestId: string;
        chunk: string;
        done: boolean;
        error?: string;
        cancelled?: boolean;
        model?: string;
        modelLabel?: string;
      },
    ) => {
      if (payload.requestId !== requestId) return;
      onChunk(payload);
    };
    ipcRenderer.on('ai-stream-chunk', handler);
    return ipcRenderer
      .invoke('ai-query-stream', { ...request, requestId })
      .finally(() => {
        ipcRenderer.removeListener('ai-stream-chunk', handler);
      });
  },

  cancelAIStream: (requestId: string) => {
    ipcRenderer.send('ai-query-stream-cancel', requestId);
  },

  onDaemonEvent: (callback) => {
    const handler = (_event: unknown, payload: unknown) => callback(payload);
    ipcRenderer.on('daemon-event', handler);
    return () => {
      ipcRenderer.removeListener('daemon-event', handler);
    };
  },

  daemonSubmitGoal: (goal: string) =>
    ipcRenderer.invoke('daemon-submit-goal', goal),

  daemonApprove: (payload) =>
    ipcRenderer.invoke('daemon-approve', payload),

  daemonReconnect: () =>
    ipcRenderer.invoke('daemon-reconnect'),

  losslessSync: (payload) => ipcRenderer.invoke('lossless-sync', payload),

  dietmcpExec: (payload) => ipcRenderer.invoke('dietmcp-exec', payload),

  skinnytoolsWrap: (command: string) =>
    ipcRenderer.invoke('skinnytools-wrap', command),

  ferroclawExec: (goal: string) => ipcRenderer.invoke('ferroclaw-exec', goal),

  kokoroTtsStatus: () => ipcRenderer.invoke('kokoro-tts-status'),

  kokoroTtsSpeak: (text: string) => ipcRenderer.invoke('kokoro-tts-speak', text),

  // --- Theme management ---
  getThemes: () =>
    ipcRenderer.invoke('get-themes'),

  setTheme: (themeName: string) =>
    ipcRenderer.invoke('set-theme', themeName),

  getThemeConfig: () =>
    ipcRenderer.invoke('get-theme-config'),

  // --- Session management (NEW for multi-terminal support) ---
  createTerminalSession: (shell?: string, cwd?: string) =>
    ipcRenderer.invoke('create-terminal-session', { shell, cwd }),

  destroyTerminalSession: (sessionId: string) =>
    ipcRenderer.invoke('destroy-terminal-session', sessionId),

  // --- Session-specific PTY operations ---
  onSessionData: (sessionId: string, callback: (data: string) => void) => {
    let session = sessionBuffers.get(sessionId);
    if (!session) {
      session = { buffer: [], callback: null };
      sessionBuffers.set(sessionId, session);
    }
    session.callback = callback;

    // Flush any buffered data
    for (const data of session.buffer) {
      callback(data);
    }
    session.buffer = [];

    // Return unsubscribe function
    return () => {
      const s = sessionBuffers.get(sessionId);
      if (s) {
        s.callback = null;
      }
    };
  },

  writeToSession: (sessionId: string, data: string) => {
    ipcRenderer.send('write-to-session', sessionId, data);
  },

  resizeSession: (sessionId: string, cols: number, rows: number) => {
    ipcRenderer.send('resize-session', sessionId, cols, rows);
  },

  getSessionCwd: (sessionId: string) =>
    ipcRenderer.invoke('get-session-cwd', sessionId),

  updateSessionCwd: (sessionId: string, cwd: string) => {
    ipcRenderer.send('update-session-cwd', sessionId, cwd);
  },

  onSessionCwdChanged: (callback: (data: { sessionId: string; cwd: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; cwd: string }) => {
      callback(data);
    };
    ipcRenderer.on('session-cwd-changed', handler);
    return () => {
      ipcRenderer.removeListener('session-cwd-changed', handler);
    };
  },

  // --- Legacy PTY bridge (deprecated, for backward compatibility) ---
  onPtyData: (callback: (data: string) => void) => {
    // Use a default session ID for legacy compatibility
    const legacySessionId = 'legacy';
    return electronAPI.onSessionData(legacySessionId, callback);
  },

  // Subscribe to all session data events across all terminals
  onAnySessionData: (callback: (sessionId: string, data: string) => void) => {
    globalSessionCallback = callback;
    return () => {
      globalSessionCallback = null;
    };
  },

  writeToPty: (data: string) => {
    // Use a default session ID for legacy compatibility
    const legacySessionId = 'legacy';
    ipcRenderer.send('write-to-session', legacySessionId, data);
  },

  resizePty: (cols: number, rows: number) => {
    // Use a default session ID for legacy compatibility
    const legacySessionId = 'legacy';
    ipcRenderer.send('resize-session', legacySessionId, cols, rows);
  },

  // --- File tree ---
  readDirectory: (dirPath: string) =>
    ipcRenderer.invoke('read-directory', dirPath),

  readDirectoryTree: (dirPath: string, depth: number) =>
    ipcRenderer.invoke('read-directory-tree', dirPath, depth),

  // --- File preview ---
  readFile: (filePath: string) =>
    ipcRenderer.invoke('read-file', filePath),

  // --- Agent file operations ---
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('write-file', filePath, content),

  deleteFile: (filePath: string) =>
    ipcRenderer.invoke('delete-file', filePath),

  // --- Autocomplete ---
  getAutocompleteContext: (sessionId?: string) =>
    ipcRenderer.invoke('get-autocomplete-context', sessionId),

  // --- Agent loop (NEW for intern system) ---
  agentStart: (payload) =>
    ipcRenderer.invoke('agent:start', payload),

  agentAbort: (payload) =>
    ipcRenderer.invoke('agent:abort', payload),

  agentStatus: () =>
    ipcRenderer.invoke('agent:status'),

  onAgentEvent: (callback: (evt: { stream: string; data: any }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, stream: string, data: any) => {
      callback({ stream, data });
    };
    ipcRenderer.on('agent:event', handler);
    return () => {
      ipcRenderer.removeListener('agent:event', handler);
    };
  },

  onAgentComplete: (callback: (data: { runId: string; result: any }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => {
      callback(data);
    };
    ipcRenderer.on('agent:complete', handler);
    return () => {
      ipcRenderer.removeListener('agent:complete', handler);
    };
  },

  onAgentError: (callback: (data: { runId: string; error: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => {
      callback(data);
    };
    ipcRenderer.on('agent:error', handler);
    return () => {
      ipcRenderer.removeListener('agent:error', handler);
    };
  },

  // --- Agent mode: update system prompt with intern identity + project context ---
  updateInternSystemPrompt: (payload: string | null | { intern: string | null; cwd?: string }) =>
    ipcRenderer.invoke('update-intern-system-prompt', payload),

  // --- Transcript search and retrieval ---
  transcriptSearch: (query: string, limit?: number) =>
    ipcRenderer.invoke('transcript:search', query, limit),

  transcriptSemanticSearch: (query: string, limit?: number) =>
    ipcRenderer.invoke('transcript:semantic-search', query, limit),

  transcriptGetSession: (sessionId: string) =>
    ipcRenderer.invoke('transcript:get-session', sessionId),

  transcriptGetRecentSessions: (limit?: number, intern?: string) =>
    ipcRenderer.invoke('transcript:get-recent-sessions', limit, intern),

  transcriptGetStats: () =>
    ipcRenderer.invoke('transcript:get-stats'),

  transcriptVacuum: () =>
    ipcRenderer.invoke('transcript:vacuum'),

  // --- Claude Code CLI TUI capture ---
  startTuiCapture: (sessionId: string) =>
    ipcRenderer.invoke('start-tui-capture', sessionId),

  stopTuiCapture: (sessionId: string) =>
    ipcRenderer.invoke('stop-tui-capture', sessionId),

  getTuiContent: (sessionId: string) =>
    ipcRenderer.invoke('get-tui-content', sessionId),

  onTuiContentUpdated: (callback: (data: { sessionId: string; content: string; timestamp: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; content: string; timestamp: number }) => {
      callback(data);
    };
    ipcRenderer.on('tui-content-updated', handler);
    return () => {
      ipcRenderer.removeListener('tui-content-updated', handler);
    };
  },

  // --- Claude Code CLI service ---
  claudeCodeSpawn: (args?: string[]) =>
    ipcRenderer.invoke('claude-code-spawn', args),

  claudeCodeWrite: (input: string) =>
    ipcRenderer.invoke('claude-code-write', input),

  claudeCodeKill: () =>
    ipcRenderer.invoke('claude-code-kill'),

  claudeCodeIsRunning: () =>
    ipcRenderer.invoke('claude-code-is-running'),

  onClaudeCodeOutput: (callback: (data: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: string) => {
      callback(data);
    };
    ipcRenderer.on('claude-code-output', handler);
    return () => {
      ipcRenderer.removeListener('claude-code-output', handler);
    };
  },

  onClaudeCodeError: (callback: (error: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, error: string) => {
      callback(error);
    };
    ipcRenderer.on('claude-code-error', handler);
    return () => {
      ipcRenderer.removeListener('claude-code-error', handler);
    };
  },

  onClaudeCodeClose: (callback: (code: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, code: number) => {
      callback(code);
    };
    ipcRenderer.on('claude-code-close', handler);
    return () => {
      ipcRenderer.removeListener('claude-code-close', handler);
    };
  },

  // --- Claude Code log reading ---
  getClaudeCodeLog: (limit?: number) =>
    ipcRenderer.invoke('get-claude-code-log', limit),

  startClaudeCodeLogWatcher: () =>
    ipcRenderer.invoke('start-claude-code-log-watcher'),

  stopClaudeCodeLogWatcher: () =>
    ipcRenderer.invoke('stop-claude-code-log-watcher'),

  onClaudeCodeLogUpdated: (callback: (data: { messages: any[]; timestamp: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { messages: any[]; timestamp: number }) => {
      callback(data);
    };
    ipcRenderer.on('claude-code-log-updated', handler);
    return () => {
      ipcRenderer.removeListener('claude-code-log-updated', handler);
    };
  },
};

// Expose environment variables from main process to renderer
// This is needed because Vite's import.meta.env only works at build time,
// not when loading from dev server in Electron renderer
const exposedEnvVars = {
  VITE_ELEVENLABS_API_KEY: process.env.VITE_ELEVENLABS_API_KEY || '',
};

console.log('[preload] Exposing env vars:', {
  hasKey: !!process.env.VITE_ELEVENLABS_API_KEY,
  keyLength: process.env.VITE_ELEVENLABS_API_KEY?.length,
  first8: process.env.VITE_ELEVENLABS_API_KEY?.substring(0, 8)
});

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
contextBridge.exposeInMainWorld('env', exposedEnvVars);
contextBridge.exposeInMainWorld('platform', process.platform);

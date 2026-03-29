/*
 * Path: /Users/ghost/Desktop/aiterminal/src/main/main.ts
 * Module: main
 * Purpose: Electron main process entry point — creates BrowserWindow, spawns PTY, initializes AI client, wires IPC
 * Dependencies: electron, node-pty, dotenv, OpenRouterClient, setupAllHandlers, TerminalSessionManager, DaemonBridge, kokoroTtsService
 * Related: /Users/ghost/Desktop/aiterminal/src/main/ipc-handlers.ts, /Users/ghost/Desktop/aiterminal/src/ai/openrouter-client.ts, /Users/ghost/Desktop/aiterminal/src/main/terminal-session-manager.ts
 * Keywords: electron, main-process, PTY, IPC, browser-window, AI-client, initialization, app-lifecycle, daemon-bridge, kokoro-tts
 * Last Updated: 2026-03-24
 */

/**
 * Electron main process — creates the BrowserWindow, spawns the PTY,
 * initializes the AI client, and wires all IPC handlers.
 */

import { config } from 'dotenv';
import { join, resolve } from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { getSuperenvPath } from '../integrations/ecosystem.js';

// Load .env from project root before anything else
// __dirname is dist/main/main/ so we go up 3 levels to project root
config({ path: join(__dirname, '../../../.env') });
const superEnv = getSuperenvPath();
console.log('[main] OPENROUTER_API_KEY after .env load:', process.env.OPENROUTER_API_KEY ? 'Set' : 'Not Set');
if (superEnv) {
  config({ path: resolve(superEnv), override: false });
}
import { OpenRouterClient } from '../ai/openrouter-client.js';
import { setupAllHandlers, type SessionManagerRef } from './ipc-handlers.js';
import { kokoroTtsService } from './kokoro-service.js';
import { TerminalSessionManager } from './terminal-session-manager.js';
import { DaemonBridge, registerDaemonIpc } from './daemon-bridge.js';
import { buildInternSystemPrompt } from '../intern-config.js';
import './agent-loop-handlers.js';
import { setAgentAIClient } from './agent-loop-handlers.js';
import './transcript-handlers.js';

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

// __dirname is available natively in CommonJS

const IS_DEV = process.env.NODE_ENV === 'development';
const DEV_SERVER_URL = 'http://localhost:5173';
// In production, __dirname is dist/main/main.js, so we need to go up to dist/ then into renderer/
const RENDERER_PATH = join(__dirname, '../../renderer/index.html');

// ---------------------------------------------------------------------------
// Project tree formatting for AI context
// ---------------------------------------------------------------------------

interface TreeEntry {
  readonly name: string;
  readonly isDirectory: boolean;
  readonly children?: ReadonlyArray<TreeEntry>;
}

function formatTreeForPrompt(entries: ReadonlyArray<TreeEntry>, indent: string = ''): string {
  const lines: string[] = [];
  for (const entry of entries) {
    const prefix = entry.isDirectory ? `${entry.name}/` : entry.name;
    lines.push(`${indent}${prefix}`);
    if (entry.isDirectory && entry.children) {
      lines.push(formatTreeForPrompt(entry.children, indent + '  '));
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// AI client configuration
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are AITerminal, an AI coding assistant embedded in a terminal emulator. You can execute commands, read files, create files, and edit files — just like Cursor or Claude Code.

SHELL COMMANDS:
Wrap commands in [RUN]command[/RUN] tags for automatic execution.
Examples: [RUN]cd ~/Desktop[/RUN], [RUN]ls -la[/RUN], [RUN]npm install express[/RUN]
Chain related commands: [RUN]mkdir -p ~/projects && cd ~/projects[/RUN]
For DESTRUCTIVE commands (rm, kill, drop), explain first — do NOT auto-execute.

FILE OPERATIONS:
You can create, edit, read, and delete files directly.

Create a new file:
[FILE:path/to/file.ts]
file content here
[/FILE]

Edit an existing file (provide complete updated content):
[EDIT:path/to/file.ts]
updated content here
[/EDIT]

Read a file to understand its contents:
[READ:path/to/file.ts]

Delete a file:
[DELETE:path/to/file.ts]

GUIDELINES:
- Use file operations proactively when the user asks you to build, fix, or modify code
- Always read relevant files before editing them
- When creating projects, create all necessary files (package.json, src/, etc.)
- The user can also attach files with @filename for you to reference
- Keep responses brief and helpful. Always finish your sentences.`;

function createAIClient(): OpenRouterClient | null {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    console.warn(
      '[main] OPENROUTER_API_KEY not set. AI features will return errors.',
    );
    return null;
  }

  return new OpenRouterClient({
    apiKey,
    baseUrl: 'https://openrouter.ai/api/v1',
    activePreset: 'balanced',
    systemPrompt: SYSTEM_PROMPT,
  });
}

const aiClient = createAIClient();

console.log('[main] AI Client:', aiClient ? 'Initialized' : 'Stubbed');

// No longer need spawnPty function — TerminalSessionManager handles PTY creation

// ---------------------------------------------------------------------------
// BrowserWindow
// ---------------------------------------------------------------------------

function createWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin';

  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    // macOS: hidden inset title bar with vibrancy glass effect
    // Windows/Linux: default title bar with solid background
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset',
          transparent: true,
          vibrancy: 'under-window',
          visualEffectState: 'active',
          backgroundColor: '#00000000',
        }
      : {
          backgroundColor: '#1e2028',
        }),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false, // Allow loading VRM from cross-origin URLs
    },
  });

  // Set CORS headers for VRM loading
  window.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Access-Control-Allow-Origin': ['*'],
      },
    });
  });

  if (IS_DEV) {
    window.loadURL(DEV_SERVER_URL);
    // Don't auto-open DevTools — use Cmd+Option+I to toggle
  } else {
    window.loadFile(RENDERER_PATH);
  }

  // Register Cmd+Option+I to toggle DevTools with terminal panel
  window.webContents.on('before-input-event', (_event, input) => {
    if (input.meta && input.alt && input.key === 'i') {
      if (window.webContents.isDevToolsOpened()) {
        window.webContents.closeDevTools();
      } else {
        // Open DevTools with terminal panel enabled
        window.webContents.openDevTools({ mode: 'bottom' });

        // Switch to terminal panel after DevTools opens
        // DevTools needs a moment to initialize, so we use a small delay
        setTimeout(() => {
          window.webContents.executeJavaScript(`
            // Try to switch to terminal panel using DevTools API
            if (typeof DevToolsAPI !== 'undefined' && DevToolsAPI.embedder) {
              DevToolsAPI.embedder.showPanel('terminal');
            }
            // Alternative: try Chrome DevTools API
            if (typeof chrome !== 'undefined' && chrome.devtools && chrome.devtools.panels) {
              chrome.devtools.panels.openResource('terminal://');
            }
          `).catch(() => {
            // Silently fail if DevTools API isn't available yet
          });
        }, 300);
      }
    }
  });

  return window;
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

const sessionManagerRef: SessionManagerRef = { current: null };
const mainWindowRef: { current: BrowserWindow | null } = { current: null };

app.whenReady().then(() => {
  const window = createWindow();
  mainWindowRef.current = window;

  const daemonBridge = new DaemonBridge();
  daemonBridge.setWindowGetter(() => mainWindowRef.current);
  registerDaemonIpc(ipcMain, daemonBridge);
  daemonBridge.connect();

  const aiClient = createAIClient();

  // Wire all IPC handlers. If no AI client is available (missing API key),
  // create a stub that returns helpful error messages.
  const client = aiClient ?? createStubAIClient();

  // Make AI client available to agent loop interns (Hana needs LLM access)
  setAgentAIClient(client);

  const sessionManager = new TerminalSessionManager(window);
  sessionManagerRef.current = sessionManager;

  // Agent mode: update system prompt with intern identity + project context
  ipcMain.handle('update-intern-system-prompt', async (_event, payload: string | null | { intern: string | null; cwd?: string }) => {
    if (!aiClient) {
      return { success: false, error: 'AI client not initialized' };
    }

    try {
      // Backward-compatible: accept plain string or { intern, cwd }
      const activeIntern = typeof payload === 'string' || payload === null
        ? payload
        : payload.intern;
      const cwd = typeof payload === 'object' && payload !== null ? payload.cwd : undefined;

      let basePrompt = buildInternSystemPrompt(activeIntern);

      // Inject project context if CWD is provided
      if (cwd) {
        try {
          const { readDirectoryTree: readTree } = await import('../file-tree/file-tree-service.js');
          const tree = await readTree(cwd, 3);
          const treeStr = formatTreeForPrompt(tree as ReadonlyArray<TreeEntry>);
          basePrompt += `\n\nWORKING DIRECTORY: ${cwd}\nPROJECT STRUCTURE:\n${treeStr}`;
        } catch {
          basePrompt += `\n\nWORKING DIRECTORY: ${cwd}`;
        }
      }

      aiClient.setSystemPrompt(basePrompt);
      console.log('[main] Updated system prompt for intern:', activeIntern, cwd ? `(cwd: ${cwd})` : '');
      return { success: true };
    } catch (error) {
      console.error('[main] Failed to update system prompt:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  setupAllHandlers(ipcMain, window, sessionManagerRef, client);

  const initialSession = sessionManager.createSession();
  if (!initialSession) {
    console.warn('[main] Failed to create initial terminal session.');
  }

  window.on('closed', () => {
    sessionManager.destroyAll();
    sessionManagerRef.current = null;
    mainWindowRef.current = null;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newWindow = createWindow();
      mainWindowRef.current = newWindow;
      const newSessionManager = new TerminalSessionManager(newWindow);
      sessionManagerRef.current = newSessionManager;

      const initialSession = newSessionManager.createSession();
      if (!initialSession) {
        console.warn('[main] Failed to create initial terminal session for new window.');
      }

      newWindow.on('closed', () => {
        newSessionManager.destroyAll();
        sessionManagerRef.current = null;
      });
    }
  });
});

app.on('before-quit', () => {
  kokoroTtsService.dispose();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ---------------------------------------------------------------------------
// Stub AI client (used when OPENROUTER_API_KEY is not set)
// ---------------------------------------------------------------------------

function createStubAIClient() {
  const noKeyMessage = 'AI features are unavailable. Set OPENROUTER_API_KEY environment variable to enable.';

  return {
    query: async () => ({
      content: noKeyMessage,
      model: '',
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      cost: 0,
    }),
    streamQuery: async function* () {
      yield noKeyMessage;
    },
    getActiveModel: () => ({
      id: '',
      name: 'None',
      provider: '',
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      maxTokens: 0,
      contextWindow: 0,
    }),
    setPreset: () => {},
    getActivePresetName: () => 'none',
  };
}

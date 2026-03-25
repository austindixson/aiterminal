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
import './agent-loop-handlers.js';
import './transcript-handlers.js';

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

// __dirname is available natively in CommonJS

const IS_DEV = process.env.NODE_ENV === 'development';
const DEV_SERVER_URL = 'http://localhost:5173';
const RENDERER_PATH = join(__dirname, '../renderer/index.html');

// ---------------------------------------------------------------------------
// AI client configuration
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are AITerminal, an AI assistant embedded in a terminal emulator on macOS (zsh).

CRITICAL RULE: When the user's intent maps to a shell command, you MUST auto-execute it.
Wrap any command you want to run in [RUN]command[/RUN] tags. The terminal will execute it automatically.

CHAINING RULE: When creating a directory, always cd into it too. When an action has a logical follow-up, chain them.

Examples:
- User: "take me to desktop" → [RUN]cd ~/Desktop[/RUN]
- User: "show my files" → [RUN]ls -la[/RUN]
- User: "what's my ip" → [RUN]curl -s ifconfig.me[/RUN]
- User: "make a folder called projects" → [RUN]mkdir -p ~/projects && cd ~/projects[/RUN]
- User: "create a new react app called myapp" → [RUN]npx create-react-app myapp && cd myapp[/RUN]
- User: "clone this repo" → [RUN]git clone <url> && cd <repo-name>[/RUN]

For DESTRUCTIVE commands (rm, kill, drop, etc.), do NOT auto-execute. Instead explain and let the user decide.

For questions/explanations that don't need a command, just respond naturally without [RUN] tags.

Be extremely concise. 1-2 sentences max unless the user asks for detail.`;

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
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (IS_DEV) {
    window.loadURL(DEV_SERVER_URL);
    // Don't auto-open DevTools — use Cmd+Option+I to toggle
  } else {
    window.loadFile(RENDERER_PATH);
  }

  // Register Cmd+Option+I to toggle DevTools (docked bottom, not detached)
  window.webContents.on('before-input-event', (_event, input) => {
    if (input.meta && input.alt && input.key === 'i') {
      if (window.webContents.isDevToolsOpened()) {
        window.webContents.closeDevTools();
      } else {
        window.webContents.openDevTools({ mode: 'bottom' });
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

  const sessionManager = new TerminalSessionManager(window);
  sessionManagerRef.current = sessionManager;

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

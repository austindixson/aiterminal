/**
 * Electron main process — creates the BrowserWindow, spawns the PTY,
 * initializes the AI client, and wires all IPC handlers.
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pty from 'node-pty';
import { OpenRouterClient } from '../ai/openrouter-client.js';
import { setupAllHandlers } from './ipc-handlers.js';
import type { PtyBridge } from './ipc-handlers.js';

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const IS_DEV = process.env.NODE_ENV === 'development';
const DEV_SERVER_URL = 'http://localhost:5173';
const RENDERER_PATH = join(__dirname, '../renderer/index.html');

// ---------------------------------------------------------------------------
// AI client configuration
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = [
  'You are AITerminal, an AI assistant embedded in a terminal emulator.',
  'You help users with shell commands, code explanations, and error diagnosis.',
  'Be concise. Prefer actionable answers. When suggesting commands, use code blocks.',
].join(' ');

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

// ---------------------------------------------------------------------------
// PTY spawn
// ---------------------------------------------------------------------------

function spawnPty(): pty.IPty {
  const shell = process.env.SHELL || '/bin/zsh';

  return pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME || '/',
    env: process.env as Record<string, string>,
  });
}

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
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    window.loadFile(RENDERER_PATH);
  }

  return window;
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

let ptyBridge: PtyBridge | null = null;

app.whenReady().then(() => {
  const window = createWindow();
  const ptyProcess = spawnPty();
  const aiClient = createAIClient();

  // Wire all IPC handlers. If no AI client is available (missing API key),
  // create a stub that returns helpful error messages.
  const client = aiClient ?? createStubAIClient();

  ptyBridge = setupAllHandlers(ipcMain, window, ptyProcess, client);

  // Clean up PTY when the window closes
  window.on('closed', () => {
    if (ptyBridge) {
      ptyBridge.dispose();
      ptyBridge = null;
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newWindow = createWindow();
      const newPty = spawnPty();
      const newClient = createAIClient() ?? createStubAIClient();

      ptyBridge = setupAllHandlers(ipcMain, newWindow, newPty, newClient);

      newWindow.on('closed', () => {
        if (ptyBridge) {
          ptyBridge.dispose();
          ptyBridge = null;
        }
      });
    }
  });
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
  };
}

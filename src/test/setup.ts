import '@testing-library/jest-dom';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock: ResizeObserver (not available in jsdom)
// ---------------------------------------------------------------------------

globalThis.ResizeObserver = class ResizeObserver {
  constructor(_callback: ResizeObserverCallback) {
    void _callback;
  }
  observe(): void { /* noop */ }
  unobserve(): void { /* noop */ }
  disconnect(): void { /* noop */ }
};

// ---------------------------------------------------------------------------
// Mock: Electron IPC (renderer-side)
// ---------------------------------------------------------------------------
// In the renderer process, Electron exposes ipcRenderer via contextBridge.
// We mock the full surface so renderer tests never reach into native code.

const ipcRenderer = {
  send: vi.fn(),
  sendSync: vi.fn(),
  invoke: vi.fn().mockResolvedValue(undefined),
  on: vi.fn().mockReturnThis(),
  once: vi.fn().mockReturnThis(),
  removeListener: vi.fn().mockReturnThis(),
  removeAllListeners: vi.fn().mockReturnThis(),
};

// Expose as `window.electron` (the typical contextBridge shape)
Object.defineProperty(globalThis, 'electron', {
  value: { ipcRenderer },
  writable: true,
});

// Also patch `require('electron')` for CJS imports in tests
vi.mock('electron', () => ({
  ipcRenderer,
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/aiterminal-test'),
    getName: vi.fn().mockReturnValue('AITerminal'),
    getVersion: vi.fn().mockReturnValue('0.1.0'),
    quit: vi.fn(),
    on: vi.fn(),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    loadURL: vi.fn(),
    on: vi.fn(),
    webContents: { send: vi.fn(), on: vi.fn() },
    show: vi.fn(),
    close: vi.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Mock: node-pty
// ---------------------------------------------------------------------------
// node-pty is a native module that won't load in jsdom. We provide a minimal
// mock that covers the IPty interface used across the codebase.

vi.mock('node-pty', () => {
  const createMockPty = () => ({
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
  });

  return {
    default: { spawn: vi.fn().mockReturnValue(createMockPty()) },
    spawn: vi.fn().mockReturnValue(createMockPty()),
  };
});

// ---------------------------------------------------------------------------
// Mock: @elevenlabs/react
// ---------------------------------------------------------------------------
// The package's internal dist graph requires BaseConversation which doesn't
// resolve in jsdom. Provide a minimal mock of the only export we use.

vi.mock('@elevenlabs/react', () => ({
  useConversation: vi.fn().mockReturnValue({
    status: 'disconnected',
    isSpeaking: false,
    startSession: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn().mockResolvedValue(undefined),
    sendUserMessage: vi.fn(),
    sendContextualUpdate: vi.fn(),
    getId: vi.fn().mockReturnValue(null),
  }),
}));

// ---------------------------------------------------------------------------
// Helpers: Mock factories (importable from setup)
// ---------------------------------------------------------------------------

/**
 * Creates a lightweight mock Terminal instance that mirrors the xterm.js
 * Terminal API surface used by AITerminal components.
 */
export function createMockTerminal() {
  return {
    cols: 80,
    rows: 24,
    options: {},
    element: document.createElement('div'),
    textarea: document.createElement('textarea'),

    open: vi.fn(),
    dispose: vi.fn(),
    focus: vi.fn(),
    blur: vi.fn(),
    clear: vi.fn(),
    reset: vi.fn(),

    write: vi.fn(),
    writeln: vi.fn(),
    paste: vi.fn(),

    onData: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    onKey: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    onLineFeed: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    onResize: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    onTitleChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),

    loadAddon: vi.fn(),

    // Selection helpers
    select: vi.fn(),
    selectAll: vi.fn(),
    getSelection: vi.fn().mockReturnValue(''),
    hasSelection: vi.fn().mockReturnValue(false),
    clearSelection: vi.fn(),
  };
}

/**
 * Creates a mock AI response object matching the AIResponse type
 * defined in src/types/index.ts.
 */
export function createMockAIResponse(overrides: Record<string, unknown> = {}) {
  return {
    content: 'This is a mock AI response.',
    model: 'gpt-4',
    tokens: 75,
    latency: 320,
    ...overrides,
  };
}

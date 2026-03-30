/*
 * Path: /Users/ghost/Desktop/aiterminal/src/main/terminal-session-manager.ts
 * Module: main
 * Purpose: Manages multiple PTY sessions for multi-terminal support with session lifecycle and CWD tracking
 * Dependencies: node:crypto, electron, node-pty, ipc-handlers
 * Related: /Users/ghost/Desktop/aiterminal/src/main/ipc-handlers.ts, /Users/ghost/Desktop/aiterminal/src/main/cwd-probe.ts
 * Keywords: PTY, session-management, multi-terminal, terminal-sessions, CWD-tracking, session-lifecycle, UUID
 * Last Updated: 2026-03-24
 */

/**
 * TerminalSessionManager — manages multiple PTY sessions for multi-terminal support.
 *
 * Each session has:
 * - sessionId: unique identifier (UUID)
 * - pty: node-pty instance
 * - ptyBridge: bridge to renderer window
 * - shell: shell path (e.g., /bin/zsh)
 * - cwd: current working directory
 * - createdAt: timestamp for session creation
 */

import { randomUUID } from 'node:crypto';
import type { BrowserWindow } from 'electron';
import type { PtyBridge } from './ipc-handlers.js';
import { createPtyBridge } from './ipc-handlers.js';
import * as pty from 'node-pty';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TerminalSession {
  readonly sessionId: string;
  readonly pty: pty.IPty;
  readonly ptyBridge: PtyBridge;
  readonly shell: string;
  cwd: string;
  readonly createdAt: number;
}

export interface CreateSessionOptions {
  readonly shell?: string;
  readonly cwd?: string;
  readonly cols?: number;
  readonly rows?: number;
}

// ---------------------------------------------------------------------------
// TerminalSessionManager
// ---------------------------------------------------------------------------

export class TerminalSessionManager {
  private sessions: Map<string, TerminalSession> = new Map();
  private window: BrowserWindow;

  constructor(window: BrowserWindow) {
    this.window = window;
  }

  /**
   * Get a session by ID. Returns undefined if not found.
   */
  getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions as a readonly array.
   */
  getAllSessions(): ReadonlyArray<TerminalSession> {
    return Array.from(this.sessions.values());
  }

  /**
   * Create a new terminal session with optional shell and cwd.
   * Returns the session object or null if creation fails.
   */
  createSession(options: CreateSessionOptions = {}): TerminalSession | null {
    const sessionId = randomUUID();
    // Cross-platform shell detection with allowlist
    const isWin = process.platform === 'win32';
    const defaultShell = isWin
      ? (process.env.COMSPEC || 'cmd.exe')
      : (process.env.SHELL || '/bin/bash');

    const ALLOWED_SHELLS = isWin
      ? new Set([
          'cmd.exe', 'powershell.exe', 'pwsh.exe',
          process.env.COMSPEC,
        ].filter(Boolean))
      : new Set([
          '/bin/bash', '/bin/zsh', '/bin/sh', '/usr/bin/bash', '/usr/bin/zsh',
          '/usr/local/bin/bash', '/usr/local/bin/zsh', '/usr/local/bin/fish',
          process.env.SHELL,
        ].filter(Boolean));

    const requestedShell = options.shell;
    // On Windows, match case-insensitively and also check basename
    const isAllowed = requestedShell
      ? isWin
        ? Array.from(ALLOWED_SHELLS).some(s =>
            s!.toLowerCase() === requestedShell.toLowerCase() ||
            s!.toLowerCase().endsWith('\\' + requestedShell.toLowerCase()))
        : ALLOWED_SHELLS.has(requestedShell)
      : false;
    const shell = isAllowed ? requestedShell! : defaultShell;
    const homeDir = process.env.HOME || process.env.USERPROFILE || (isWin ? 'C:\\' : '/');
    const cwd = options.cwd || homeDir;
    const cols = options.cols || 80;
    const rows = options.rows || 24;

    try {
      // Spawn PTY — login shell on Unix, plain shell on Windows
      const shellArgs = isWin ? [] : ['--login'];
      const ptyProcess = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          HOME: homeDir,
          USER: process.env.USER || process.env.USERNAME || '',
          PATH: process.env.PATH || '',
        } as Record<string, string>,
      });

      // Create bridge to renderer (with sessionId)
      const ptyBridge = createPtyBridge(this.window, ptyProcess, sessionId);

      const session: TerminalSession = {
        sessionId,
        pty: ptyProcess,
        ptyBridge,
        shell,
        cwd,
        createdAt: Date.now(),
      };

      this.sessions.set(sessionId, session);

      // Notify renderer of new session
      if (!this.window.isDestroyed()) {
        this.window.webContents.send('session-created', {
          sessionId,
          shell,
          cwd,
        });
      }

      return session;
    } catch (err) {
      console.error(`[TerminalSessionManager] Failed to create session:`, err);
      return null;
    }
  }

  /**
   * Destroy a session by ID. Cleans up PTY and bridge.
   * Returns true if session was found and destroyed.
   */
  destroySession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    try {
      // Dispose bridge (kills PTY and cleans up listeners)
      session.ptyBridge.dispose();

      // Remove from map
      this.sessions.delete(sessionId);

      // Notify renderer
      if (!this.window.isDestroyed()) {
        this.window.webContents.send('session-destroyed', { sessionId });
      }

      return true;
    } catch (err) {
      console.error(`[TerminalSessionManager] Failed to destroy session ${sessionId}:`, err);
      return false;
    }
  }

  /**
   * Write data to a specific session's PTY.
   * Returns true if session was found and data was written.
   */
  writeToSession(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`[TerminalSessionManager] Session ${sessionId} not found for write`);
      return false;
    }

    try {
      session.ptyBridge.writeToPty(data);
      return true;
    } catch (err) {
      console.error(`[TerminalSessionManager] Failed to write to session ${sessionId}:`, err);
      return false;
    }
  }

  /**
   * Resize a specific session's PTY.
   * Returns true if session was found and resized.
   */
  resizeSession(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`[TerminalSessionManager] Session ${sessionId} not found for resize`);
      return false;
    }

    try {
      session.ptyBridge.resizePty(cols, rows);
      return true;
    } catch (err) {
      console.error(`[TerminalSessionManager] Failed to resize session ${sessionId}:`, err);
      return false;
    }
  }

  /**
   * Update the CWD for a session. Called when `cd` command is detected.
   */
  updateSessionCwd(sessionId: string, cwd: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.cwd = cwd;

    // Notify renderer of CWD change
    if (!this.window.isDestroyed()) {
      this.window.webContents.send('session-cwd-changed', { sessionId, cwd });
    }

    return true;
  }

  /**
   * Destroy all sessions (called on app shutdown).
   */
  destroyAll(): void {
    for (const sessionId of this.sessions.keys()) {
      this.destroySession(sessionId);
    }
  }

  /**
   * Get session count.
   */
  get count(): number {
    return this.sessions.size;
  }
}

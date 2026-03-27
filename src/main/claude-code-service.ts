/*
 * Path: /Users/ghost/Desktop/aiterminal/src/main/claude-code-service.ts
 * Module: main
 * Purpose: Claude Code CLI service — spawns claude process and manages stdio communication
 * Dependencies: node:child_process, node:fs
 * Related: /Users/ghost/Desktop/aiterminal/src/main/ipc-handlers.ts, /Users/ghost/Desktop/aiterminal/src/main/preload.ts
 * Keywords: Claude Code, CLI, service, subprocess, stdio, AI-backend, process-lifecycle
 * Last Updated: 2026-03-25
 */

/**
 * Claude Code CLI service — spawns and manages a claude CLI process for use as an AI backend.
 *
 * This service provides:
 * - Process spawning with configurable args (e.g., --dangerously-skip-permissions)
 * - Bidirectional stdio streaming (stdout/stderr to renderer, stdin from user)
 * - Process lifecycle management (spawn, kill, restart)
 * - Availability detection via PATH lookup
 *
 * The service is stateless between spawns — each call to spawn() creates a fresh process.
 * Callbacks are registered once and persist across spawns (they receive output from the
 * active process, or no-op if no process is running).
 */

import { spawn, type ChildProcessWithoutNullStreams, execSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface ClaudeCodeService {
  /**
   * Spawn a claude process with optional arguments.
   * Returns true if spawned successfully, false if claude is not available.
   * @param args - Command-line arguments to pass to claude (e.g., ['--dangerously-skip-permissions'])
   */
  spawn(args?: string[]): Promise<boolean>;

  /**
   * Write input to the claude process's stdin.
   * Appends a newline automatically. No-op if no process is running.
   * @param input - User input to send to claude
   */
  write(input: string): void;

  /**
   * Terminate the claude process if running.
   * No-op if no process is running.
   */
  kill(): void;

  /**
   * Check if a claude process is currently running.
   */
  isRunning(): boolean;

  /**
   * Register a callback for stdout/stderr output from the claude process.
   * Claude Code CLI uses stderr for its main output, so both streams are merged.
   * @param callback - Function called with each data chunk (UTF-8 decoded string)
   */
  onOutput(callback: (data: string) => void): void;

  /**
   * Register a callback for process errors (e.g., spawn failure, crash).
   * @param callback - Function called with error message
   */
  onError(callback: (error: string) => void): void;

  /**
   * Register a callback for process exit.
   * @param callback - Function called with exit code (non-zero indicates crash/error)
   */
  onClose(callback: (code: number) => void): void;

  /**
   * Check if the claude command is available in PATH.
   */
  isAvailable(): boolean;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Default arguments to pass to claude when none are specified.
 * These provide a good default experience for embedded usage.
 */
const DEFAULT_CLAUDE_ARGS = ['--dangerously-skip-permissions'];

class ClaudeCodeServiceImpl implements ClaudeCodeService {
  private child: ChildProcessWithoutNullStreams | null = null;
  private outputCallback: ((data: string) => void) | null = null;
  private errorCallback: ((error: string) => void) | null = null;
  private closeCallback: ((code: number) => void) | null = null;

  /**
   * Check if claude command is available in PATH.
   * Uses 'which claude' on Unix/macOS, 'where claude' on Windows.
   */
  isAvailable(): boolean {
    try {
      const command = process.platform === 'win32' ? 'where claude' : 'which claude';
      execSync(command, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Spawn a claude process with the given arguments.
   * Returns true if successful, false if claude is not available.
   */
  async spawn(args?: string[]): Promise<boolean> {
    // Kill any existing process first
    this.kill();

    // Check if claude is available
    if (!this.isAvailable()) {
      this.errorCallback?.('claude command not found in PATH');
      return false;
    }

    const spawnArgs = args ?? DEFAULT_CLAUDE_ARGS;
    const spawnEnv = {
      ...process.env,
      // Forward CLAUDE_TOKEN if available (for authentication)
      ...(process.env.CLAUDE_TOKEN && { CLAUDE_TOKEN: process.env.CLAUDE_TOKEN }),
    };

    try {
      this.child = spawn('claude', spawnArgs, {
        env: spawnEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Handle stdout (though Claude Code CLI primarily uses stderr)
      this.child.stdout.on('data', (data: Buffer) => {
        this.outputCallback?.(data.toString('utf-8'));
      });

      // Handle stderr (Claude Code CLI's main output stream)
      this.child.stderr.on('data', (data: Buffer) => {
        this.outputCallback?.(data.toString('utf-8'));
      });

      // Handle process errors
      this.child.on('error', (err: Error) => {
        this.errorCallback?.(err.message);
        this.child = null;
      });

      // Handle process exit
      this.child.on('exit', (code: number | null) => {
        const exitCode = code ?? 0;
        this.closeCallback?.(exitCode);
        this.child = null;
      });

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.errorCallback?.(message);
      this.child = null;
      return false;
    }
  }

  /**
   * Write input to the claude process's stdin.
   * Appends a newline automatically. No-op if no process is running.
   */
  write(input: string): void {
    if (!this.child || !this.child.stdin.writable) {
      return;
    }

    try {
      this.child.stdin.write(input + '\n');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.errorCallback?.(message);
    }
  }

  /**
   * Terminate the claude process if running.
   * Attempts SIGTERM first, then SIGKILL if needed.
   */
  kill(): void {
    if (!this.child) {
      return;
    }

    try {
      // Try SIGTERM first for graceful shutdown
      this.child.kill('SIGTERM');

      // Force kill after 5 seconds if still running
      const timeout = setTimeout(() => {
        if (this.child) {
          this.child.kill('SIGKILL');
        }
      }, 5000);

      // Clear timeout if process exits gracefully
      this.child.once('exit', () => {
        clearTimeout(timeout);
      });
    } catch (error) {
      // Ignore errors during kill (process may already be dead)
    }

    this.child = null;
  }

  /**
   * Check if a claude process is currently running.
   */
  isRunning(): boolean {
    return this.child !== null && !this.child.killed;
  }

  /**
   * Register a callback for stdout/stderr output from the claude process.
   * Only one callback is supported at a time (latest registration wins).
   */
  onOutput(callback: (data: string) => void): void {
    this.outputCallback = callback;
  }

  /**
   * Register a callback for process errors.
   * Only one callback is supported at a time (latest registration wins).
   */
  onError(callback: (error: string) => void): void {
    this.errorCallback = callback;
  }

  /**
   * Register a callback for process exit.
   * Only one callback is supported at a time (latest registration wins).
   */
  onClose(callback: (code: number) => void): void {
    this.closeCallback = callback;
  }
}

// ---------------------------------------------------------------------------
// Singleton Export
// ---------------------------------------------------------------------------

/**
 * Singleton instance of the Claude Code service.
 * Import and use this directly from ipc-handlers.ts.
 */
export const claudeCodeService = new ClaudeCodeServiceImpl();

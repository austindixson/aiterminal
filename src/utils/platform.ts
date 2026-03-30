/**
 * Cross-platform utilities for Windows/macOS/Linux compatibility.
 *
 * All path, shell, and process operations that differ across platforms
 * should go through these helpers instead of inline platform checks.
 */

import { basename } from 'node:path'
import { homedir } from 'node:os'

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

export const IS_WIN = process.platform === 'win32'

// ---------------------------------------------------------------------------
// Home directory
// ---------------------------------------------------------------------------

/**
 * Returns the user's home directory, with consistent fallback logic.
 */
export function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir() || (IS_WIN ? 'C:\\' : '/')
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

/**
 * Returns the default shell for the current platform.
 */
export function getDefaultShell(): string {
  if (IS_WIN) {
    return process.env.COMSPEC || 'cmd.exe'
  }
  return process.env.SHELL || '/bin/bash'
}

/**
 * Shell allowlist — platform-conditional.
 */
export function getAllowedShells(): Set<string> {
  const shells = IS_WIN
    ? [
        'cmd.exe', 'powershell.exe', 'pwsh.exe',
        process.env.COMSPEC,
      ]
    : [
        '/bin/bash', '/bin/zsh', '/bin/sh',
        '/usr/bin/bash', '/usr/bin/zsh',
        '/usr/local/bin/bash', '/usr/local/bin/zsh', '/usr/local/bin/fish',
        process.env.SHELL,
      ]

  return new Set(shells.filter(Boolean) as string[])
}

/**
 * Check if a shell path is allowed. Case-insensitive on Windows,
 * also matches basename (e.g. "powershell.exe" matches "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe").
 */
export function isShellAllowed(shell: string): boolean {
  const allowed = getAllowedShells()
  if (allowed.has(shell)) return true

  if (IS_WIN) {
    const lower = shell.toLowerCase()
    const base = basename(lower)
    for (const a of allowed) {
      if (a.toLowerCase() === lower || basename(a.toLowerCase()) === base) return true
    }
  }

  return false
}

// ---------------------------------------------------------------------------
// Process management
// ---------------------------------------------------------------------------

/**
 * Gracefully kill a child process. On Windows, signals are not supported,
 * so we just call kill() which maps to TerminateProcess.
 * On Unix, tries SIGTERM first, then SIGKILL after a timeout.
 */
export function killProcess(
  child: { kill: (signal?: string) => boolean; once?: (event: string, cb: () => void) => void; killed?: boolean },
  gracefulTimeoutMs = 5000,
): void {
  try {
    if (IS_WIN) {
      child.kill()
    } else {
      child.kill('SIGTERM')

      if (gracefulTimeoutMs > 0 && child.once) {
        const timeout = setTimeout(() => {
          try {
            if (!child.killed) child.kill('SIGKILL')
          } catch { /* already dead */ }
        }, gracefulTimeoutMs)

        child.once('exit', () => clearTimeout(timeout))
      }
    }
  } catch {
    /* process may already be dead */
  }
}

// ---------------------------------------------------------------------------
// Path utilities (safe for renderer — uses only string ops, no node:fs)
// ---------------------------------------------------------------------------

/**
 * Extract filename from a path, handling both `/` and `\` separators.
 * Works in both main and renderer processes.
 */
export function getFileName(filePath: string): string {
  // Use both separators to handle mixed paths
  const slashIdx = filePath.lastIndexOf('/')
  const backslashIdx = filePath.lastIndexOf('\\')
  const lastSep = Math.max(slashIdx, backslashIdx)
  return lastSep === -1 ? filePath : filePath.slice(lastSep + 1)
}

/**
 * Check if a path is absolute on any platform.
 * Handles Unix `/foo` and Windows `C:\foo` or `C:/foo`.
 */
export function isAbsoluteAny(p: string): boolean {
  if (!p) return false
  // Unix absolute
  if (p.startsWith('/')) return true
  // Windows absolute: C:\ or C:/
  if (/^[A-Za-z]:[/\\]/.test(p)) return true
  // UNC path: \\server\share
  if (p.startsWith('\\\\')) return true
  return false
}

/**
 * Shorten a path for display, handling both separators.
 */
export function shortenPath(filePath: string, maxLength = 30): string {
  if (filePath.length <= maxLength) return filePath
  // Split on either separator
  const parts = filePath.split(/[/\\]/).filter(Boolean)
  if (parts.length <= 2) return filePath
  const s = filePath.includes('\\') ? '\\' : '/'
  return `...${s}${parts.slice(-2).join(s)}`
}

/**
 * Join a base path and relative path cross-platform.
 * In renderer context, use this instead of template literals with `/`.
 */
export function joinPath(base: string, relative: string): string {
  // Detect which separator the base uses
  if (base.includes('\\')) {
    return `${base.replace(/[/\\]$/, '')}\\${relative.replace(/^[/\\]/, '')}`
  }
  return `${base.replace(/\/$/, '')}/${relative.replace(/^\//, '')}`
}

// ---------------------------------------------------------------------------
// Shell command building
// ---------------------------------------------------------------------------

/**
 * Escape a string for shell argument on the current platform.
 */
export function escapeShellArg(arg: string): string {
  if (IS_WIN) {
    // cmd.exe: double-quote wrapping, escape inner double quotes
    return `"${arg.replace(/"/g, '""')}"`
  }
  // Unix: single-quote wrapping, escape inner single quotes
  return `'${arg.replace(/'/g, "'\\''")}'`
}

/**
 * Build a "cd && command" string for the current platform.
 */
export function buildCdAndRun(cwd: string, command: string): string {
  if (IS_WIN) {
    return `cd /d "${cwd}" & ${command}`
  }
  return `cd "${cwd}" && ${command}`
}

/**
 * PTY line ending for the current platform.
 */
export const PTY_NEWLINE = IS_WIN ? '\r\n' : '\r'

/*
 * Path: /Users/ghost/Desktop/aiterminal/src/main/cwd-probe.ts
 * Module: main
 * Purpose: Resolve process working directory from PID — syncs session CWD with real shell process on macOS/Linux
 * Dependencies: node:child_process, node:fs
 * Related: /Users/ghost/Desktop/aiterminal/src/main/terminal-session-manager.ts
 * Keywords: CWD, working-directory, PID, process-probe, lsof, proc-fs, shell-sync, directory-resolution, macOS, Linux
 * Last Updated: 2026-03-24
 */

/**
 * Resolve a process's current working directory from its PID (macOS / Linux).
 * Used to sync session cwd with the real shell process — in-memory cwd alone
 * does not update when the user runs `cd` in the PTY.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readlinkSync } from 'node:fs';

export function resolveCwdFromPid(pid: number): string | null {
  if (!Number.isFinite(pid) || pid <= 0) {
    return null;
  }
  try {
    if (process.platform === 'linux') {
      const link = `/proc/${pid}/cwd`;
      if (existsSync(link)) {
        return readlinkSync(link, 'utf8');
      }
      return null;
    }
    if (process.platform === 'darwin') {
      const out = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
      });
      const line = out.split('\n').find((l) => l.startsWith('n'));
      if (line && line.length > 1) {
        return line.slice(1);
      }
    }
    if (process.platform === 'win32') {
      // Use WMI via PowerShell to query process working directory
      // Note: Get-Process .Path returns the executable path, not CWD.
      // WMI Win32_Process.ExecutablePath + CommandLine can help, but
      // there's no reliable generic CWD probe on Windows. Best-effort:
      // try the undocumented .NET approach first, fall back to null.
      try {
        const out = execFileSync('powershell.exe', [
          '-NoProfile', '-Command',
          `[System.Diagnostics.Process]::GetProcessById(${pid}).StartInfo.WorkingDirectory`,
        ], {
          encoding: 'utf8',
          maxBuffer: 1024 * 1024,
          timeout: 3000,
        });
        const cwd = out.trim();
        if (cwd && cwd.length > 0 && existsSync(cwd)) {
          return cwd;
        }
      } catch {
        // StartInfo.WorkingDirectory is often empty for running processes
      }
      return null;
    }
  } catch {
    return null;
  }
  return null;
}

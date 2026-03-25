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
  } catch {
    return null;
  }
  return null;
}

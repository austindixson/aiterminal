/*
 * Path: /Users/ghost/Desktop/aiterminal/src/main/ecosystem-exec.ts
 * Module: main
 * Purpose: Sandboxed invocation of ecosystem tools — dietmcp, skinnytools, and ferroclaw with timeout and size limits
 * Dependencies: node:child_process, ../integrations/ecosystem
 * Related: /Users/ghost/Desktop/aiterminal/src/integrations/ecosystem.ts
 * Keywords: ecosystem, dietmcp, skinnytools, ferroclaw, sandboxed-execution, subprocess, timeout, size-limits, JSON-args, validation
 * Last Updated: 2026-03-24
 */

/**
 * Sandboxed invocation of dietmcp, skinnytools wrap, and optional ferroclaw exec.
 */

import { spawnSync } from 'node:child_process';
import {
  buildSkinnytoolsWrapArgs,
  getDietmcpBin,
  getFerroclawBin,
} from '../integrations/ecosystem.js';

const MAX_OUT = 512 * 1024;
const EXEC_TIMEOUT_MS = 120_000;

function safeJsonArgs(raw: string): string | null {
  try {
    JSON.parse(raw);
    return raw;
  } catch {
    return null;
  }
}

/** dietmcp exec <server> <tool> --args '<json>' */
export function execDietMcp(
  server: string,
  tool: string,
  argsJson: string,
): { ok: boolean; stdout: string; stderr: string } {
  const j = safeJsonArgs(argsJson);
  if (!j) {
    return { ok: false, stdout: '', stderr: 'args must be valid JSON' };
  }
  if (!/^[\w.-]+$/.test(server) || !/^[\w.-]+$/.test(tool)) {
    return { ok: false, stdout: '', stderr: 'invalid server or tool name' };
  }

  const bin = getDietmcpBin();
  const result = spawnSync(
    bin,
    ['exec', server, tool, '--args', j],
    {
      encoding: 'utf-8',
      maxBuffer: MAX_OUT,
      timeout: EXEC_TIMEOUT_MS,
      shell: false,
    },
  );
  const stdout = (result.stdout ?? '').slice(0, MAX_OUT);
  const stderr = (result.stderr ?? '').slice(0, MAX_OUT);
  return {
    ok: result.status === 0,
    stdout,
    stderr: stderr || (result.error instanceof Error ? result.error.message : ''),
  };
}

/** skinnytools wrap <shell command> — command must be a single line, no shell metacharacters beyond safe set */
export function execSkinnytoolsWrap(shellCommand: string): {
  ok: boolean;
  stdout: string;
  stderr: string;
} {
  const trimmed = shellCommand.trim();
  if (trimmed.length === 0 || trimmed.length > 20_000) {
    return { ok: false, stdout: '', stderr: 'invalid command length' };
  }
  if (/[;&|`$(){}]/.test(trimmed)) {
    return { ok: false, stdout: '', stderr: 'disallowed shell metacharacters' };
  }

  const { command, args } = buildSkinnytoolsWrapArgs(trimmed);
  const result = spawnSync(command, args, {
    encoding: 'utf-8',
    maxBuffer: MAX_OUT,
    timeout: EXEC_TIMEOUT_MS,
    shell: false,
  });
  const stdout = (result.stdout ?? '').slice(0, MAX_OUT);
  const stderr = (result.stderr ?? '').slice(0, MAX_OUT);
  return {
    ok: result.status === 0,
    stdout,
    stderr: stderr || (result.error instanceof Error ? result.error.message : ''),
  };
}

/** Optional: ferroclaw exec "<goal>" when AITERMINAL_FERROCLAW_BIN is set. */
export function execFerroclaw(goal: string): {
  ok: boolean;
  stdout: string;
  stderr: string;
} {
  const bin = getFerroclawBin();
  if (!bin) {
    return { ok: false, stdout: '', stderr: 'AITERMINAL_FERROCLAW_BIN not set' };
  }
  const g = goal.trim();
  if (g.length === 0 || g.length > 100_000) {
    return { ok: false, stdout: '', stderr: 'invalid goal length' };
  }
  const result = spawnSync(bin, ['exec', g], {
    encoding: 'utf-8',
    maxBuffer: MAX_OUT,
    timeout: EXEC_TIMEOUT_MS,
    shell: false,
  });
  const stdout = (result.stdout ?? '').slice(0, MAX_OUT);
  const stderr = (result.stderr ?? '').slice(0, MAX_OUT);
  return {
    ok: result.status === 0,
    stdout,
    stderr: stderr || (result.error instanceof Error ? result.error.message : ''),
  };
}

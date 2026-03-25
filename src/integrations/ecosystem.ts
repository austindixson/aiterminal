/**
 * Paths and flags for optional local tools (dietmcp, ferroclaw, lossless-claude,
 * skinnytools, superenv). All are opt-in via environment variables.
 */

import { join } from 'node:path';

function envTrim(key: string): string {
  const v = process.env[key];
  return typeof v === 'string' ? v.trim() : '';
}

/** Default: dietmcp on PATH (e.g. ~/.local/bin/dietmcp). */
export function getDietmcpBin(): string {
  return envTrim('AITERMINAL_DIETMCP_BIN') || 'dietmcp';
}

/** Repo root for lossless-claude (contains dist/capture.js). */
export function getLosslessRoot(): string {
  return (
    envTrim('AITERMINAL_LOSSLESS_ROOT') ||
    envTrim('LOSSLESS_RECALL_ROOT') ||
    ''
  );
}

export function getLosslessCaptureScript(): string {
  const root = getLosslessRoot();
  if (!root) return '';
  return join(root, 'dist', 'capture.js');
}

/** Optional ferroclaw binary for documented CLI passthrough (not auto-run). */
export function getFerroclawBin(): string {
  return envTrim('AITERMINAL_FERROCLAW_BIN');
}

/**
 * skinnytools wrap: full CLI path, or python -m skinnytools.
 */
export function buildSkinnytoolsWrapArgs(shellCommand: string): { command: string; args: string[] } {
  const bin = envTrim('AITERMINAL_SKINNYTOOLS_BIN');
  if (bin) {
    return { command: bin, args: ['wrap', shellCommand] };
  }
  const py = envTrim('AITERMINAL_SKINNYTOOLS_PYTHON') || 'python3';
  const mod = envTrim('AITERMINAL_SKINNYTOOLS_MODULE') || 'skinnytools';
  return { command: py, args: ['-m', mod, 'wrap', shellCommand] };
}

/** Optional dotenv-style file merged after project .env (superenv pattern). */
export function getSuperenvPath(): string {
  return (
    envTrim('AITERMINAL_SUPERENV_FILE') ||
    envTrim('SUPERENV_FILE') ||
    ''
  );
}

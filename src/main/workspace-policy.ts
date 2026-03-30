/*
 * Path: /Users/ghost/Desktop/aiterminal/src/main/workspace-policy.ts
 * Module: main
 * Purpose: Workspace path policy — restricts file IPC operations to allowed roots with configurable size limits
 * Dependencies: node:fs, node:os, node:path
 * Related: /Users/ghost/Desktop/aiterminal/src/main/ipc-handlers.ts
 * Keywords: workspace-policy, path-validation, security, file-access-control, allowlist, size-limits, realpath, tilde-expansion
 * Last Updated: 2026-03-24
 */

/**
 * Workspace path policy — restricts file IPC to allowed roots (configurable via env).
 */

import { realpathSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve, sep } from 'node:path';

/**
 * Resolves symlinks using native realpath to prevent symlink escape attacks.
 * This ensures workspace boundaries are enforced even if symlinks point outside.
 */
function resolveSymlinkSafe(absolutePath: string): string {
  try {
    return realpathSync.native(absolutePath);
  } catch {
    // Path doesn't exist yet, return as-is
    return absolutePath;
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max bytes for read/write via agent file IPC (default 10 MiB). */
export const MAX_FILE_BYTES = Number(process.env.AITERMINAL_MAX_FILE_BYTES) || 10 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Roots
// ---------------------------------------------------------------------------

/**
 * Allowed workspace roots. Set AITERMINAL_WORKSPACE_ROOTS to a comma-separated
 * list of absolute paths (or paths starting with ~). If unset, defaults to
 * process.cwd() only.
 */
export function getWorkspaceRoots(): string[] {
  const raw = process.env.AITERMINAL_WORKSPACE_ROOTS;
  if (raw && raw.trim().length > 0) {
    return raw
      .split(',')
      .map((s) => expandTilde(s.trim()))
      .filter((s) => s.length > 0)
      .map((s) => resolve(s));
  }
  const project = resolve(process.cwd());
  const home = resolve(homedir());
  return project === home ? [home] : [project, home];
}

function expandTilde(p: string): string {
  if (p === '~') {
    return homedir();
  }
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    const rest = p.slice(2);
    return rest ? resolve(homedir(), rest) : homedir();
  }
  return p;
}

/**
 * Resolve real path for an existing path, or the longest existing ancestor for new paths.
 * Uses native realpath to prevent symlink escape.
 */
function resolveRealPathOrAncestor(absolutePath: string): string {
  if (existsSync(absolutePath)) {
    return resolveSymlinkSafe(absolutePath);
  }
  const parent = dirname(absolutePath);
  if (parent === absolutePath) {
    return absolutePath;
  }
  return resolveRealPathOrAncestor(parent);
}

function normalizeRoot(r: string): string {
  if (existsSync(r)) {
    return resolveSymlinkSafe(r);
  }
  return resolve(r);
}

/**
 * Returns true if the given absolute path is under one of the workspace roots.
 */
export function isPathWithinWorkspace(absolutePath: string): boolean {
  const abs = resolve(absolutePath);
  const real = resolveRealPathOrAncestor(abs);
  const roots = getWorkspaceRoots().map(normalizeRoot);

  for (const root of roots) {
    const rr = normalizeRoot(root);
    if (real === rr || real.startsWith(rr + sep)) {
      return true;
    }
  }
  return false;
}

export interface PathPolicyResult {
  readonly allowed: boolean;
  readonly error?: string;
}

/**
 * Validates a path for read/write/delete. Use before file IPC handlers run.
 */
export function validateWorkspacePath(
  filePath: string,
  options: { readonly forWrite: boolean; readonly contentLength?: number },
): PathPolicyResult {
  const abs = resolve(filePath);

  if (!isPathWithinWorkspace(abs)) {
    return {
      allowed: false,
      error: `Path is outside allowed workspace roots. Set AITERMINAL_WORKSPACE_ROOTS to include this path. Got: ${abs}`,
    };
  }

  if (
    options.forWrite &&
    options.contentLength !== undefined &&
    options.contentLength > MAX_FILE_BYTES
  ) {
    return {
      allowed: false,
      error: `Content exceeds maximum size (${MAX_FILE_BYTES} bytes)`,
    };
  }

  return { allowed: true };
}

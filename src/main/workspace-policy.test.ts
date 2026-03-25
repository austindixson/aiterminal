/*
 * Path: /Users/ghost/Desktop/aiterminal/src/main/workspace-policy.test.ts
 * Module: main/test
 * Purpose: Unit tests for workspace policy — path validation, allowlist enforcement, and size limit checks
 * Dependencies: vitest, node:path, workspace-policy
 * Related: /Users/ghost/Desktop/aiterminal/src/main/workspace-policy.ts
 * Keywords: test, workspace-policy, path-validation, allowlist, security, unit-tests
 * Last Updated: 2026-03-24
 */

import { describe, it, expect, afterEach } from 'vitest';
import { resolve } from 'node:path';

describe('workspace-policy', () => {
  const prevRoots = process.env.AITERMINAL_WORKSPACE_ROOTS;

  afterEach(() => {
    if (prevRoots === undefined) {
      delete process.env.AITERMINAL_WORKSPACE_ROOTS;
    } else {
      process.env.AITERMINAL_WORKSPACE_ROOTS = prevRoots;
    }
  });

  it('allows paths under configured roots', async () => {
    const root = resolve(process.cwd(), 'src');
    process.env.AITERMINAL_WORKSPACE_ROOTS = root;
    const { validateWorkspacePath, getWorkspaceRoots } = await import('./workspace-policy.js');
    expect(getWorkspaceRoots()).toContain(root);
    const policy = validateWorkspacePath(resolve(root, 'main', 'main.ts'), { forWrite: false });
    expect(policy.allowed).toBe(true);
  });

  it('rejects paths outside roots', async () => {
    process.env.AITERMINAL_WORKSPACE_ROOTS = resolve(process.cwd(), 'src');
    const { validateWorkspacePath } = await import('./workspace-policy.js');
    const policy = validateWorkspacePath('/usr/bin', { forWrite: false });
    expect(policy.allowed).toBe(false);
  });
});

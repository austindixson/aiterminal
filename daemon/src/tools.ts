import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import type { ToolCall } from './types.js';

function assertUnderRoot(workspaceRoot: string, target: string): string {
  const abs = resolve(workspaceRoot, target);
  const rel = relative(workspaceRoot, abs);
  if (rel.startsWith('..') || rel.startsWith('/')) {
    throw new Error(`Path escapes workspace: ${target}`);
  }
  return abs;
}

export function runTool(
  workspaceRoot: string,
  call: ToolCall,
): { ok: boolean; output: string } {
  try {
    switch (call.name) {
      case 'list_dir': {
        const p = assertUnderRoot(workspaceRoot, call.args.path ?? '.');
        const names = readdirSync(p);
        return { ok: true, output: names.join('\n') };
      }
      case 'read_file': {
        const p = assertUnderRoot(workspaceRoot, call.args.path ?? '');
        const content = readFileSync(p, 'utf-8');
        return { ok: true, output: content.slice(0, 200_000) };
      }
      case 'grep': {
        const needle = call.args.pattern ?? '';
        const p = assertUnderRoot(workspaceRoot, call.args.path ?? '.');
        const content = readFileSync(p, 'utf-8');
        const lines = content.split('\n').filter((l) => l.includes(needle));
        return { ok: true, output: lines.slice(0, 500).join('\n') };
      }
      case 'write_file': {
        const p = assertUnderRoot(workspaceRoot, call.args.path ?? '');
        const dir = dirname(p);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(p, call.args.content ?? '', 'utf-8');
        return { ok: true, output: `wrote ${p}` };
      }
      case 'exec':
      case 'shell': {
        const cmd = call.args.command ?? '';
        if (!cmd) {
          return { ok: false, output: 'No command provided' };
        }
        // Execute command in workspace root with timeout
        const timeout = Number(call.args.timeout) || 30000;
        const output = execSync(cmd, {
          cwd: workspaceRoot,
          timeout,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024, // 10MB
        });
        return { ok: true, output: output.trim() };
      }
      default:
        return { ok: false, output: `unknown tool ${call.name}` };
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, output: msg };
  }
}

export function parseToolPlan(raw: string): ToolCall[] {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  try {
    const j = JSON.parse(raw.slice(start, end + 1)) as { tools?: ToolCall[] };
    return Array.isArray(j.tools) ? j.tools : [];
  } catch {
    return [];
  }
}

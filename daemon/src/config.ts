import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export const GATEWAY_DIR = join(homedir(), '.aiterminal');
export const TOKEN_FILE = join(GATEWAY_DIR, 'gateway.token');
export const QUEUE_FILE = join(GATEWAY_DIR, 'jobs.jsonl');

export const DEFAULT_PORT = Number(process.env.AITERMINAL_GATEWAY_PORT) || 47821;

export function ensureGatewayDir(): void {
  mkdirSync(GATEWAY_DIR, { recursive: true });
}

export function loadOrCreateToken(): string {
  ensureGatewayDir();
  if (existsSync(TOKEN_FILE)) {
    return readFileSync(TOKEN_FILE, 'utf-8').trim();
  }
  const token = randomBytes(32).toString('hex');
  writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
  return token;
}

export function getWorkspaceRoot(): string {
  return process.env.AITERMINAL_WORKSPACE_ROOT ?? process.cwd();
}

export function autoApproveWrites(): boolean {
  return process.env.AITERMINAL_GATEWAY_AUTO_APPROVE === '1';
}

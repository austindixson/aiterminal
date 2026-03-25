/*
 * Path: /Users/ghost/Desktop/aiterminal/src/main/lossless-bridge.ts
 * Module: main
 * Purpose: Bridge to lossless-recall — pipes chat turns into SQLite + FTS capture for persistent history
 * Dependencies: node:child_process, ../integrations/ecosystem
 * Related: /Users/ghost/Desktop/aiterminal/src/integrations/ecosystem.ts
 * Keywords: lossless-recall, SQLite, FTS, chat-history, persistence, conversation-capture, ecosystem-integration
 * Last Updated: 2026-03-24
 */

/**
 * Pipe AITerminal chat turns into lossless-recall capture (SQLite + FTS).
 * Expects AITERMINAL_LOSSLESS_ROOT pointing at a built lossless-claude repo.
 */

import { spawn } from 'node:child_process';
import { getLosslessCaptureScript } from '../integrations/ecosystem.js';

export interface LosslessChatMessage {
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
}

export function runLosslessCapture(
  sessionId: string,
  conversation: readonly LosslessChatMessage[],
): Promise<{ ok: boolean; error?: string }> {
  const script = getLosslessCaptureScript();
  if (!script) {
    return Promise.resolve({ ok: false, error: 'AITERMINAL_LOSSLESS_ROOT not set' });
  }

  const payload = JSON.stringify({
    session_id: sessionId,
    conversation: conversation.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });
    let stderr = '';
    child.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    child.on('error', (e) => {
      resolve({ ok: false, error: e instanceof Error ? e.message : String(e) });
    });
    child.on('close', (code) => {
      if (code === 0 || code === null) {
        resolve({ ok: true });
      } else {
        resolve({ ok: false, error: stderr.trim() || `exit ${code}` });
      }
    });
    child.stdin?.write(payload, 'utf-8');
    child.stdin?.end();
  });
}

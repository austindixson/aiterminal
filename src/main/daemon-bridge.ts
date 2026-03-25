/*
 * Path: /Users/ghost/Desktop/aiterminal/src/main/daemon-bridge.ts
 * Module: main
 * Purpose: TCP client to AITerminal gateway daemon — optional integration with soft failure and authentication
 * Dependencies: node:net, node:fs, node:os, node:path, electron
 * Related: /Users/ghost/Desktop/aiterminal/src/main/main.ts
 * Keywords: daemon, TCP-client, gateway, authentication, socket-connection, IPC-bridge, goal-submission, job-approval
 * Last Updated: 2026-03-24
 */

/**
 * TCP client to the AITerminal gateway daemon (optional — fails soft if down).
 */

import { createConnection, type Socket } from 'node:net';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { IpcMain, BrowserWindow } from 'electron';

const DEFAULT_PORT = Number(process.env.AITERMINAL_GATEWAY_PORT) || 47821;
const TOKEN_PATH = join(homedir(), '.aiterminal', 'gateway.token');

export class DaemonBridge {
  private socket: Socket | null = null;
  private buf = '';
  private authenticated = false;
  private pending: string[] = [];
  private windowGetter: (() => BrowserWindow | null) | null = null;

  setWindowGetter(fn: () => BrowserWindow | null): void {
    this.windowGetter = fn;
  }

  connect(): void {
    if (!existsSync(TOKEN_PATH)) {
      console.log(`[daemon-bridge] Token file not found: ${TOKEN_PATH}. Daemon connection skipped.`);
      return;
    }
    console.log(`[daemon-bridge] Attempting to connect to daemon. Token path: ${TOKEN_PATH}`);
    if (this.socket && !this.socket.destroyed) return;

    const token = readFileSync(TOKEN_PATH, 'utf-8').trim();
    const sock = createConnection({ port: DEFAULT_PORT, host: '127.0.0.1' }, () => {
      sock.write(`${JSON.stringify({ type: 'auth', token })}\n`);
    });

    this.buf = '';
    this.authenticated = false;

    sock.on('data', (chunk: Buffer) => {
      console.log('[daemon-bridge] Received data from daemon.');
      this.buf += chunk.toString('utf-8');
      let idx: number;
      while ((idx = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, idx).trim();
        this.buf = this.buf.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line) as Record<string, unknown>;
          if (msg.type === 'auth_ok') {
            this.authenticated = true;
            console.log('[daemon-bridge] Authenticated with daemon.');
            this.flushPending(sock);
            continue;
          }
          const win = this.windowGetter?.();
          if (win && !win.isDestroyed()) {
            win.webContents.send('daemon-event', msg);
          }
        } catch {
          /* ignore */
        }
      }
    });

    sock.on('error', (err) => {
      console.error('[daemon-bridge] Socket error:', err.message);
      this.socket = null;
      this.authenticated = false;
    });
    sock.on('close', () => {
      console.log('[daemon-bridge] Socket closed.');
      this.socket = null;
      this.authenticated = false;
    });
    this.socket = sock;
  }

  private flushPending(sock: Socket): void {
    while (this.pending.length > 0) {
      const line = this.pending.shift();
      if (line) sock.write(line);
    }
  }

  private enqueue(obj: Record<string, unknown>): void {
    const line = `${JSON.stringify(obj)}\n`;
    const sock = this.socket;
    if (sock && !sock.destroyed && this.authenticated) {
      console.log('[daemon-bridge] Sending message to daemon:', obj.type);
      sock.write(line);
    } else {
      console.log('[daemon-bridge] Enqueuing message (not authenticated or socket destroyed):', obj.type);
      this.pending.push(line);
      this.connect();
    }
  }

  submitGoal(goal: string): void {
    this.enqueue({ type: 'submit', goal });
  }

  approve(jobId: string, stepId: string, approved: boolean): void {
    this.enqueue({ type: 'approve', jobId, stepId, approved });
  }

  ping(): void {
    this.enqueue({ type: 'ping' });
  }
}

export function registerDaemonIpc(ipc: IpcMain, bridge: DaemonBridge): void {
  ipc.handle('daemon-submit-goal', (_e, goal: string) => {
    bridge.submitGoal(goal);
    return { success: true };
  });

  ipc.handle('daemon-approve', (_e, payload: { jobId: string; stepId: string; approved: boolean }) => {
    bridge.approve(payload.jobId, payload.stepId, payload.approved);
    return { success: true };
  });

  ipc.handle('daemon-reconnect', () => {
    bridge.connect();
    return { success: true };
  });
}

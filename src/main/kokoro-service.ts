/*
 * Path: /Users/ghost/Desktop/aiterminal/src/main/kokoro-service.ts
 * Module: main
 * Purpose: Kokoro-82M TTS service — spawns Python sidecar process for text-to-speech via stdio JSON protocol
 * Dependencies: node:child_process, node:fs, node:readline, node:path, electron
 * Related: /Users/ghost/Desktop/aiterminal/scripts/kokoro-tts-stdio.py
 * Keywords: TTS, text-to-speech, Kokoro, Python-sidecar, stdio, JSON-protocol, audio, voice, subprocess, service-lifecycle
 * Last Updated: 2026-03-24
 */

/**
 * Optional Kokoro-82M TTS sidecar: spawns scripts/kokoro-tts-stdio.py and
 * exchanges newline-delimited JSON over stdio. Disabled unless AITERMINAL_KOKORO is set.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import { join, resolve } from 'node:path';
import { app } from 'electron';

export interface KokoroSpeakResult {
  readonly ok: boolean;
  readonly mimeType?: string;
  readonly dataBase64?: string;
  readonly error?: string;
}

export interface KokoroStatusResult {
  readonly configured: boolean;
  readonly scriptPath: string;
  readonly ready: boolean;
  readonly lastError?: string;
}

export function isKokoroConfigured(): boolean {
  const v = process.env.AITERMINAL_KOKORO;
  return v === '1' || v === 'true' || v === 'yes';
}

function getKokoroScriptPath(): string {
  const envPath = process.env.AITERMINAL_KOKORO_SCRIPT;
  if (envPath) {
    return resolve(envPath);
  }
  if (app.isPackaged) {
    return join(process.resourcesPath, 'scripts', 'kokoro-tts-stdio.py');
  }
  return join(__dirname, '../../../scripts/kokoro-tts-stdio.py');
}

function getPythonBinary(): string {
  return process.env.AITERMINAL_KOKORO_PYTHON || 'python3';
}

export class KokoroTtsService {
  private child: ChildProcessWithoutNullStreams | null = null;
  private rl: ReadlineInterface | null = null;
  private lineWaiters: Array<(line: string) => void> = [];
  private ready = false;
  private starting: Promise<void> | null = null;
  private lastError: string | undefined;

  getStatus(): KokoroStatusResult {
    const scriptPath = getKokoroScriptPath();
    return {
      configured: isKokoroConfigured(),
      scriptPath,
      ready: this.ready,
      lastError: this.lastError,
    };
  }

  private reset(): void {
    this.ready = false;
    this.lineWaiters = [];
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    if (this.child) {
      try {
        this.child.kill('SIGTERM');
      } catch {
        /* noop */
      }
      this.child = null;
    }
  }

  private waitForLine(): Promise<string> {
    return new Promise((resolve, reject) => {
      let fn: (line: string) => void;
      const t = setTimeout(() => {
        const idx = this.lineWaiters.indexOf(fn);
        if (idx >= 0) this.lineWaiters.splice(idx, 1);
        reject(new Error('Kokoro response timeout'));
      }, 120_000);
      fn = (line: string) => {
        clearTimeout(t);
        resolve(line);
      };
      this.lineWaiters.push(fn);
    });
  }

  private attachStdout(stdout: NodeJS.ReadableStream): void {
    const rl = createInterface({ input: stdout });
    this.rl = rl;
    rl.on('line', (line) => {
      const w = this.lineWaiters.shift();
      if (w) w(line);
    });
    rl.on('close', () => {
      this.lastError = this.lastError ?? 'Kokoro process stdout closed';
      this.reset();
    });
  }

  private async ensureStarted(): Promise<void> {
    if (!isKokoroConfigured()) {
      throw new Error('Kokoro not enabled (set AITERMINAL_KOKORO=1)');
    }
    if (this.ready && this.child?.stdin.writable) return;
    if (this.starting) return this.starting;

    this.starting = (async () => {
      this.reset();
      const scriptPath = getKokoroScriptPath();
      if (!existsSync(scriptPath)) {
        throw new Error(`Kokoro script not found: ${scriptPath}`);
      }

      const python = getPythonBinary();
      const child = spawn(python, [scriptPath], {
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.child = child;

      child.stderr?.on('data', (buf: Buffer) => {
        console.warn('[kokoro]', buf.toString());
      });

      child.on('error', (err) => {
        this.lastError = err.message;
        this.reset();
      });

      child.on('exit', (code, signal) => {
        if (code !== 0 && code !== null) {
          this.lastError = `Kokoro exited with code ${code}${signal ? ` signal ${signal}` : ''}`;
        }
        this.reset();
      });

      this.attachStdout(child.stdout);

      const firstLinePromise = this.waitForLine();
      const firstLine = await firstLinePromise;
      let parsed: { ready?: boolean; error?: string };
      try {
        parsed = JSON.parse(firstLine) as { ready?: boolean; error?: string };
      } catch {
        throw new Error(`Kokoro invalid ready line: ${firstLine.slice(0, 200)}`);
      }
      if (!parsed.ready) {
        this.reset();
        throw new Error(parsed.error ?? 'Kokoro failed to load model');
      }
      this.ready = true;
      this.lastError = undefined;
    })();

    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  async speak(text: string): Promise<KokoroSpeakResult> {
    if (!isKokoroConfigured()) {
      return { ok: false, error: 'not configured' };
    }
    const trimmed = text.trim();
    if (!trimmed) {
      return { ok: false, error: 'empty text' };
    }

    try {
      await this.ensureStarted();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.lastError = msg;
      return { ok: false, error: msg };
    }

    if (!this.child?.stdin.writable) {
      return { ok: false, error: 'Kokoro stdin unavailable' };
    }

    try {
      const linePromise = this.waitForLine();
      this.child.stdin.write(`${JSON.stringify({ text: trimmed })}\n`);
      const responseLine = await linePromise;
      const parsed = JSON.parse(responseLine) as KokoroSpeakResult;
      if (parsed.ok && parsed.mimeType && parsed.dataBase64) {
        return parsed;
      }
      return {
        ok: false,
        error: typeof parsed.error === 'string' ? parsed.error : 'Kokoro generation failed',
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.lastError = msg;
      this.reset();
      return { ok: false, error: msg };
    }
  }

  dispose(): void {
    this.reset();
  }
}

export const kokoroTtsService = new KokoroTtsService();

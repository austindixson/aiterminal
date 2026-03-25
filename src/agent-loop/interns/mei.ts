/*
 * Path: /Users/ghost/Desktop/aiterminal/src/agent-loop/interns/mei.ts
 * Module: agent-loop/interns
 * Purpose: Mei (Dev) intern - spawns coding agents (Claude Code/codex) via background process
 * Dependencies: node:child_process, ../intern-session, ../../integrations/ecosystem
 * Related: /Users/ghost/Desktop/aiterminal/src/agent-loop/intern-session.ts
 * Keywords: mei, dev-intern, coding-agent, claude-code, codex, tdd
 * Last Updated: 2026-03-24
 */

import { spawn } from 'node:child_process';
import type { AgentEvent } from '../events.js';
import type { InternResult, InternSessionConfig } from '../intern-session.js';
import { BaseInternSession, createInternSession } from '../intern-session.js';
import { getDietmcpBin } from '../../integrations/ecosystem.js';

// Reserved for future multi-agent support
// interface CodingAgent {
//   name: string;
//   command: string;
//   needsPty: boolean;
//   detectCmd: string;
// }

/**
 * Mei intern session.
 * Spawns a background coding agent (claude/codex) and monitors execution.
 */
class MeiInternSession extends BaseInternSession {
  private childProcess?: ReturnType<typeof spawn>;

  async execute(): Promise<InternResult> {
    const task = this.injectHandoffContext(this.config.task);

    // Detect which coding agent to use
    const agentChoice = this.detectCodingAgent();

    // Build command based on agent
    const command = this.buildCommand(agentChoice, task);

    this.emit('event', {
      stream: 'lifecycle',
      data: {
        phase: 'start',
        runId: this.config.runId,
        sessionId: this.config.sessionId,
        intern: 'mei',
        startedAt: Date.now()
      }
    } as AgentEvent);

    // Spawn via dietmcp (bash tool)
    const dietmcpBin = getDietmcpBin();
    if (!dietmcpBin) {
      throw new Error('AITERMINAL_DIETMCP_BIN not set - required for Mei intern');
    }

    const args = JSON.stringify({
      command,
      pty: agentChoice !== 'claude', // Claude Code doesn't need PTY
      workdir: this.config.workspace,
      background: true,
      timeout: this.config.timeout
    });

    this.childProcess = spawn(dietmcpBin, ['exec', 'bash', '--args', args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });

    let outputBuffer = '';
    let hasOutput = false;

    // Handle stdout (streaming output)
    this.childProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      outputBuffer += text;
      hasOutput = true;

      this.emit('event', {
        stream: 'assistant',
        data: {
          runId: this.config.runId,
          intern: 'mei',
          text: outputBuffer,
          delta: text,
          timestamp: Date.now()
        }
      } as AgentEvent);

      this.addMessage('assistant', text);
    });

    // Handle stderr (errors)
    this.childProcess.stderr?.on('data', (data: Buffer) => {
      const error = data.toString();

      this.emit('event', {
        stream: 'error',
        data: {
          runId: this.config.runId,
          error,
          phase: 'execution',
          recoverable: true,
          timestamp: Date.now()
        }
      } as AgentEvent);
    });

    // Wait for completion
    return new Promise((resolve, reject) => {
      this.childProcess?.on('close', (code) => {
        if (code === 0 || code === null) {
          if (!hasOutput) {
            // No output but succeeded - might be a silent agent
            this.emit('event', {
              stream: 'assistant',
              data: {
                runId: this.config.runId,
                intern: 'mei',
                text: '[Mei completed with no output]',
                delta: '[Mei completed with no output]',
                timestamp: Date.now()
              }
            } as AgentEvent);
          }
          resolve(this.getResult());
        } else {
          reject(new Error(`Mei intern exited with code ${code}`));
        }
      });

      this.childProcess?.on('error', (err) => {
        reject(new Error(`Failed to spawn coding agent: ${err.message}`));
      });
    });
  }

  /**
   * Detect which coding agent to use.
   * Auto-detects available agents and picks the best one.
   */
  private detectCodingAgent(): string {
    const defaultAgent = process.env.AITERMINAL_DEFAULT_CODING_AGENT || 'claude';
    return defaultAgent;
  }

  /**
   * Build command for the coding agent.
   */
  private buildCommand(agent: string, task: string): string {
    const escapedTask = task.replace(/'/g, "'\\''");

    switch (agent) {
      case 'claude':
        // Claude Code: --print --permission-mode bypassPermissions
        return `cd "${this.config.workspace}" && claude --permission-mode bypassPermissions --print '${escapedTask}'`;

      case 'codex':
        // Codex: needs PTY, exec mode
        return `cd "${this.config.workspace}" && codex exec --full-auto '${escapedTask}'`;

      case 'pi':
        // Pi coding agent
        return `cd "${this.config.workspace}" && pi -p '${escapedTask}'`;

      default:
        throw new Error(`Unknown coding agent: ${agent}`);
    }
  }

  async close(): Promise<void> {
    if (this.childProcess) {
      this.childProcess.kill();
    }
    this.removeAllListeners();
  }
}

/**
 * Spawn Mei intern session.
 */
export async function spawnMeiIntern(
  config: InternSessionConfig
): Promise<ReturnType<typeof createInternSession>> {
  const session = new MeiInternSession(config);
  const sessionWrapper = createInternSession(session);

  // Start execution in background
  session.execute().catch(err => {
    session.emit('event', {
      stream: 'error',
      data: {
        runId: config.runId,
        error: err.message,
        phase: 'execution',
        recoverable: false,
        timestamp: Date.now()
      }
    } as AgentEvent);
  });

  return sessionWrapper;
}

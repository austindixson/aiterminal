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
import { IS_WIN, escapeShellArg, buildCdAndRun } from '../../utils/platform.js';

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

    // Spawn via dietmcp (bash tool) if available, else fallback to aiQuery
    const dietmcpBin = getDietmcpBin();

    if (!dietmcpBin) {
      // Fallback: use aiQuery for code generation (no external agent)
      if (!this.config.aiQuery) {
        throw new Error('Mei requires either AITERMINAL_DIETMCP_BIN or an aiQuery function');
      }

      this.emit('event', {
        stream: 'tool',
        data: {
          runId: this.config.runId,
          toolName: 'llm_code_gen',
          status: 'start',
          input: { task },
          timestamp: Date.now()
        }
      } as AgentEvent);

      const codePrompt = `You are Mei, a senior developer intern. Complete this coding task in the workspace "${this.config.workspace}".

TASK: ${task}

Respond with file operations using these tags:
[FILE:path]content[/FILE] — create a new file
[EDIT:path]content[/EDIT] — replace a file's content
[RUN]command[/RUN] — suggest a shell command
[READ:path] — read a file for context

Always explain what you're doing briefly, then provide the file operations.`;

      const result = await this.config.aiQuery(codePrompt);

      this.emit('event', {
        stream: 'tool',
        data: {
          runId: this.config.runId,
          toolName: 'llm_code_gen',
          status: 'end',
          timestamp: Date.now()
        }
      } as AgentEvent);

      this.emit('event', {
        stream: 'assistant',
        data: {
          runId: this.config.runId,
          intern: 'mei',
          text: result,
          delta: result,
          timestamp: Date.now()
        }
      } as AgentEvent);

      this.addMessage('assistant', result);
      return this.getResult();
    }

    // Primary path: spawn external coding agent via dietmcp
    const args = JSON.stringify({
      command,
      pty: agentChoice !== 'claude',
      workdir: this.config.workspace,
      background: true,
      timeout: this.config.timeout
    });

    const shellTool = IS_WIN ? 'powershell' : 'bash';
    this.childProcess = spawn(dietmcpBin, ['exec', shellTool, '--args', args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });

    let outputBuffer = '';
    let hasOutput = false;

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

    return new Promise((resolve, reject) => {
      this.childProcess?.on('close', (code) => {
        if (code === 0 || code === null) {
          if (!hasOutput) {
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
    const escaped = escapeShellArg(task);

    switch (agent) {
      case 'claude':
        return buildCdAndRun(this.config.workspace, `claude --permission-mode bypassPermissions --print ${escaped}`);

      case 'codex':
        return buildCdAndRun(this.config.workspace, `codex exec --full-auto ${escaped}`);

      case 'pi':
        return buildCdAndRun(this.config.workspace, `pi -p ${escaped}`);

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

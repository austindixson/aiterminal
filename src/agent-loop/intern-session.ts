/*
 * Path: /Users/ghost/Desktop/aiterminal/src/agent-loop/intern-session.ts
 * Module: agent-loop
 * Purpose: Session management for intern execution - spawn, monitor, aggregate results
 * Dependencies: node:events, node:child_process, ./events
 * Related: /Users/ghost/Desktop/aiterminal/src/agent-loop/router.ts
 * Keywords: intern-session, session-management, process-spawning, stream-aggregation
 * Last Updated: 2026-03-24
 */

import { EventEmitter } from 'node:events';
import type { AgentEvent, AgentMessage, HandoffContext } from './events.js';

/**
 * Configuration for spawning an intern session.
 */
export interface InternSessionConfig {
  intern: 'mei' | 'sora' | 'hana';
  task: string;
  workspace: string;
  timeout: number;
  transcriptDb?: string;
  abortSignal?: AbortSignal;
  runId: string;
  sessionId: string;
  contextFromHandoff?: HandoffContext;
  /** Optional AI query function for interns that need LLM access */
  aiQuery?: (prompt: string) => Promise<string>;
}

/**
 * Result from an intern session.
 */
export interface InternResult {
  intern: string;
  messages: AgentMessage[];
  metadata: Record<string, unknown>;
  output: string;
  status: 'completed' | 'failed' | 'timeout';
}

/**
 * Abstract base class for intern sessions.
 */
export abstract class BaseInternSession extends EventEmitter {
  protected config: InternSessionConfig;
  protected messages: AgentMessage[] = [];
  protected startTime: number = Date.now();
  protected aborted: boolean = false;

  constructor(config: InternSessionConfig) {
    super();
    this.config = config;
  }

  abstract execute(): Promise<InternResult>;

  /**
   * Inject context from a previous intern (handoff).
   */
  protected injectHandoffContext(task: string): string {
    if (!this.config.contextFromHandoff) {
      return task;
    }

    const { findings, sources, fromIntern } = this.config.contextFromHandoff;

    let contextHeader = `## Context from ${fromIntern}\n\n`;

    if (sources && sources.length > 0) {
      contextHeader += `Sources:\n${sources.map(s => `- ${s}`).join('\n')}\n\n`;
    }

    contextHeader += `Key Findings:\n`;
    for (const [key, value] of Object.entries(findings)) {
      contextHeader += `- ${key}: ${JSON.stringify(value)}\n`;
    }

    contextHeader += `\n---\n\n`;

    return contextHeader + task;
  }

  /**
   * Add a message to the transcript.
   */
  protected addMessage(role: AgentMessage['role'], content: string, metadata?: Record<string, unknown>): void {
    const message: AgentMessage = {
      role,
      content,
      timestamp: Date.now(),
      metadata
    };
    this.messages.push(message);
  }

  /**
   * Get final result.
   */
  getResult(): InternResult {
    return {
      intern: this.config.intern,
      messages: this.messages,
      metadata: {
        workspace: this.config.workspace,
        durationMs: Date.now() - this.startTime,
        runId: this.config.runId
      },
      output: this.messages
        .filter(m => m.role === 'assistant')
        .map(m => m.content)
        .join('\n'),
      status: this.aborted ? 'timeout' : 'completed'
    };
  }
}

/**
 * Intern session factory.
 */
export async function spawnInternSession(
  config: InternSessionConfig
): Promise<InternSession> {
  // Ensure workspace exists
  await ensureInternWorkspace(config.intern, config.workspace);

  // Lazy load intern implementations to avoid circular dependency
  const { spawnMeiIntern } = await import('./interns/mei.js');
  const { spawnSoraIntern } = await import('./interns/sora.js');
  const { spawnHanaIntern } = await import('./interns/hana.js');

  // Spawn based on intern type
  switch (config.intern) {
    case 'mei':
      return await spawnMeiIntern(config);
    case 'sora':
      return await spawnSoraIntern(config);
    case 'hana':
      return await spawnHanaIntern(config);
    default:
      throw new Error(`Unknown intern: ${config.intern}`);
  }
}

/**
 * Ensure intern workspace exists.
 */
async function ensureInternWorkspace(
  _intern: string,
  workspacePath: string
): Promise<void> {
  const fs = await import('node:fs/promises');
  try {
    await fs.mkdir(workspacePath, { recursive: true });
  } catch {
    // Ignore if already exists
  }
}

// Remove duplicate exports (already exported from index.ts)
// export type { InternSessionConfig, InternResult };

/**
 * Public interface for intern session.
 */
export interface InternSession {
  stream(): AsyncIterable<AgentEvent>;
  result(): Promise<InternResult>;
  close(): Promise<void>;
}

/**
 * Create intern session from internal implementation.
 */
export function createInternSession(
  session: BaseInternSession
): InternSession {
  return {
    async *stream(): AsyncIterable<AgentEvent> {
      // Stream events from the session
      const events: AgentEvent[] = [];
      const eventHandler = (evt: AgentEvent) => {
        events.push(evt);
      };
      session.on('event', eventHandler);

      try {
        while (true) {
          if (events.length === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
            continue;
          }
          yield events.shift()!;
        }
      } finally {
        session.off('event', eventHandler);
      }
    },

    async result(): Promise<InternResult> {
      return session.getResult();
    },

    async close(): Promise<void> {
      session.removeAllListeners();
    }
  };
}

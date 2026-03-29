/*
 * Path: /Users/ghost/Desktop/aiterminal/src/agent-loop/events.ts
 * Module: agent-loop
 * Purpose: Unified event stream types for agent loop (lifecycle, tool, assistant, handoff)
 * Dependencies: none
 * Related: /Users/ghost/Desktop/aiterminal/src/agent-loop/router.ts, /Users/ghost/Desktop/aiterminal/src/agent-loop/intern-session.ts
 * Keywords: agent-events, event-streams, lifecycle, tool-events, handoff-protocol
 * Last Updated: 2026-03-24
 */

/**
 * Event streams emitted by the agent loop.
 * Modeled after OpenClaw's agent loop event system.
 */

/**
 * Event types emitted during agent execution.
 */
export type AgentEvent =
  | LifecycleEvent
  | ToolEvent
  | AssistantEvent
  | HandoffEvent
  | ErrorEvent;

/**
 * Lifecycle events track agent phase transitions.
 * Stream: 'lifecycle'
 */
export interface LifecycleEvent {
  stream: 'lifecycle';
  data: {
    phase: 'start' | 'end' | 'error';
    runId: string;
    sessionId: string;
    intern?: string;
    startedAt?: number;
    endedAt?: number;
    error?: string;
    stopReason?: string;
  };
}

/**
 * Tool events track tool execution (for Mei/Claude Code).
 * Stream: 'tool'
 */
export interface ToolEvent {
  stream: 'tool';
  data: {
    runId: string;
    toolName: string;
    status: 'start' | 'update' | 'end' | 'error';
    input?: Record<string, unknown>;
    output?: string | Record<string, unknown>;
    error?: string;
    timestamp: number;
  };
}

/**
 * Assistant events stream text deltas from the LLM.
 * Stream: 'assistant'
 */
export interface AssistantEvent {
  stream: 'assistant';
  data: {
    runId: string;
    intern: string;
    text: string;
    delta: string; // Only the new text since last event
    timestamp: number;
  };
}

/**
 * Handoff events signal intern chaining.
 * Stream: 'handoff'
 */
export interface HandoffEvent {
  stream: 'handoff';
  data: {
    fromIntern: string;
    toIntern: string;
    reason: string;
    findings: Record<string, unknown>;
    sources?: string[];
    recommendedAction?: string;
    timestamp: number;
  };
}

/**
 * Error events capture failures.
 * Stream: 'error'
 */
export interface ErrorEvent {
  stream: 'error';
  data: {
    runId: string;
    error: string;
    phase?: string;
    recoverable: boolean;
    timestamp: number;
  };
}

/**
 * Task classification result.
 * Maps user input to appropriate intern.
 */
export interface TaskClassification {
  intern: 'mei' | 'sora' | 'hana';
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  suggestedChains?: ('mei' | 'sora' | 'hana')[];
}

/**
 * Agent loop configuration.
 */
export interface AgentLoopConfig {
  sessionId: string;
  runId: string;
  workspaceRoot: string;
  transcriptDb?: string;
  timeouts: {
    mei: number;
    sora: number;
    hana: number;
  };
  qualityGates: {
    requireTests: boolean;
    requireSources: boolean;
    requireReview: boolean;
  };
  /** AI query function for interns that need LLM access (e.g., Hana) */
  aiQuery?: (prompt: string) => Promise<string>;
}

/**
 * Agent loop result.
 */
export interface AgentLoopResult {
  status: 'ok' | 'failed' | 'timeout' | 'handoff';
  result?: {
    intern: string;
    messages: AgentMessage[];
    metadata: Record<string, unknown>;
    output: string;
  };
  reason?: string;
  handoffTo?: string;
}

/**
 * Message format for transcripts.
 */
export interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  tokenCount?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Handoff context passed between interns.
 */
export interface HandoffContext {
  fromIntern: string;
  toIntern: string;
  reason: string;
  findings: Record<string, unknown>;
  sources?: string[];
  recommendedAction?: string;
  previousConversationId?: number;
}

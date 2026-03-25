/*
 * Path: /Users/ghost/Desktop/aiterminal/src/agent-loop/index.ts
 * Module: agent-loop
 * Purpose: Public API for agent loop system - router, classifier, session management
 * Dependencies: ./router, ./classifier, ./events
 * Related: /Users/ghost/Desktop/aiterminal/src/agent-loop/router.ts
 * Keywords: agent-loop, exports, public-api
 * Last Updated: 2026-03-24
 */

// Core types
export type {
  AgentEvent,
  LifecycleEvent,
  ToolEvent,
  AssistantEvent,
  HandoffEvent,
  ErrorEvent,
  TaskClassification,
  AgentLoopConfig,
  AgentLoopResult,
  AgentMessage,
  HandoffContext
} from './events.js';

// Re-export for intern-session convenience
export type { InternSessionConfig, InternResult } from './intern-session.js';

// Router
export { AgentLoopRouter, getAgentLoopRouter } from './router.js';

// Classifier
export {
  classifyTask,
  shouldChainInterns,
  getNextIntern
} from './classifier.js';

// Session management
export {
  spawnInternSession,
  createInternSession
} from './intern-session.js';

// Interns
export { spawnMeiIntern } from './interns/mei.js';
export { spawnSoraIntern } from './interns/sora.js';
export { spawnHanaIntern } from './interns/hana.js';

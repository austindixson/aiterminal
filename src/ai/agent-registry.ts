/**
 * Predefined AI agent identities.
 *
 * Each agent has a unique color and icon used by the cursor overlay
 * and streaming text components to visually distinguish concurrent agents.
 */

import type { AgentIdentity } from '@/types/agent-cursor'
import type { TaskType } from '@/ai/types'

// ---------------------------------------------------------------------------
// Agent registry
// ---------------------------------------------------------------------------

export const AGENTS: ReadonlyMap<string, AgentIdentity> = new Map([
  ['debug', { id: 'debug', name: 'Debug', color: '#FF5555', icon: '\u{1F534}' }],
  ['explain', { id: 'explain', name: 'Explain', color: '#8BE9FD', icon: '\u{1F4A1}' }],
  ['fix', { id: 'fix', name: 'Fix', color: '#50FA7B', icon: '\u{1F527}' }],
  ['research', { id: 'research', name: 'Research', color: '#BD93F9', icon: '\u{1F50D}' }],
  ['general', { id: 'general', name: 'Assistant', color: '#F8F8F2', icon: '\u2728' }],
])

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Retrieve an agent by ID. Falls back to the "general" agent when the ID
 * is not recognised.
 */
export function getAgent(id: string): AgentIdentity {
  return AGENTS.get(id) ?? AGENTS.get('general')!
}

/**
 * Shorthand to get just the hex color for an agent.
 */
export function getAgentColor(id: string): string {
  return getAgent(id).color
}

// ---------------------------------------------------------------------------
// TaskType -> Agent mapping
// ---------------------------------------------------------------------------

const TASK_TYPE_TO_AGENT: Readonly<Record<TaskType, string>> = {
  command_help: 'general',
  code_explain: 'explain',
  general: 'general',
  error_analysis: 'debug',
}

/**
 * Maps a TaskType to the most appropriate agent identity.
 */
export function getAgentForTaskType(taskType: TaskType): AgentIdentity {
  const agentId = TASK_TYPE_TO_AGENT[taskType] ?? 'general'
  return getAgent(agentId)
}

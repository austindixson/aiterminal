/**
 * Typed global for agent loop state shared between App and useChat.
 * Avoids `(window as any).agentLoopState` pattern.
 */

export interface AgentLoopState {
  readonly activeIntern?: string
  readonly enabled?: boolean
  readonly cwd?: string
  readonly activeSessionId?: string
}

declare global {
  interface Window {
    agentLoopState?: AgentLoopState
  }
}

export function getAgentLoopState(): AgentLoopState {
  return window.agentLoopState ?? {}
}

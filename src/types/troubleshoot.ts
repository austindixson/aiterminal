/**
 * Types for the AI Troubleshoot Webview feature.
 *
 * These types define the shape of console entries, session context,
 * chat messages, and the overall troubleshoot panel state.
 *
 * All types are immutable (readonly) to prevent accidental mutation.
 */

export interface ConsoleEntry {
  readonly id: string
  readonly timestamp: number
  readonly type: 'command' | 'stdout' | 'stderr' | 'ai_response' | 'user_message'
  readonly content: string
  readonly exitCode?: number
  readonly metadata?: Record<string, string>
}

export interface SessionContext {
  readonly cwd: string
  readonly shell: string
  readonly env: Record<string, string>
  readonly recentEntries: ReadonlyArray<ConsoleEntry>
  readonly errorCount: number
  readonly sessionStartTime: number
}

export interface TroubleshootMessage {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly timestamp: number
  readonly model?: string
  readonly isStreaming?: boolean
}

export interface TroubleshootState {
  readonly isOpen: boolean
  readonly messages: ReadonlyArray<TroubleshootMessage>
  readonly sessionContext: SessionContext
  readonly isLoading: boolean
  readonly activeTab: 'chat' | 'console' | 'context'
}

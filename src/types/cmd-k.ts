/**
 * Cmd+K inline AI bar types.
 *
 * Defines the state shape, result variants, and history entries
 * for the floating Cmd+K command palette.
 */

export interface CmdKState {
  readonly isOpen: boolean
  readonly query: string
  readonly isProcessing: boolean
  readonly result: CmdKResult | null
  readonly history: ReadonlyArray<CmdKHistoryEntry>
}

export interface CmdKResult {
  readonly type: 'command' | 'explanation' | 'diff' | 'error'
  readonly content: string
  readonly command?: string        // if type='command', the command to run
  readonly isAutoExecuted?: boolean
}

export interface CmdKHistoryEntry {
  readonly query: string
  readonly result: CmdKResult
  readonly timestamp: number
}

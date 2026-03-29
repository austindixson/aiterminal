/**
 * Types for the Chat Sidebar feature.
 *
 * Defines message shapes, file attachments, sidebar state,
 * and conversation persistence types.
 *
 * All types are immutable (readonly) to prevent accidental mutation.
 */

export interface ChatMessage {
  readonly id: string
  readonly role: 'user' | 'assistant' | 'system'
  readonly content: string
  readonly timestamp: number
  readonly model?: string
  readonly isStreaming?: boolean
  readonly attachments?: ReadonlyArray<FileAttachment>
  readonly tokens?: {
    readonly prompt?: number
    readonly completion?: number
    readonly total?: number
  }
}

export interface FileAttachment {
  readonly path: string
  readonly name: string
  readonly content?: string    // loaded on demand
  readonly language?: string   // for syntax highlighting
}

export type ChatMode = 'plan' | 'normal' | 'autocode'

export interface ChatState {
  readonly isOpen: boolean
  readonly width: number           // sidebar width in px
  readonly avatarHeight?: number   // avatar section height in px (optional, for resizable avatar panel)
  readonly messages: ReadonlyArray<ChatMessage>
  readonly inputValue: string
  readonly isStreaming: boolean
  readonly attachedFiles: ReadonlyArray<FileAttachment>
  /** Human-readable model used for chat (`general` task), when known. */
  readonly activeModelLabel?: string
  /** OpenRouter model id for chat. */
  readonly activeModelId?: string
  /** Router preset (balanced / performance / budget). */
  readonly activePresetLabel?: string
  /** Chat operating mode: plan (read-only), normal (approval), autocode (YOLO) */
  readonly chatMode: ChatMode
  /** Claude Code CLI TUI mode is active */
  readonly claudeMode?: boolean
  /** Captured Claude TUI output */
  readonly claudeTUIOutput?: ClaudeTUIOutput
}

export interface ChatConversation {
  readonly id: string
  readonly title: string
  readonly messages: ReadonlyArray<ChatMessage>
  readonly createdAt: number
  readonly updatedAt: number
}

/** Claude Code TUI output captured from PTY */
export interface ClaudeTUIOutput {
  readonly sessionId: string
  readonly content: string
  readonly timestamp: number
  readonly isActive: boolean
}

/** Code snippet with cursor position from Claude TUI */
export interface ClaudeCursorSnippet {
  readonly code: string
  readonly language: string
  readonly cursorLine: number
  readonly filePath?: string
}

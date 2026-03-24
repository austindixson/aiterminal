/**
 * Types for the AI agent cursor and text streaming system.
 *
 * These types power two features:
 * 1. Live text streaming — AI responses appear character-by-character
 * 2. Multi-agent cursors — animated pointers show what each AI agent is working on
 */

// ---------------------------------------------------------------------------
// Agent identity
// ---------------------------------------------------------------------------

export interface AgentIdentity {
  readonly id: string
  readonly name: string           // e.g. "Debug", "Explain", "Fix", "Research"
  readonly color: string          // hex color for cursor/highlight
  readonly icon: string           // emoji or unicode char
}

// ---------------------------------------------------------------------------
// Cursor positioning
// ---------------------------------------------------------------------------

export interface CursorPosition {
  readonly agentId: string
  readonly x: number              // pixel position in the webview
  readonly y: number              // pixel position
  readonly targetSelector?: string // CSS selector of element being worked on
  readonly label: string          // agent name shown next to cursor
  readonly isActive: boolean      // currently streaming/working
  readonly lastUpdate: number     // timestamp
}

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

export interface StreamChunk {
  readonly agentId: string
  readonly content: string
  readonly isDone: boolean
  readonly cursorPosition?: CursorPosition
}

export interface StreamState {
  readonly agentId: string
  readonly content: string        // accumulated content so far
  readonly isStreaming: boolean
  readonly startTime: number
  readonly chunkCount: number
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface AgentCursorConfig {
  readonly agents: ReadonlyArray<AgentIdentity>
  readonly cursors: ReadonlyMap<string, CursorPosition>
  readonly showCursors: boolean
  readonly cursorSize: number     // px
  readonly trailEffect: boolean   // smooth cursor movement trail
}

/**
 * useStreaming — React hook that manages streaming state for all agents.
 *
 * Wraps StreamManager (immutable engine) with React state to provide
 * reactive updates as chunks arrive from the AI backend.
 */

import { useCallback, useRef, useState } from 'react'
import { StreamManager, processStreamResponse } from '@/ai/stream-manager'
import type { CursorPosition, StreamChunk, StreamState } from '@/types/agent-cursor'

// ---------------------------------------------------------------------------
// Cursor position estimation
// ---------------------------------------------------------------------------

const LINE_HEIGHT_PX = 20
const CHAR_WIDTH_PX = 8

/**
 * Estimates a cursor position based on accumulated content.
 * Uses line count for y and last-line length for x.
 */
function estimateCursorPosition(
  agentId: string,
  content: string,
  isActive: boolean,
): CursorPosition {
  const lines = content.split('\n')
  const lineCount = lines.length
  const lastLineLength = lines[lineCount - 1].length

  return {
    agentId,
    x: lastLineLength * CHAR_WIDTH_PX,
    y: lineCount * LINE_HEIGHT_PX,
    label: agentId,
    isActive,
    lastUpdate: Date.now(),
  }
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseStreamingReturn {
  readonly streams: Readonly<Record<string, StreamState>>
  readonly cursors: Readonly<Record<string, CursorPosition>>
  readonly isAnyStreaming: boolean
  readonly startAgentStream: (agentId: string, iterable: AsyncIterable<string>) => void
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function useStreaming(): UseStreamingReturn {
  const managerRef = useRef<StreamManager>(new StreamManager())
  const [streams, setStreams] = useState<Record<string, StreamState>>({})
  const [cursors, setCursors] = useState<Record<string, CursorPosition>>({})

  const syncState = useCallback((manager: StreamManager, agentId: string) => {
    managerRef.current = manager
    const state = manager.getStreamState(agentId)
    if (state) {
      setStreams((prev) => ({ ...prev, [agentId]: state }))
      setCursors((prev) => ({
        ...prev,
        [agentId]: estimateCursorPosition(agentId, state.content, state.isStreaming),
      }))
    }
  }, [])

  const startAgentStream = useCallback(
    (agentId: string, iterable: AsyncIterable<string>) => {
      // Start stream
      const started = managerRef.current.startStream(agentId)
      syncState(started, agentId)

      // Process chunks asynchronously
      processStreamResponse(agentId, iterable, (chunk: StreamChunk) => {
        if (chunk.isDone) {
          const ended = managerRef.current.endStream(agentId)
          syncState(ended, agentId)
        } else {
          const appended = managerRef.current.appendChunk(agentId, chunk.content)
          syncState(appended, agentId)
        }
      })
    },
    [syncState],
  )

  const isAnyStreaming = Object.values(streams).some((s) => s.isStreaming)

  return {
    streams,
    cursors,
    isAnyStreaming,
    startAgentStream,
  }
}

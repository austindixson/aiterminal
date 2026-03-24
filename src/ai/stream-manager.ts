/**
 * StreamManager — immutable streaming engine.
 *
 * All methods return new instances; the original is never mutated.
 * This makes state management predictable and safe for concurrent use.
 */

import type { StreamState, StreamChunk } from '@/types/agent-cursor'

// ---------------------------------------------------------------------------
// StreamManager (immutable)
// ---------------------------------------------------------------------------

export class StreamManager {
  private readonly streams: ReadonlyMap<string, StreamState>

  constructor(streams?: ReadonlyMap<string, StreamState>) {
    this.streams = streams ?? new Map()
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  getStreamState(agentId: string): StreamState | undefined {
    return this.streams.get(agentId)
  }

  getActiveStreams(): readonly StreamState[] {
    const active: StreamState[] = []
    for (const state of this.streams.values()) {
      if (state.isStreaming) {
        active.push(state)
      }
    }
    return active
  }

  // -----------------------------------------------------------------------
  // Transitions (all return new StreamManager)
  // -----------------------------------------------------------------------

  startStream(agentId: string): StreamManager {
    const state: StreamState = {
      agentId,
      content: '',
      isStreaming: true,
      startTime: Date.now(),
      chunkCount: 0,
    }
    return this.withStream(agentId, state)
  }

  appendChunk(agentId: string, chunk: string): StreamManager {
    const current = this.streams.get(agentId)
    if (!current) {
      throw new Error(`No active stream for agent "${agentId}". Call startStream first.`)
    }

    const updated: StreamState = {
      ...current,
      content: current.content + chunk,
      chunkCount: current.chunkCount + 1,
    }
    return this.withStream(agentId, updated)
  }

  endStream(agentId: string): StreamManager {
    const current = this.streams.get(agentId)
    if (!current) {
      throw new Error(`No active stream for agent "${agentId}". Call startStream first.`)
    }

    const updated: StreamState = {
      ...current,
      isStreaming: false,
    }
    return this.withStream(agentId, updated)
  }

  // -----------------------------------------------------------------------
  // Internal helper — produces a new manager with one stream replaced
  // -----------------------------------------------------------------------

  private withStream(agentId: string, state: StreamState): StreamManager {
    const next = new Map(this.streams)
    next.set(agentId, state)
    return new StreamManager(next)
  }
}

// ---------------------------------------------------------------------------
// processStreamResponse — consumes an async iterable from OpenRouter
// ---------------------------------------------------------------------------

/**
 * Consumes an async iterable of string chunks (e.g. from OpenRouterClient.streamQuery)
 * and calls `onChunk` for each piece of content, then once more with `isDone: true`.
 *
 * Errors are caught and forwarded as a final chunk with the error message.
 */
export async function processStreamResponse(
  agentId: string,
  iterable: AsyncIterable<string>,
  onChunk: (chunk: StreamChunk) => void,
): Promise<void> {
  try {
    for await (const content of iterable) {
      onChunk({
        agentId,
        content,
        isDone: false,
      })
    }

    onChunk({
      agentId,
      content: '',
      isDone: true,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown stream error'
    onChunk({
      agentId,
      content: `Error: ${message}`,
      isDone: true,
    })
  }
}

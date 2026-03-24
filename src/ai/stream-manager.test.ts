/**
 * Tests for StreamManager — the immutable streaming engine.
 *
 * TDD: these tests are written BEFORE the implementation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StreamManager, processStreamResponse } from './stream-manager'
import type { StreamChunk } from '@/types/agent-cursor'

// ---------------------------------------------------------------------------
// StreamManager — core state machine
// ---------------------------------------------------------------------------

describe('StreamManager', () => {
  let manager: StreamManager

  beforeEach(() => {
    manager = new StreamManager()
  })

  // -------------------------------------------------------------------------
  // startStream
  // -------------------------------------------------------------------------

  describe('startStream', () => {
    it('creates a new StreamState with empty content and isStreaming true', () => {
      const next = manager.startStream('debug')
      const state = next.getStreamState('debug')

      expect(state).toBeDefined()
      expect(state!.agentId).toBe('debug')
      expect(state!.content).toBe('')
      expect(state!.isStreaming).toBe(true)
      expect(state!.chunkCount).toBe(0)
      expect(state!.startTime).toBeGreaterThan(0)
    })

    it('returns an immutable new instance (does not mutate original)', () => {
      const next = manager.startStream('debug')

      expect(manager.getStreamState('debug')).toBeUndefined()
      expect(next.getStreamState('debug')).toBeDefined()
      expect(next).not.toBe(manager)
    })

    it('can start multiple independent streams', () => {
      const next = manager.startStream('debug').startStream('explain')

      expect(next.getStreamState('debug')!.isStreaming).toBe(true)
      expect(next.getStreamState('explain')!.isStreaming).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // appendChunk
  // -------------------------------------------------------------------------

  describe('appendChunk', () => {
    it('appends content to the accumulated string', () => {
      const next = manager
        .startStream('debug')
        .appendChunk('debug', 'Hello ')
        .appendChunk('debug', 'World')

      expect(next.getStreamState('debug')!.content).toBe('Hello World')
    })

    it('increments chunk count', () => {
      const next = manager
        .startStream('debug')
        .appendChunk('debug', 'a')
        .appendChunk('debug', 'b')
        .appendChunk('debug', 'c')

      expect(next.getStreamState('debug')!.chunkCount).toBe(3)
    })

    it('does NOT mutate — returns new state', () => {
      const started = manager.startStream('debug')
      const appended = started.appendChunk('debug', 'chunk')

      expect(started.getStreamState('debug')!.content).toBe('')
      expect(appended.getStreamState('debug')!.content).toBe('chunk')
      expect(appended).not.toBe(started)
    })

    it('handles empty chunks gracefully', () => {
      const next = manager
        .startStream('debug')
        .appendChunk('debug', '')

      expect(next.getStreamState('debug')!.content).toBe('')
      expect(next.getStreamState('debug')!.chunkCount).toBe(1)
    })

    it('throws if stream has not been started', () => {
      expect(() => manager.appendChunk('unknown', 'data')).toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // endStream
  // -------------------------------------------------------------------------

  describe('endStream', () => {
    it('sets isStreaming to false', () => {
      const next = manager
        .startStream('debug')
        .appendChunk('debug', 'content')
        .endStream('debug')

      expect(next.getStreamState('debug')!.isStreaming).toBe(false)
    })

    it('preserves accumulated content', () => {
      const next = manager
        .startStream('debug')
        .appendChunk('debug', 'preserved')
        .endStream('debug')

      expect(next.getStreamState('debug')!.content).toBe('preserved')
    })

    it('throws if stream has not been started', () => {
      expect(() => manager.endStream('unknown')).toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // getActiveStreams
  // -------------------------------------------------------------------------

  describe('getActiveStreams', () => {
    it('returns only agents with isStreaming true', () => {
      const next = manager
        .startStream('debug')
        .startStream('explain')
        .endStream('debug')

      const active = next.getActiveStreams()

      expect(active).toHaveLength(1)
      expect(active[0].agentId).toBe('explain')
    })

    it('returns empty array when none are streaming', () => {
      expect(manager.getActiveStreams()).toHaveLength(0)
    })

    it('returns all active streams when multiple are streaming', () => {
      const next = manager
        .startStream('debug')
        .startStream('explain')
        .startStream('fix')

      expect(next.getActiveStreams()).toHaveLength(3)
    })
  })
})

// ---------------------------------------------------------------------------
// processStreamResponse — consumes an async iterable
// ---------------------------------------------------------------------------

describe('processStreamResponse', () => {
  it('calls onChunk for each piece of content', async () => {
    const chunks = ['Hello', ' ', 'World']
    const iterable = createAsyncIterable(chunks)
    const onChunk = vi.fn()

    await processStreamResponse('debug', iterable, onChunk)

    // One call per chunk plus one final isDone call
    const contentCalls = onChunk.mock.calls.filter(
      (c) => !(c[0] as StreamChunk).isDone,
    )
    expect(contentCalls).toHaveLength(3)
    expect((contentCalls[0][0] as StreamChunk).content).toBe('Hello')
    expect((contentCalls[1][0] as StreamChunk).content).toBe(' ')
    expect((contentCalls[2][0] as StreamChunk).content).toBe('World')
  })

  it('calls onChunk with isDone=true when complete', async () => {
    const iterable = createAsyncIterable(['data'])
    const onChunk = vi.fn()

    await processStreamResponse('debug', iterable, onChunk)

    const doneCalls = onChunk.mock.calls.filter(
      (c) => (c[0] as StreamChunk).isDone,
    )
    expect(doneCalls).toHaveLength(1)
    expect((doneCalls[0][0] as StreamChunk).isDone).toBe(true)
  })

  it('handles errors gracefully (calls onChunk with error content)', async () => {
    const iterable = createFailingIterable(new Error('Stream broke'))
    const onChunk = vi.fn()

    await processStreamResponse('debug', iterable, onChunk)

    const lastCall = onChunk.mock.calls[onChunk.mock.calls.length - 1][0] as StreamChunk
    expect(lastCall.isDone).toBe(true)
    expect(lastCall.content).toContain('Stream broke')
  })

  it('passes the agentId through on every chunk', async () => {
    const iterable = createAsyncIterable(['a', 'b'])
    const onChunk = vi.fn()

    await processStreamResponse('explain', iterable, onChunk)

    for (const call of onChunk.mock.calls) {
      expect((call[0] as StreamChunk).agentId).toBe('explain')
    }
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function* createAsyncIterable(items: readonly string[]): AsyncIterable<string> {
  for (const item of items) {
    yield item
  }
}

async function* createFailingIterable(error: Error): AsyncIterable<string> {
  yield 'partial'
  throw error
}

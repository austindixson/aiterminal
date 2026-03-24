/**
 * Tests for useStreaming — React hook managing streaming state for all agents.
 *
 * TDD: these tests are written BEFORE the implementation.
 */

import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStreaming } from './useStreaming'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function* createAsyncIterable(items: readonly string[]): AsyncIterable<string> {
  for (const item of items) {
    yield item
  }
}

/**
 * Flush all pending microtasks so async iterable consumption completes.
 */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useStreaming', () => {
  it('returns initial empty state', () => {
    const { result } = renderHook(() => useStreaming())

    expect(result.current.streams).toEqual({})
    expect(result.current.cursors).toEqual({})
    expect(result.current.isAnyStreaming).toBe(false)
  })

  it('starting a stream updates state', async () => {
    const { result } = renderHook(() => useStreaming())

    await act(async () => {
      result.current.startAgentStream('debug', createAsyncIterable(['hello']))
      await flushMicrotasks()
    })

    expect(result.current.streams['debug']).toBeDefined()
  })

  it('chunks append to content reactively', async () => {
    const { result } = renderHook(() => useStreaming())

    await act(async () => {
      result.current.startAgentStream('debug', createAsyncIterable(['Hello', ' World']))
      await flushMicrotasks()
    })

    expect(result.current.streams['debug']?.content).toBe('Hello World')
  })

  it('ending stream updates isStreaming to false', async () => {
    const { result } = renderHook(() => useStreaming())

    await act(async () => {
      result.current.startAgentStream('debug', createAsyncIterable(['done']))
      await flushMicrotasks()
    })

    // After the iterable is exhausted, isStreaming should be false
    expect(result.current.streams['debug']?.isStreaming).toBe(false)
  })

  it('multiple simultaneous streams are tracked independently', async () => {
    const { result } = renderHook(() => useStreaming())

    await act(async () => {
      result.current.startAgentStream('debug', createAsyncIterable(['error log']))
      result.current.startAgentStream('explain', createAsyncIterable(['explanation']))
      await flushMicrotasks()
    })

    expect(result.current.streams['debug']?.content).toBe('error log')
    expect(result.current.streams['explain']?.content).toBe('explanation')
  })

  it('cursor positions update with chunks', async () => {
    const { result } = renderHook(() => useStreaming())

    await act(async () => {
      result.current.startAgentStream('debug', createAsyncIterable(['line1\nline2']))
      await flushMicrotasks()
    })

    const cursor = result.current.cursors['debug']
    expect(cursor).toBeDefined()
    expect(cursor!.agentId).toBe('debug')
    // y position should increase with more lines
    expect(cursor!.y).toBeGreaterThan(0)
  })

  it('isAnyStreaming reflects active state', async () => {
    const { result } = renderHook(() => useStreaming())

    // Initially false
    expect(result.current.isAnyStreaming).toBe(false)

    // After all streams complete, should be false again
    await act(async () => {
      result.current.startAgentStream('debug', createAsyncIterable(['x']))
      await flushMicrotasks()
    })

    expect(result.current.isAnyStreaming).toBe(false)
  })
})

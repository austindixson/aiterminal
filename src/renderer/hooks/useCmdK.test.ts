import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCmdK } from './useCmdK'

// ---------------------------------------------------------------------------
// Mock: window.electronAPI
// ---------------------------------------------------------------------------

const mockAiQuery = vi.fn()
const mockWriteToPty = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()

  // In jsdom, window is already defined. Just attach electronAPI directly.
  ;(window as any).electronAPI = {
    aiQuery: mockAiQuery,
    writeToPty: mockWriteToPty,
  }

  mockAiQuery.mockResolvedValue({
    content: 'Use `ls -la` to list files.',
    model: 'anthropic/claude-sonnet-4-20250514',
    inputTokens: 20,
    outputTokens: 10,
    latencyMs: 150,
    cost: 0.0001,
  })
})

afterEach(() => {
  delete (window as any).electronAPI
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCmdK', () => {
  it('returns initial state: closed, empty query, not processing', () => {
    const { result } = renderHook(() => useCmdK())

    expect(result.current.state.isOpen).toBe(false)
    expect(result.current.state.query).toBe('')
    expect(result.current.state.isProcessing).toBe(false)
    expect(result.current.state.result).toBeNull()
    expect(result.current.state.history).toEqual([])
  })

  it('open() sets isOpen to true', () => {
    const { result } = renderHook(() => useCmdK())

    act(() => {
      result.current.open()
    })

    expect(result.current.state.isOpen).toBe(true)
  })

  it('close() sets isOpen to false and clears query and result', () => {
    const { result } = renderHook(() => useCmdK())

    act(() => {
      result.current.open()
      result.current.setQuery('some query')
    })
    expect(result.current.state.isOpen).toBe(true)
    expect(result.current.state.query).toBe('some query')

    act(() => {
      result.current.close()
    })

    expect(result.current.state.isOpen).toBe(false)
    expect(result.current.state.query).toBe('')
    expect(result.current.state.result).toBeNull()
  })

  it('toggle() switches isOpen state', () => {
    const { result } = renderHook(() => useCmdK())

    expect(result.current.state.isOpen).toBe(false)

    act(() => {
      result.current.toggle()
    })
    expect(result.current.state.isOpen).toBe(true)

    act(() => {
      result.current.toggle()
    })
    expect(result.current.state.isOpen).toBe(false)
  })

  it('setQuery() updates the query string', () => {
    const { result } = renderHook(() => useCmdK())

    act(() => {
      result.current.setQuery('list all files')
    })

    expect(result.current.state.query).toBe('list all files')
  })

  it('submit() sends query to AI and sets result', async () => {
    mockAiQuery.mockResolvedValueOnce({
      content: 'Explanation of how ls works.',
      model: 'test-model',
      inputTokens: 10,
      outputTokens: 5,
      latencyMs: 100,
      cost: 0,
    })

    const { result } = renderHook(() => useCmdK())

    act(() => {
      result.current.setQuery('how does ls work?')
    })

    await act(async () => {
      await result.current.submit()
    })

    expect(mockAiQuery).toHaveBeenCalledTimes(1)
    expect(result.current.state.result).not.toBeNull()
    expect(result.current.state.result?.type).toBe('explanation')
    expect(result.current.state.result?.content).toBe(
      'Explanation of how ls works.',
    )
    expect(result.current.state.isProcessing).toBe(false)
  })

  it('submit() with [RUN] tag auto-executes command via PTY', async () => {
    mockAiQuery.mockResolvedValueOnce({
      content: '[RUN]ls -la[/RUN]\nThis lists all files including hidden ones.',
      model: 'test-model',
      inputTokens: 10,
      outputTokens: 5,
      latencyMs: 100,
      cost: 0,
    })

    const { result } = renderHook(() => useCmdK())

    act(() => {
      result.current.setQuery('list all files')
    })

    await act(async () => {
      await result.current.submit()
    })

    expect(mockWriteToPty).toHaveBeenCalledWith('ls -la\r')
    expect(result.current.state.result?.type).toBe('command')
    expect(result.current.state.result?.command).toBe('ls -la')
    expect(result.current.state.result?.isAutoExecuted).toBe(true)
  })

  it('submit() adds entry to history', async () => {
    mockAiQuery.mockResolvedValueOnce({
      content: 'Here is your answer.',
      model: 'test-model',
      inputTokens: 10,
      outputTokens: 5,
      latencyMs: 100,
      cost: 0,
    })

    const { result } = renderHook(() => useCmdK())

    act(() => {
      result.current.setQuery('test query')
    })

    await act(async () => {
      await result.current.submit()
    })

    expect(result.current.state.history.length).toBe(1)
    expect(result.current.state.history[0].query).toBe('test query')
    expect(result.current.state.history[0].result.content).toBe(
      'Here is your answer.',
    )
    expect(typeof result.current.state.history[0].timestamp).toBe('number')
  })

  it('submit() sets error result on AI failure', async () => {
    mockAiQuery.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useCmdK())

    act(() => {
      result.current.setQuery('failing query')
    })

    await act(async () => {
      await result.current.submit()
    })

    expect(result.current.state.result?.type).toBe('error')
    expect(result.current.state.result?.content).toContain('Network error')
    expect(result.current.state.isProcessing).toBe(false)
  })

  it('navigateHistory(-1) goes to previous query', async () => {
    // Submit two queries to build history
    mockAiQuery.mockResolvedValueOnce({
      content: 'Answer 1',
      model: 'm',
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      cost: 0,
    })
    mockAiQuery.mockResolvedValueOnce({
      content: 'Answer 2',
      model: 'm',
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      cost: 0,
    })

    const { result } = renderHook(() => useCmdK())

    // First query
    act(() => {
      result.current.setQuery('first query')
    })
    await act(async () => {
      await result.current.submit()
    })

    // Second query
    act(() => {
      result.current.setQuery('second query')
    })
    await act(async () => {
      await result.current.submit()
    })

    // Navigate back
    act(() => {
      result.current.navigateHistory(-1)
    })

    expect(result.current.state.query).toBe('second query')

    act(() => {
      result.current.navigateHistory(-1)
    })

    expect(result.current.state.query).toBe('first query')
  })

  it('navigateHistory(1) goes to next query', async () => {
    mockAiQuery.mockResolvedValueOnce({
      content: 'A1',
      model: 'm',
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      cost: 0,
    })
    mockAiQuery.mockResolvedValueOnce({
      content: 'A2',
      model: 'm',
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      cost: 0,
    })

    const { result } = renderHook(() => useCmdK())

    act(() => {
      result.current.setQuery('query one')
    })
    await act(async () => {
      await result.current.submit()
    })

    act(() => {
      result.current.setQuery('query two')
    })
    await act(async () => {
      await result.current.submit()
    })

    // Navigate to the beginning
    act(() => {
      result.current.navigateHistory(-1)
    })
    act(() => {
      result.current.navigateHistory(-1)
    })

    expect(result.current.state.query).toBe('query one')

    // Navigate forward
    act(() => {
      result.current.navigateHistory(1)
    })

    expect(result.current.state.query).toBe('query two')
  })

  it('submit() does nothing when query is empty', async () => {
    const { result } = renderHook(() => useCmdK())

    await act(async () => {
      await result.current.submit()
    })

    expect(mockAiQuery).not.toHaveBeenCalled()
    expect(result.current.state.result).toBeNull()
    expect(result.current.state.history).toEqual([])
  })

  it('history is capped at 20 entries (ring buffer)', async () => {
    const { result } = renderHook(() => useCmdK())

    for (let i = 0; i < 25; i++) {
      mockAiQuery.mockResolvedValueOnce({
        content: `Answer ${i}`,
        model: 'm',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
        cost: 0,
      })

      act(() => {
        result.current.setQuery(`query ${i}`)
      })
      await act(async () => {
        await result.current.submit()
      })
    }

    expect(result.current.state.history.length).toBe(20)
    // Oldest entry should be query 5 (0-4 dropped)
    expect(result.current.state.history[0].query).toBe('query 5')
    expect(result.current.state.history[19].query).toBe('query 24')
  })

  it('uses immutable state updates', async () => {
    mockAiQuery.mockResolvedValueOnce({
      content: 'answer',
      model: 'm',
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      cost: 0,
    })

    const { result } = renderHook(() => useCmdK())

    const historyBefore = result.current.state.history

    act(() => {
      result.current.setQuery('immutable test')
    })
    await act(async () => {
      await result.current.submit()
    })

    const historyAfter = result.current.state.history

    // References should differ (immutable)
    expect(historyBefore).not.toBe(historyAfter)
    expect(historyBefore.length).toBe(0)
  })
})

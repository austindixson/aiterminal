/**
 * Tests for useAutocomplete — React hook managing autocomplete state and interactions.
 *
 * TDD: these tests are written BEFORE the implementation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAutocomplete } from './useAutocomplete'

// ---------------------------------------------------------------------------
// Mock: autocomplete-service
// ---------------------------------------------------------------------------

const mockGetLocalSuggestions = vi.fn()
const mockGetCommandSuggestions = vi.fn()
const mockGetAISuggestions = vi.fn()
const mockMergeSuggestions = vi.fn()

vi.mock('@/autocomplete/autocomplete-service', () => ({
  getLocalSuggestions: (...args: unknown[]) => mockGetLocalSuggestions(...args),
  getCommandSuggestions: (...args: unknown[]) => mockGetCommandSuggestions(...args),
  getAISuggestions: (...args: unknown[]) => mockGetAISuggestions(...args),
  mergeSuggestions: (...args: unknown[]) => mockMergeSuggestions(...args),
}))

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })

  mockGetLocalSuggestions.mockResolvedValue([])
  mockGetCommandSuggestions.mockReturnValue([])
  mockGetAISuggestions.mockResolvedValue([])
  mockMergeSuggestions.mockReturnValue([])
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Advance timers past the debounce threshold and flush all microtasks.
 */
async function advanceDebounce(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(250)
    // Allow microtasks (promises) to settle
    await vi.advanceTimersByTimeAsync(0)
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAutocomplete', () => {
  it('returns initial state: hidden, no suggestions', () => {
    const { result } = renderHook(() => useAutocomplete())

    expect(result.current.state.isVisible).toBe(false)
    expect(result.current.state.suggestions).toEqual([])
    expect(result.current.state.selectedIndex).toBe(0)
    expect(result.current.state.partialInput).toBe('')
    expect(result.current.state.isLoading).toBe(false)
  })

  it('trigger(partial) fetches suggestions after debounce', async () => {
    const suggestions = [
      { text: 'git status', description: 'Show status', type: 'command', confidence: 0.9 },
    ]
    mockGetCommandSuggestions.mockReturnValue(suggestions)
    mockMergeSuggestions.mockReturnValue(suggestions)

    const { result } = renderHook(() => useAutocomplete())

    act(() => {
      result.current.trigger('git', '/Users/test')
    })

    // Before debounce fires
    expect(result.current.state.isVisible).toBe(false)

    // Advance past debounce
    await advanceDebounce()

    expect(result.current.state.isVisible).toBe(true)
    expect(result.current.state.suggestions.length).toBe(1)
    expect(result.current.state.partialInput).toBe('git')
  })

  it('debounces rapid triggers (only last one fires)', async () => {
    const suggestions = [
      { text: 'git status', description: 'Show status', type: 'command', confidence: 0.9 },
    ]
    mockGetCommandSuggestions.mockReturnValue(suggestions)
    mockMergeSuggestions.mockReturnValue(suggestions)

    const { result } = renderHook(() => useAutocomplete())

    act(() => {
      result.current.trigger('g', '/Users/test')
    })
    act(() => {
      result.current.trigger('gi', '/Users/test')
    })
    act(() => {
      result.current.trigger('git', '/Users/test')
    })

    await advanceDebounce()

    // Should only have called with the last input
    expect(mockGetCommandSuggestions).toHaveBeenCalledTimes(1)
    expect(mockGetCommandSuggestions).toHaveBeenCalledWith('git')
  })

  it('selectNext cycles through suggestions', async () => {
    const suggestions = [
      { text: 'a', description: '', type: 'command', confidence: 1 },
      { text: 'b', description: '', type: 'command', confidence: 1 },
      { text: 'c', description: '', type: 'command', confidence: 1 },
    ]
    mockGetCommandSuggestions.mockReturnValue(suggestions)
    mockMergeSuggestions.mockReturnValue(suggestions)

    const { result } = renderHook(() => useAutocomplete())

    act(() => {
      result.current.trigger('test', '/Users/test')
    })
    await advanceDebounce()

    expect(result.current.state.selectedIndex).toBe(0)

    act(() => {
      result.current.selectNext()
    })
    expect(result.current.state.selectedIndex).toBe(1)

    act(() => {
      result.current.selectNext()
    })
    expect(result.current.state.selectedIndex).toBe(2)

    // Wraps around
    act(() => {
      result.current.selectNext()
    })
    expect(result.current.state.selectedIndex).toBe(0)
  })

  it('selectPrev cycles through suggestions backwards', async () => {
    const suggestions = [
      { text: 'a', description: '', type: 'command', confidence: 1 },
      { text: 'b', description: '', type: 'command', confidence: 1 },
      { text: 'c', description: '', type: 'command', confidence: 1 },
    ]
    mockGetCommandSuggestions.mockReturnValue(suggestions)
    mockMergeSuggestions.mockReturnValue(suggestions)

    const { result } = renderHook(() => useAutocomplete())

    act(() => {
      result.current.trigger('test', '/Users/test')
    })
    await advanceDebounce()

    expect(result.current.state.selectedIndex).toBe(0)

    // Wraps to end
    act(() => {
      result.current.selectPrev()
    })
    expect(result.current.state.selectedIndex).toBe(2)

    act(() => {
      result.current.selectPrev()
    })
    expect(result.current.state.selectedIndex).toBe(1)
  })

  it('accept() returns selected text and closes', async () => {
    const suggestions = [
      { text: 'git status', description: 'Show status', type: 'command', confidence: 0.9 },
      { text: 'git stash', description: 'Stash changes', type: 'command', confidence: 0.8 },
    ]
    mockGetCommandSuggestions.mockReturnValue(suggestions)
    mockMergeSuggestions.mockReturnValue(suggestions)

    const { result } = renderHook(() => useAutocomplete())

    act(() => {
      result.current.trigger('git', '/Users/test')
    })
    await advanceDebounce()

    // Select second item
    act(() => {
      result.current.selectNext()
    })

    let accepted: string | null = null
    act(() => {
      accepted = result.current.accept()
    })

    expect(accepted).toBe('git stash')
    expect(result.current.state.isVisible).toBe(false)
  })

  it('dismiss() hides dropdown', async () => {
    const suggestions = [
      { text: 'test', description: '', type: 'command', confidence: 1 },
    ]
    mockGetCommandSuggestions.mockReturnValue(suggestions)
    mockMergeSuggestions.mockReturnValue(suggestions)

    const { result } = renderHook(() => useAutocomplete())

    act(() => {
      result.current.trigger('tes', '/Users/test')
    })
    await advanceDebounce()

    expect(result.current.state.isVisible).toBe(true)

    act(() => {
      result.current.dismiss()
    })

    expect(result.current.state.isVisible).toBe(false)
    expect(result.current.state.suggestions).toEqual([])
  })

  it('updates suggestions on new partial input', async () => {
    const suggestionsA = [
      { text: 'git', description: 'Version control', type: 'command', confidence: 0.9 },
    ]
    const suggestionsB = [
      { text: 'grep', description: 'Search text', type: 'command', confidence: 0.9 },
    ]

    mockGetCommandSuggestions
      .mockReturnValueOnce(suggestionsA)
      .mockReturnValueOnce(suggestionsB)
    mockMergeSuggestions
      .mockReturnValueOnce(suggestionsA)
      .mockReturnValueOnce(suggestionsB)

    const { result } = renderHook(() => useAutocomplete())

    // First trigger
    act(() => {
      result.current.trigger('gi', '/Users/test')
    })
    await advanceDebounce()

    expect(result.current.state.suggestions[0].text).toBe('git')

    // Second trigger — new input
    act(() => {
      result.current.trigger('gre', '/Users/test')
    })
    await advanceDebounce()

    expect(result.current.state.suggestions[0].text).toBe('grep')
  })

  it('clears on empty input', async () => {
    const suggestions = [
      { text: 'test', description: '', type: 'command', confidence: 1 },
    ]
    mockGetCommandSuggestions.mockReturnValue(suggestions)
    mockMergeSuggestions.mockReturnValue(suggestions)

    const { result } = renderHook(() => useAutocomplete())

    act(() => {
      result.current.trigger('tes', '/Users/test')
    })
    await advanceDebounce()

    expect(result.current.state.isVisible).toBe(true)

    act(() => {
      result.current.trigger('', '/Users/test')
    })
    await advanceDebounce()

    expect(result.current.state.isVisible).toBe(false)
    expect(result.current.state.suggestions).toEqual([])
  })

  it('accept() returns null when no suggestions', () => {
    const { result } = renderHook(() => useAutocomplete())

    let accepted: string | null = null
    act(() => {
      accepted = result.current.accept()
    })

    expect(accepted).toBeNull()
  })

  it('resets selectedIndex when new suggestions arrive', async () => {
    const suggestionsA = [
      { text: 'a', description: '', type: 'command', confidence: 1 },
      { text: 'b', description: '', type: 'command', confidence: 1 },
    ]
    const suggestionsB = [
      { text: 'c', description: '', type: 'command', confidence: 1 },
    ]

    mockGetCommandSuggestions
      .mockReturnValueOnce(suggestionsA)
      .mockReturnValueOnce(suggestionsB)
    mockMergeSuggestions
      .mockReturnValueOnce(suggestionsA)
      .mockReturnValueOnce(suggestionsB)

    const { result } = renderHook(() => useAutocomplete())

    // First trigger
    act(() => {
      result.current.trigger('ab', '/Users/test')
    })
    await advanceDebounce()

    // Move to second item
    act(() => {
      result.current.selectNext()
    })
    expect(result.current.state.selectedIndex).toBe(1)

    // New trigger — index should reset
    act(() => {
      result.current.trigger('c', '/Users/test')
    })
    await advanceDebounce()

    expect(result.current.state.selectedIndex).toBe(0)
  })
})

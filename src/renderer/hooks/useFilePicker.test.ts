import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFilePicker } from './useFilePicker'
import type { FilePickerResult } from '@/types/file-context'

// ---------------------------------------------------------------------------
// Mock file-context-service
// ---------------------------------------------------------------------------

const mockSearchResults: FilePickerResult[] = [
  {
    path: '/project/src/main.ts',
    name: 'main.ts',
    relativePath: 'src/main.ts',
    isDirectory: false,
  },
  {
    path: '/project/src/main/index.ts',
    name: 'index.ts',
    relativePath: 'src/main/index.ts',
    isDirectory: false,
  },
  {
    path: '/project/package.json',
    name: 'package.json',
    relativePath: 'package.json',
    isDirectory: false,
  },
]

const mockSearchFiles = vi.fn().mockResolvedValue(mockSearchResults)

vi.mock('@/file-context/file-context-service', () => ({
  searchFiles: (...args: unknown[]) => mockSearchFiles(...args),
}))

// ---------------------------------------------------------------------------
// Helper: advance timers and flush microtasks
// ---------------------------------------------------------------------------

async function advanceAndFlush(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms)
    // Flush resolved promise microtasks
    await Promise.resolve()
    await Promise.resolve()
  })
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockSearchFiles.mockResolvedValue(mockSearchResults)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useFilePicker', () => {
  it('initial state is closed', () => {
    const { result } = renderHook(() => useFilePicker('/project'))

    expect(result.current.state.isOpen).toBe(false)
    expect(result.current.state.query).toBe('')
    expect(result.current.state.results).toEqual([])
    expect(result.current.state.selectedIndex).toBe(0)
  })

  it('open(query) opens picker and triggers search', async () => {
    const { result } = renderHook(() => useFilePicker('/project'))

    act(() => {
      result.current.open('main')
    })

    expect(result.current.state.isOpen).toBe(true)
    expect(result.current.state.query).toBe('main')

    await advanceAndFlush(200)

    expect(mockSearchFiles).toHaveBeenCalledWith('main', '/project')
    expect(result.current.state.results).toEqual(mockSearchResults)
  })

  it('setQuery updates query and re-searches', async () => {
    const { result } = renderHook(() => useFilePicker('/project'))

    act(() => {
      result.current.open('')
    })

    act(() => {
      result.current.setQuery('package')
    })

    expect(result.current.state.query).toBe('package')

    await advanceAndFlush(200)

    expect(mockSearchFiles).toHaveBeenCalledWith('package', '/project')
  })

  it('selectNext cycles selectedIndex forward', async () => {
    const { result } = renderHook(() => useFilePicker('/project'))

    act(() => {
      result.current.open('main')
    })

    await advanceAndFlush(200)

    expect(result.current.state.results).toEqual(mockSearchResults)
    expect(result.current.state.selectedIndex).toBe(0)

    act(() => {
      result.current.selectNext()
    })

    expect(result.current.state.selectedIndex).toBe(1)

    act(() => {
      result.current.selectNext()
    })

    expect(result.current.state.selectedIndex).toBe(2)

    // Wrap around
    act(() => {
      result.current.selectNext()
    })

    expect(result.current.state.selectedIndex).toBe(0)
  })

  it('selectPrev cycles selectedIndex backward', async () => {
    const { result } = renderHook(() => useFilePicker('/project'))

    act(() => {
      result.current.open('main')
    })

    await advanceAndFlush(200)

    expect(result.current.state.results).toEqual(mockSearchResults)

    // Should wrap to end
    act(() => {
      result.current.selectPrev()
    })

    expect(result.current.state.selectedIndex).toBe(2)

    act(() => {
      result.current.selectPrev()
    })

    expect(result.current.state.selectedIndex).toBe(1)
  })

  it('select() returns chosen file and closes picker', async () => {
    const { result } = renderHook(() => useFilePicker('/project'))

    act(() => {
      result.current.open('main')
    })

    await advanceAndFlush(200)

    expect(result.current.state.results).toEqual(mockSearchResults)

    act(() => {
      result.current.selectNext() // index 1
    })

    let selected: FilePickerResult | null = null
    act(() => {
      selected = result.current.select()
    })

    expect(selected).toEqual(mockSearchResults[1])
    expect(result.current.state.isOpen).toBe(false)
  })

  it('dismiss() closes picker and resets state', async () => {
    const { result } = renderHook(() => useFilePicker('/project'))

    act(() => {
      result.current.open('main')
    })

    await advanceAndFlush(200)

    expect(result.current.state.isOpen).toBe(true)

    act(() => {
      result.current.dismiss()
    })

    expect(result.current.state.isOpen).toBe(false)
    expect(result.current.state.query).toBe('')
    expect(result.current.state.results).toEqual([])
    expect(result.current.state.selectedIndex).toBe(0)
  })

  it('debounces search (150ms)', async () => {
    const { result } = renderHook(() => useFilePicker('/project'))

    act(() => {
      result.current.open('')
    })

    // Rapid query changes
    act(() => {
      result.current.setQuery('m')
    })
    act(() => {
      result.current.setQuery('ma')
    })
    act(() => {
      result.current.setQuery('mai')
    })
    act(() => {
      result.current.setQuery('main')
    })

    // Before debounce fires
    await advanceAndFlush(100)

    expect(mockSearchFiles).not.toHaveBeenCalled()

    // After debounce fires
    await advanceAndFlush(100)

    // Should only search once with the final query
    expect(mockSearchFiles).toHaveBeenCalledTimes(1)
    expect(mockSearchFiles).toHaveBeenCalledWith('main', '/project')
  })

  it('empty query shows recent/all files', async () => {
    const { result } = renderHook(() => useFilePicker('/project'))

    act(() => {
      result.current.open('')
    })

    await advanceAndFlush(200)

    // searchFiles should be called with empty string
    expect(mockSearchFiles).toHaveBeenCalledWith('', '/project')
  })

  it('select() returns null when results are empty', () => {
    mockSearchFiles.mockResolvedValue([])
    const { result } = renderHook(() => useFilePicker('/project'))

    act(() => {
      result.current.open('')
    })

    let selected: FilePickerResult | null = null
    act(() => {
      selected = result.current.select()
    })

    expect(selected).toBeNull()
  })

  it('resets selectedIndex when results change', async () => {
    const { result } = renderHook(() => useFilePicker('/project'))

    act(() => {
      result.current.open('main')
    })

    await advanceAndFlush(200)

    expect(result.current.state.results).toEqual(mockSearchResults)

    act(() => {
      result.current.selectNext()
    })
    act(() => {
      result.current.selectNext()
    })

    expect(result.current.state.selectedIndex).toBe(2)

    // Trigger a new search
    const newResults: FilePickerResult[] = [
      { path: '/project/new.ts', name: 'new.ts', relativePath: 'new.ts', isDirectory: false },
    ]
    mockSearchFiles.mockResolvedValue(newResults)

    act(() => {
      result.current.setQuery('new')
    })

    await advanceAndFlush(200)

    expect(result.current.state.selectedIndex).toBe(0)
  })
})

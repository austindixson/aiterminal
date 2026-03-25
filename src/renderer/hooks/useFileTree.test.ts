import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFileTree } from './useFileTree'
import type { FileEntry } from '@/types/file-tree'

// ---------------------------------------------------------------------------
// Mock electronAPI
// ---------------------------------------------------------------------------

const mockEntries: ReadonlyArray<FileEntry> = [
  {
    name: 'src',
    path: '/project/src',
    isDirectory: true,
    isHidden: false,
    size: 0,
    extension: null,
  },
  {
    name: 'package.json',
    path: '/project/package.json',
    isDirectory: false,
    isHidden: false,
    size: 1024,
    extension: '.json',
  },
]

const mockReadDirectoryTree = vi.fn().mockResolvedValue(mockEntries)

beforeEach(() => {
  vi.useFakeTimers()
  mockReadDirectoryTree.mockClear()

  const w = window as unknown as Record<string, unknown>
  w.electronAPI = {
    ...(w.electronAPI as object),
    readDirectoryTree: mockReadDirectoryTree,
  }
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useFileTree', () => {
  it('fetches directory listing when cwd is provided', async () => {
    const { result } = renderHook(() => useFileTree('/project'))

    // Advance past the debounce timer
    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    expect(mockReadDirectoryTree).toHaveBeenCalledWith('/project', expect.any(Number))
    expect(result.current.entries).toEqual(mockEntries)
  })

  it('debounces rapid cwd changes (300ms)', async () => {
    const { rerender } = renderHook(
      ({ cwd }) => useFileTree(cwd),
      { initialProps: { cwd: '/project/a' } },
    )

    // Rapid changes
    rerender({ cwd: '/project/b' })
    rerender({ cwd: '/project/c' })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    // Should only have called once with the final value
    expect(mockReadDirectoryTree).toHaveBeenCalledTimes(1)
    expect(mockReadDirectoryTree).toHaveBeenCalledWith('/project/c', expect.any(Number))
  })

  it('starts with isVisible true by default', () => {
    const { result } = renderHook(() => useFileTree('/project'))
    expect(result.current.isVisible).toBe(true)
  })

  it('toggleVisible flips visibility', () => {
    const { result } = renderHook(() => useFileTree('/project'))

    act(() => {
      result.current.toggleVisible()
    })

    expect(result.current.isVisible).toBe(false)

    act(() => {
      result.current.toggleVisible()
    })

    expect(result.current.isVisible).toBe(true)
  })

  it('starts with showHidden false by default', () => {
    const { result } = renderHook(() => useFileTree('/project'))
    expect(result.current.showHidden).toBe(false)
  })

  it('toggleHidden flips hidden files visibility', () => {
    const { result } = renderHook(() => useFileTree('/project'))

    act(() => {
      result.current.toggleHidden()
    })

    expect(result.current.showHidden).toBe(true)
  })

  it('expandPath adds path to expanded set', () => {
    const { result } = renderHook(() => useFileTree('/project'))

    act(() => {
      result.current.expandPath('/project/src')
    })

    expect(result.current.expandedPaths.has('/project/src')).toBe(true)
  })

  it('collapsePath removes path from expanded set', () => {
    const { result } = renderHook(() => useFileTree('/project'))

    act(() => {
      result.current.expandPath('/project/src')
    })

    act(() => {
      result.current.collapsePath('/project/src')
    })

    expect(result.current.expandedPaths.has('/project/src')).toBe(false)
  })

  it('selectFile updates selectedPath', () => {
    const { result } = renderHook(() => useFileTree('/project'))

    act(() => {
      result.current.selectFile('/project/package.json')
    })

    expect(result.current.selectedPath).toBe('/project/package.json')
  })

  it('selectedPath is null initially', () => {
    const { result } = renderHook(() => useFileTree('/project'))
    expect(result.current.selectedPath).toBeNull()
  })

  it('refetches when cwd changes after debounce', async () => {
    const { rerender } = renderHook(
      ({ cwd }) => useFileTree(cwd),
      { initialProps: { cwd: '/project/a' } },
    )

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    expect(mockReadDirectoryTree).toHaveBeenCalledTimes(1)

    rerender({ cwd: '/project/b' })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    expect(mockReadDirectoryTree).toHaveBeenCalledTimes(2)
    expect(mockReadDirectoryTree).toHaveBeenLastCalledWith('/project/b', expect.any(Number))
  })

  it('does not fetch when cwd is empty string', async () => {
    renderHook(() => useFileTree(''))

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    expect(mockReadDirectoryTree).not.toHaveBeenCalled()
  })
})

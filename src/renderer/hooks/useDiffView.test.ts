import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDiffView } from './useDiffView'
import type { FileDiff, DiffLine } from '@/types/diff'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createDiffLine(overrides: Partial<DiffLine> = {}): DiffLine {
  return {
    type: 'unchanged',
    content: 'code',
    oldLineNum: 1,
    newLineNum: 1,
    ...overrides,
  }
}

function createFileDiff(overrides: Partial<FileDiff> = {}): FileDiff {
  return {
    filePath: 'src/test.ts',
    oldContent: 'old',
    newContent: 'new',
    lines: [createDiffLine()],
    additions: 1,
    deletions: 0,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useDiffView', () => {
  it('returns initial state: closed', () => {
    const { result } = renderHook(() => useDiffView())

    expect(result.current.state.isOpen).toBe(false)
    expect(result.current.state.diffs).toEqual([])
    expect(result.current.state.selectedFileIndex).toBe(0)
    expect(result.current.state.status).toBe('reviewing')
  })

  it('showDiff(diffs) opens view with the provided diffs', () => {
    const { result } = renderHook(() => useDiffView())
    const diffs = [createFileDiff({ filePath: 'src/a.ts' })]

    act(() => {
      result.current.showDiff(diffs)
    })

    expect(result.current.state.isOpen).toBe(true)
    expect(result.current.state.diffs).toEqual(diffs)
    expect(result.current.state.selectedFileIndex).toBe(0)
    expect(result.current.state.status).toBe('reviewing')
  })

  it('accept() sets status to "accepted" and closes the view', () => {
    const { result } = renderHook(() => useDiffView())
    const diffs = [createFileDiff()]

    act(() => {
      result.current.showDiff(diffs)
    })
    expect(result.current.state.isOpen).toBe(true)

    act(() => {
      result.current.accept()
    })

    expect(result.current.state.status).toBe('accepted')
    expect(result.current.state.isOpen).toBe(false)
  })

  it('reject() sets status to "rejected" and closes the view', () => {
    const { result } = renderHook(() => useDiffView())
    const diffs = [createFileDiff()]

    act(() => {
      result.current.showDiff(diffs)
    })

    act(() => {
      result.current.reject()
    })

    expect(result.current.state.status).toBe('rejected')
    expect(result.current.state.isOpen).toBe(false)
  })

  it('selectFile(index) switches the selected file index', () => {
    const { result } = renderHook(() => useDiffView())
    const diffs = [
      createFileDiff({ filePath: 'src/a.ts' }),
      createFileDiff({ filePath: 'src/b.ts' }),
    ]

    act(() => {
      result.current.showDiff(diffs)
    })
    expect(result.current.state.selectedFileIndex).toBe(0)

    act(() => {
      result.current.selectFile(1)
    })
    expect(result.current.state.selectedFileIndex).toBe(1)
  })

  it('multiple files are navigable via selectFile', () => {
    const { result } = renderHook(() => useDiffView())
    const diffs = [
      createFileDiff({ filePath: 'a.ts' }),
      createFileDiff({ filePath: 'b.ts' }),
      createFileDiff({ filePath: 'c.ts' }),
    ]

    act(() => {
      result.current.showDiff(diffs)
    })

    act(() => {
      result.current.selectFile(2)
    })
    expect(result.current.state.selectedFileIndex).toBe(2)

    act(() => {
      result.current.selectFile(0)
    })
    expect(result.current.state.selectedFileIndex).toBe(0)
  })

  it('status updates correctly on accept after reject', () => {
    const { result } = renderHook(() => useDiffView())

    // First show + reject
    act(() => {
      result.current.showDiff([createFileDiff()])
    })
    act(() => {
      result.current.reject()
    })
    expect(result.current.state.status).toBe('rejected')

    // Show again + accept
    act(() => {
      result.current.showDiff([createFileDiff()])
    })
    // showDiff resets status to reviewing
    expect(result.current.state.status).toBe('reviewing')

    act(() => {
      result.current.accept()
    })
    expect(result.current.state.status).toBe('accepted')
  })

  it('close() closes the view without changing status', () => {
    const { result } = renderHook(() => useDiffView())

    act(() => {
      result.current.showDiff([createFileDiff()])
    })
    expect(result.current.state.isOpen).toBe(true)
    expect(result.current.state.status).toBe('reviewing')

    act(() => {
      result.current.close()
    })
    expect(result.current.state.isOpen).toBe(false)
    // Status stays reviewing (no accept/reject decision was made)
    expect(result.current.state.status).toBe('reviewing')
  })

  it('selectFile clamps to valid range', () => {
    const { result } = renderHook(() => useDiffView())
    const diffs = [
      createFileDiff({ filePath: 'a.ts' }),
      createFileDiff({ filePath: 'b.ts' }),
    ]

    act(() => {
      result.current.showDiff(diffs)
    })

    // Try out of bounds
    act(() => {
      result.current.selectFile(10)
    })
    // Should clamp to last valid index
    expect(result.current.state.selectedFileIndex).toBe(1)

    act(() => {
      result.current.selectFile(-1)
    })
    // Should clamp to 0
    expect(result.current.state.selectedFileIndex).toBe(0)
  })

  it('uses immutable state updates', () => {
    const { result } = renderHook(() => useDiffView())

    const stateBefore = result.current.state

    act(() => {
      result.current.showDiff([createFileDiff()])
    })

    const stateAfter = result.current.state

    // References should differ (immutable)
    expect(stateBefore).not.toBe(stateAfter)
  })
})

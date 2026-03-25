import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFilePreview } from './useFilePreview'

// ---------------------------------------------------------------------------
// Mock electronAPI
// ---------------------------------------------------------------------------

const mockReadFile = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  const w = window as unknown as Record<string, unknown>
  w.electronAPI = {
    ...(w.electronAPI as object),
    readFile: mockReadFile,
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useFilePreview', () => {
  it('initial state is closed', () => {
    const { result } = renderHook(() => useFilePreview())

    expect(result.current.state.isOpen).toBe(false)
    expect(result.current.state.filePath).toBeNull()
    expect(result.current.state.content).toBeNull()
    expect(result.current.state.language).toBeNull()
    expect(result.current.state.isLoading).toBe(false)
    expect(result.current.state.error).toBeNull()
  })

  it('openFile loads content via IPC', async () => {
    mockReadFile.mockResolvedValue({
      content: 'const x = 1',
      size: 11,
    })

    const { result } = renderHook(() => useFilePreview())

    await act(async () => {
      await result.current.openFile('/project/src/index.ts')
    })

    expect(mockReadFile).toHaveBeenCalledWith('/project/src/index.ts')
    expect(result.current.state.content).toBe('const x = 1')
    expect(result.current.state.fileSize).toBe(11)
    expect(result.current.state.isOpen).toBe(true)
  })

  it('openFile sets loading state then resolves to content', async () => {
    let resolvePromise: (value: { content: string; size: number }) => void
    mockReadFile.mockReturnValue(
      new Promise(resolve => { resolvePromise = resolve }),
    )

    const { result } = renderHook(() => useFilePreview())

    // Start opening the file
    let openPromise: Promise<void>
    act(() => {
      openPromise = result.current.openFile('/project/src/index.ts')
    })

    // Should be loading
    expect(result.current.state.isLoading).toBe(true)
    expect(result.current.state.isOpen).toBe(true)

    // Resolve the promise
    await act(async () => {
      resolvePromise!({ content: 'hello', size: 5 })
      await openPromise!
    })

    expect(result.current.state.isLoading).toBe(false)
    expect(result.current.state.content).toBe('hello')
  })

  it('openFile with error sets error state', async () => {
    mockReadFile.mockRejectedValue(new Error('Permission denied'))

    const { result } = renderHook(() => useFilePreview())

    await act(async () => {
      await result.current.openFile('/root/secret.txt')
    })

    expect(result.current.state.error).toBe('Permission denied')
    expect(result.current.state.isLoading).toBe(false)
    expect(result.current.state.content).toBeNull()
  })

  it('close clears state', async () => {
    mockReadFile.mockResolvedValue({ content: 'hello', size: 5 })

    const { result } = renderHook(() => useFilePreview())

    await act(async () => {
      await result.current.openFile('/project/src/index.ts')
    })

    expect(result.current.state.isOpen).toBe(true)

    act(() => {
      result.current.close()
    })

    expect(result.current.state.isOpen).toBe(false)
    expect(result.current.state.filePath).toBeNull()
    expect(result.current.state.content).toBeNull()
    expect(result.current.state.language).toBeNull()
    expect(result.current.state.error).toBeNull()
  })

  it('detects language from filename', async () => {
    mockReadFile.mockResolvedValue({ content: 'body {}', size: 7 })

    const { result } = renderHook(() => useFilePreview())

    await act(async () => {
      await result.current.openFile('/project/styles.css')
    })

    expect(result.current.state.language).toBe('css')
  })

  it('detects typescript for .ts files', async () => {
    mockReadFile.mockResolvedValue({ content: 'const x = 1', size: 11 })

    const { result } = renderHook(() => useFilePreview())

    await act(async () => {
      await result.current.openFile('/project/index.ts')
    })

    expect(result.current.state.language).toBe('typescript')
  })

  it('caches recently opened files (last 5)', async () => {
    mockReadFile.mockImplementation((path: string) =>
      Promise.resolve({ content: `content of ${path}`, size: 10 }),
    )

    const { result } = renderHook(() => useFilePreview())

    // Open 5 files
    for (let i = 1; i <= 5; i++) {
      await act(async () => {
        await result.current.openFile(`/project/file${i}.ts`)
      })
    }

    expect(mockReadFile).toHaveBeenCalledTimes(5)

    // Reopen file1 — should come from cache, no new IPC call
    mockReadFile.mockClear()
    await act(async () => {
      await result.current.openFile('/project/file1.ts')
    })

    expect(mockReadFile).not.toHaveBeenCalled()
    expect(result.current.state.content).toBe('content of /project/file1.ts')
  })

  it('evicts oldest entry when cache exceeds 5', async () => {
    mockReadFile.mockImplementation((path: string) =>
      Promise.resolve({ content: `content of ${path}`, size: 10 }),
    )

    const { result } = renderHook(() => useFilePreview())

    // Open 6 files — file1 should be evicted from cache
    for (let i = 1; i <= 6; i++) {
      await act(async () => {
        await result.current.openFile(`/project/file${i}.ts`)
      })
    }

    // file1 was evicted, reopening should trigger IPC
    mockReadFile.mockClear()
    await act(async () => {
      await result.current.openFile('/project/file1.ts')
    })

    expect(mockReadFile).toHaveBeenCalledWith('/project/file1.ts')
  })

  it('setScrollPosition updates position', async () => {
    mockReadFile.mockResolvedValue({ content: 'hello', size: 5 })

    const { result } = renderHook(() => useFilePreview())

    await act(async () => {
      await result.current.openFile('/project/index.ts')
    })

    act(() => {
      result.current.setScrollPosition(150)
    })

    expect(result.current.state.scrollPosition).toBe(150)
  })

  it('sets fileName from the path', async () => {
    mockReadFile.mockResolvedValue({ content: 'hello', size: 5 })

    const { result } = renderHook(() => useFilePreview())

    await act(async () => {
      await result.current.openFile('/project/src/utils/helpers.ts')
    })

    expect(result.current.state.fileName).toBe('helpers.ts')
  })

  it('computes lineCount from content', async () => {
    mockReadFile.mockResolvedValue({
      content: 'line1\nline2\nline3\nline4',
      size: 23,
    })

    const { result } = renderHook(() => useFilePreview())

    await act(async () => {
      await result.current.openFile('/project/index.ts')
    })

    expect(result.current.state.lineCount).toBe(4)
  })
})

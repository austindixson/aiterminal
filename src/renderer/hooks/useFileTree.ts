import { useState, useCallback, useEffect, useRef } from 'react'
import type { FileEntry } from '@/types/file-tree'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 300
const DEFAULT_DEPTH = 2

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseFileTreeReturn {
  readonly entries: ReadonlyArray<FileEntry>
  readonly isVisible: boolean
  readonly showHidden: boolean
  readonly expandedPaths: ReadonlySet<string>
  readonly selectedPath: string | null
  readonly toggleVisible: () => void
  readonly toggleHidden: () => void
  readonly expandPath: (path: string) => void
  readonly collapsePath: (path: string) => void
  readonly selectFile: (path: string) => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFileTree(cwd: string): UseFileTreeReturn {
  const [entries, setEntries] = useState<ReadonlyArray<FileEntry>>([])
  const [isVisible, setIsVisible] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(new Set())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch directory tree with debounce when cwd changes
  useEffect(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
    }

    if (cwd === '') {
      return
    }

    timerRef.current = setTimeout(async () => {
      try {
        const result = await window.electronAPI.readDirectoryTree(cwd, DEFAULT_DEPTH)
        setEntries(result)
      } catch {
        setEntries([])
      }
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [cwd])

  const toggleVisible = useCallback(() => {
    setIsVisible(prev => !prev)
  }, [])

  const toggleHidden = useCallback(() => {
    setShowHidden(prev => !prev)
  }, [])

  const expandPath = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev)
      next.add(path)
      return next
    })
  }, [])

  const collapsePath = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev)
      next.delete(path)
      return next
    })
  }, [])

  const selectFile = useCallback((path: string) => {
    setSelectedPath(path)
  }, [])

  return {
    entries,
    isVisible,
    showHidden,
    expandedPaths,
    selectedPath,
    toggleVisible,
    toggleHidden,
    expandPath,
    collapsePath,
    selectFile,
  }
}

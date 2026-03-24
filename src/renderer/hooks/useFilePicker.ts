/**
 * useFilePicker — React hook managing the file picker state for @mentions.
 *
 * Provides open/close, search with debounce, keyboard navigation,
 * and file selection. Delegates search to the file-context-service.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { FilePickerState, FilePickerResult } from '@/types/file-context'
import { searchFiles } from '@/file-context/file-context-service'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 150

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseFilePickerReturn {
  readonly state: FilePickerState
  readonly open: (query: string) => void
  readonly setQuery: (query: string) => void
  readonly selectNext: () => void
  readonly selectPrev: () => void
  readonly select: () => FilePickerResult | null
  readonly dismiss: () => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFilePicker(cwd: string): UseFilePickerReturn {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQueryState] = useState('')
  const [results, setResults] = useState<ReadonlyArray<FilePickerResult>>([])
  const [selectedIndex, setSelectedIndex] = useState(0)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep refs for synchronous reads in select()
  const resultsRef = useRef(results)
  const selectedIndexRef = useRef(selectedIndex)

  // Sync refs after every render
  useEffect(() => {
    resultsRef.current = results
    selectedIndexRef.current = selectedIndex
  })

  // Perform debounced search
  const performSearch = useCallback(
    (searchQuery: string) => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current)
      }

      debounceRef.current = setTimeout(async () => {
        const searchResults = await searchFiles(searchQuery, cwd)
        setResults(searchResults)
        setSelectedIndex(0)
        debounceRef.current = null
      }, DEBOUNCE_MS)
    },
    [cwd],
  )

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  const open = useCallback(
    (initialQuery: string) => {
      setIsOpen(true)
      setQueryState(initialQuery)
      setResults([])
      setSelectedIndex(0)
      performSearch(initialQuery)
    },
    [performSearch],
  )

  const setQuery = useCallback(
    (newQuery: string) => {
      setQueryState(newQuery)
      performSearch(newQuery)
    },
    [performSearch],
  )

  const selectNext = useCallback(() => {
    setSelectedIndex((prev) => {
      const len = resultsRef.current.length
      if (len === 0) return 0
      return (prev + 1) % len
    })
  }, [])

  const selectPrev = useCallback(() => {
    setSelectedIndex((prev) => {
      const len = resultsRef.current.length
      if (len === 0) return 0
      return (prev - 1 + len) % len
    })
  }, [])

  const select = useCallback((): FilePickerResult | null => {
    const currentResults = resultsRef.current
    const currentIndex = selectedIndexRef.current

    if (!currentResults || currentResults.length === 0) {
      return null
    }

    const chosen = currentResults[currentIndex] ?? null

    // Close and reset
    setIsOpen(false)
    setQueryState('')
    setResults([])
    setSelectedIndex(0)

    return chosen
  }, [])

  const dismiss = useCallback(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    setIsOpen(false)
    setQueryState('')
    setResults([])
    setSelectedIndex(0)
  }, [])

  const state: FilePickerState = {
    isOpen,
    query,
    results,
    selectedIndex,
  }

  return {
    state,
    open,
    setQuery,
    selectNext,
    selectPrev,
    select,
    dismiss,
  }
}

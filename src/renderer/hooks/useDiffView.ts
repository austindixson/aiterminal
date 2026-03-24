/**
 * useDiffView — React hook managing the Diff View panel state.
 *
 * Provides open/close, accept/reject, and file selection for
 * reviewing AI-proposed code changes as inline diffs.
 */

import { useState, useCallback, useMemo } from 'react'
import type { DiffViewState, FileDiff } from '@/types/diff'

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseDiffViewReturn {
  readonly state: DiffViewState
  readonly showDiff: (diffs: ReadonlyArray<FileDiff>) => void
  readonly accept: () => void
  readonly reject: () => void
  readonly selectFile: (index: number) => void
  readonly close: () => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDiffView(): UseDiffViewReturn {
  const [isOpen, setIsOpen] = useState(false)
  const [diffs, setDiffs] = useState<ReadonlyArray<FileDiff>>([])
  const [selectedFileIndex, setSelectedFileIndex] = useState(0)
  const [status, setStatus] = useState<'reviewing' | 'accepted' | 'rejected'>('reviewing')

  const showDiff = useCallback((newDiffs: ReadonlyArray<FileDiff>) => {
    setDiffs(newDiffs)
    setSelectedFileIndex(0)
    setStatus('reviewing')
    setIsOpen(true)
  }, [])

  const accept = useCallback(() => {
    setStatus('accepted')
    setIsOpen(false)
  }, [])

  const reject = useCallback(() => {
    setStatus('rejected')
    setIsOpen(false)
  }, [])

  const selectFile = useCallback(
    (index: number) => {
      setDiffs((currentDiffs) => {
        const clamped = Math.max(0, Math.min(index, currentDiffs.length - 1))
        setSelectedFileIndex(clamped)
        return currentDiffs
      })
    },
    [],
  )

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  const state: DiffViewState = useMemo(
    () => ({
      isOpen,
      diffs,
      selectedFileIndex,
      status,
    }),
    [isOpen, diffs, selectedFileIndex, status],
  )

  return {
    state,
    showDiff,
    accept,
    reject,
    selectFile,
    close,
  }
}

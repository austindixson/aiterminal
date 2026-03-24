/**
 * useCmdK — React hook managing the Cmd+K inline AI bar state.
 *
 * Provides open/close/toggle, query management, AI submission with
 * [RUN] tag auto-execution, and a history ring buffer (last 20 entries).
 */

import { useState, useCallback, useMemo, useRef } from 'react'
import type { CmdKState, CmdKResult, CmdKHistoryEntry } from '@/types/cmd-k'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_HISTORY = 20

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Parse [RUN]command[/RUN] tags from AI response content.
 * Returns parsed command and cleaned content, or null if no tag found.
 */
function parseAutoRun(
  content: string,
): { command: string; cleanContent: string } | null {
  const match = content.match(/\[RUN\](.*?)\[\/RUN\]/s)
  if (!match) return null
  const command = match[1].trim()
  const cleanContent = content.replace(/\[RUN\].*?\[\/RUN\]/s, '').trim()
  return { command, cleanContent }
}

/**
 * Build a CmdKResult from the AI response content.
 * Detects [RUN] tags for command results, otherwise returns explanation.
 */
function buildResult(content: string, autoExecuted: boolean): CmdKResult {
  const autoRun = parseAutoRun(content)

  if (autoRun) {
    return {
      type: 'command',
      content: autoRun.cleanContent || `Executed: ${autoRun.command}`,
      command: autoRun.command,
      isAutoExecuted: autoExecuted,
    }
  }

  return {
    type: 'explanation',
    content,
  }
}

/**
 * Build an error CmdKResult.
 */
function buildErrorResult(error: unknown): CmdKResult {
  const message =
    error instanceof Error ? error.message : 'An unknown error occurred.'
  return {
    type: 'error',
    content: message,
  }
}

/**
 * Append an entry to the history ring buffer, capping at MAX_HISTORY.
 */
function appendHistory(
  history: ReadonlyArray<CmdKHistoryEntry>,
  entry: CmdKHistoryEntry,
): ReadonlyArray<CmdKHistoryEntry> {
  const next = [...history, entry]
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseCmdKReturn {
  readonly state: CmdKState
  readonly open: () => void
  readonly close: () => void
  readonly toggle: () => void
  readonly setQuery: (query: string) => void
  readonly submit: () => Promise<void>
  readonly navigateHistory: (direction: -1 | 1) => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCmdK(): UseCmdKReturn {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQueryState] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<CmdKResult | null>(null)
  const [history, setHistory] = useState<ReadonlyArray<CmdKHistoryEntry>>([])

  // Ref to always have access to the latest query value in async callbacks
  const queryRef = useRef(query)
  queryRef.current = query

  // History navigation index: -1 means "not navigating"
  const historyIndexRef = useRef(-1)

  const open = useCallback(() => {
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setQueryState('')
    setResult(null)
    historyIndexRef.current = -1
  }, [])

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      if (prev) {
        // Closing: reset state
        setQueryState('')
        setResult(null)
        historyIndexRef.current = -1
      }
      return !prev
    })
  }, [])

  const setQuery = useCallback((q: string) => {
    setQueryState(q)
    historyIndexRef.current = -1
  }, [])

  const submit = useCallback(async () => {
    const currentQuery = queryRef.current.trim()
    if (currentQuery.length === 0) return

    setIsProcessing(true)

    try {
      const hasElectronAPI =
        typeof window !== 'undefined' && 'electronAPI' in window

      if (!hasElectronAPI) {
        setResult(buildErrorResult(new Error('Electron API not available.')))
        return
      }

      const response = await window.electronAPI.aiQuery({
        prompt: currentQuery,
        taskType: 'general',
      })

      const content = response.content ?? ''
      const autoRun = parseAutoRun(content)
      const cmdResult = buildResult(content, !!autoRun)

      // Auto-execute if [RUN] tag found
      if (autoRun && autoRun.command) {
        window.electronAPI.writeToPty(autoRun.command + '\r')
      }

      setResult(cmdResult)

      // Add to history
      const entry: CmdKHistoryEntry = {
        query: currentQuery,
        result: cmdResult,
        timestamp: Date.now(),
      }
      setHistory((prev) => appendHistory(prev, entry))
    } catch (error: unknown) {
      setResult(buildErrorResult(error))
    } finally {
      setIsProcessing(false)
      historyIndexRef.current = -1
    }
  }, [])

  const navigateHistory = useCallback(
    (direction: -1 | 1) => {
      setHistory((currentHistory) => {
        if (currentHistory.length === 0) return currentHistory

        const currentIndex = historyIndexRef.current
        let newIndex: number

        if (direction === -1) {
          // Going back (up arrow)
          if (currentIndex === -1) {
            // Start from the end (most recent)
            newIndex = currentHistory.length - 1
          } else {
            newIndex = Math.max(0, currentIndex - 1)
          }
        } else {
          // Going forward (down arrow)
          if (currentIndex === -1) return currentHistory
          newIndex = Math.min(currentHistory.length - 1, currentIndex + 1)
        }

        historyIndexRef.current = newIndex
        const entry = currentHistory[newIndex]
        if (entry) {
          setQueryState(entry.query)
        }

        return currentHistory
      })
    },
    [],
  )

  const state: CmdKState = useMemo(
    () => ({
      isOpen,
      query,
      isProcessing,
      result,
      history,
    }),
    [isOpen, query, isProcessing, result, history],
  )

  return {
    state,
    open,
    close,
    toggle,
    setQuery,
    submit,
    navigateHistory,
  }
}

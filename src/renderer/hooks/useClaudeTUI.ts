/**
 * useClaudeTUI — React hook managing Claude Code CLI TUI detection and capture.
 *
 * Detects when Claude Code CLI is active (alternate screen + "Claude" in output),
 * captures TUI content, and provides parsed output for rendering.
 */

import { useState, useCallback, useEffect } from 'react'
import type { ClaudeTUIOutput, ClaudeCursorSnippet } from '@/types/chat'

interface ClaudeTUIState {
  readonly isClaudeMode: boolean
  readonly activeSessionId: string | null
  readonly capturedOutput: ClaudeTUIOutput | null
  readonly parsedSnippets: ReadonlyArray<ClaudeCursorSnippet>
}

export interface UseClaudeTUIReturn {
  readonly state: ClaudeTUIState
  readonly startCapture: (sessionId: string) => Promise<void>
  readonly stopCapture: (sessionId: string) => Promise<void>
  readonly clearOutput: () => void
  readonly detectClaudeMode: (ptyOutput: string, sessionId: string) => boolean
}

// Pattern to detect Claude Code in PTY output
const CLAUDE_TUI_PATTERNS = [
  /\x1b\[\?1049h/, // Alternate screen buffer
  /Claude Code/i,
  /Welcome back\b.*\bClaude\b/i,
  /\bSonnet\b.*\b(?:high|low|medium)\s+effort/i,
]

// Cursor marker in Claude output
const CURSOR_MARKER = '█'

/**
 * Parse Claude TUI output to extract code snippets with cursor positions
 */
function parseClaudeOutput(output: string): ReadonlyArray<ClaudeCursorSnippet> {
  const snippets: ClaudeCursorSnippet[] = []

  // Split by lines and look for code blocks
  const lines = output.split('\n')
  let currentBlock: string[] = []
  let inCodeBlock = false
  let cursorLine = 0
  let language = 'text'

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Detect code block markers (```)
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // End of code block
        if (currentBlock.length > 0) {
          snippets.push({
            code: currentBlock.join('\n'),
            language,
            cursorLine,
          })
        }
        currentBlock = []
        inCodeBlock = false
        cursorLine = 0
      } else {
        // Start of code block
        inCodeBlock = true
        // Extract language from ```language or ```filename pattern
        const langMatch = line.match(/```(\w+)?/);
        language = langMatch?.[1] || 'text';
      }
      continue
    }

    if (inCodeBlock) {
      // Check for cursor marker in this line
      if (line.includes(CURSOR_MARKER)) {
        cursorLine = currentBlock.length + 1
        // Remove cursor marker for clean display
        currentBlock.push(line.replace(CURSOR_MARKER, '').trimEnd())
      } else {
        currentBlock.push(line)
      }
    }
  }

  // Handle unclosed code block (still capturing)
  if (inCodeBlock && currentBlock.length > 0) {
    snippets.push({
      code: currentBlock.join('\n'),
      language,
      cursorLine,
    })
  }

  return snippets
}

/**
 * Clean ANSI escape codes from PTY output
 */
function cleanAnsiCodes(output: string): string {
  // Remove ANSI escape sequences
  return output.replace(/\x1b\[[0-9;]*[mGKH]/g, '')
    .replace(/\x1b\[\?1049[hl]/g, '') // Alternate screen buffer
    .replace(/\x1b\[[0-9]*;[0-9]*H/g, '') // Cursor positioning
    .replace(/\x1b\[2J/g, '') // Clear screen
    .replace(/\x1b\[K/g, '') // Clear line
    .trim()
}

export function useClaudeTUI(): UseClaudeTUIReturn {
  const [isClaudeMode, setIsClaudeMode] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [capturedOutput, setCapturedOutput] = useState<ClaudeTUIOutput | null>(null)
  const [parsedSnippets, setParsedSnippets] = useState<ReadonlyArray<ClaudeCursorSnippet>>([])

  const startCapture = useCallback(async (sessionId: string) => {
    const api = window.electronAPI
    if (!api?.startTuiCapture) return

    try {
      await api.startTuiCapture(sessionId)
      setActiveSessionId(sessionId)
    } catch (error) {
      console.error('[useClaudeTUI] Failed to start capture:', error)
    }
  }, [])

  const stopCapture = useCallback(async (sessionId: string) => {
    const api = window.electronAPI
    if (!api?.stopTuiCapture) return

    try {
      await api.stopTuiCapture(sessionId)
      if (activeSessionId === sessionId) {
        setActiveSessionId(null)
        setIsClaudeMode(false)
      }
    } catch (error) {
      console.error('[useClaudeTUI] Failed to stop capture:', error)
    }
  }, [activeSessionId])

  const clearOutput = useCallback(() => {
    setCapturedOutput(null)
    setParsedSnippets([])
  }, [])

  const detectClaudeMode = useCallback((ptyOutput: string, sessionId: string): boolean => {
    // Check if any Claude TUI pattern matches
    const isClaude = CLAUDE_TUI_PATTERNS.some(pattern => pattern.test(ptyOutput))

    if (isClaude && !isClaudeMode) {
      setIsClaudeMode(true)
      setActiveSessionId(sessionId)
      void startCapture(sessionId)
    }

    // Detect Claude exit (alternate screen buffer disabled)
    if (ptyOutput.includes('\x1b[?1049l') && isClaudeMode) {
      setIsClaudeMode(false)
      void stopCapture(sessionId)
    }

    return isClaude
  }, [isClaudeMode, startCapture, stopCapture])

  // Listen for TUI content updates
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.onTuiContentUpdated || !activeSessionId) return

    const unsubscribe = api.onTuiContentUpdated((data) => {
      if (data.sessionId === activeSessionId) {
        const cleaned = cleanAnsiCodes(data.content)
        const snippets = parseClaudeOutput(cleaned)

        setCapturedOutput({
          sessionId: data.sessionId,
          content: cleaned,
          timestamp: data.timestamp,
          isActive: true,
        })

        setParsedSnippets(snippets)
      }
    })

    return unsubscribe
  }, [activeSessionId])

  const state: ClaudeTUIState = {
    isClaudeMode,
    activeSessionId,
    capturedOutput,
    parsedSnippets,
  }

  return {
    state,
    startCapture,
    stopCapture,
    clearOutput,
    detectClaudeMode,
  }
}

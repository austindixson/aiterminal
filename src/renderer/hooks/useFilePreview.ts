/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/hooks/useFilePreview.ts
 * Module: renderer/hooks
 * Purpose: File preview state management with LRU cache and scroll position tracking
 * Dependencies: react, @/types/file-preview, @/file-preview/syntax-highlighter
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/components/FilePreview.tsx, /Users/ghost/Desktop/aiterminal/src/file-preview/syntax-highlighter.ts
 * Keywords: file-preview, lru-cache, scroll-position, language-detection
 * Last Updated: 2026-03-24
 */

import { useState, useCallback, useRef } from 'react'
import type { FilePreviewState } from '@/types/file-preview'
import { detectLanguage } from '@/file-preview/syntax-highlighter'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_MAX_SIZE = 5

// ---------------------------------------------------------------------------
// Cache entry
// ---------------------------------------------------------------------------

interface CacheEntry {
  readonly content: string
  readonly size: number
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const INITIAL_STATE: FilePreviewState = {
  isOpen: false,
  filePath: null,
  fileName: null,
  content: null,
  language: null,
  isLoading: false,
  error: null,
  lineCount: 0,
  fileSize: 0,
  scrollPosition: 0,
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseFilePreviewReturn {
  readonly state: FilePreviewState
  readonly openFile: (path: string) => Promise<void>
  readonly close: () => void
  readonly setScrollPosition: (position: number) => void
}

export function useFilePreview(): UseFilePreviewReturn {
  const [state, setState] = useState<FilePreviewState>(INITIAL_STATE)

  // LRU cache: Map preserves insertion order; oldest entries are first
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map())

  const openFile = useCallback(async (filePath: string): Promise<void> => {
    const fileName = filePath.split('/').pop() ?? filePath
    const language = detectLanguage(fileName)

    // Check cache first
    const cache = cacheRef.current
    const cached = cache.get(filePath)

    if (cached !== undefined) {
      // Move to end (most recently used)
      cache.delete(filePath)
      cache.set(filePath, cached)

      const lineCount = cached.content.split('\n').length

      setState({
        isOpen: true,
        filePath,
        fileName,
        content: cached.content,
        language,
        isLoading: false,
        error: null,
        lineCount,
        fileSize: cached.size,
        scrollPosition: 0,
      })
      return
    }

    // Set loading state
    setState(prev => ({
      ...prev,
      isOpen: true,
      filePath,
      fileName,
      language,
      isLoading: true,
      error: null,
      content: null,
    }))

    try {
      const result = await window.electronAPI.readFile(filePath)
      const lineCount = result.content.split('\n').length

      // Add to cache
      cache.set(filePath, { content: result.content, size: result.size })

      // Evict oldest if over max size
      if (cache.size > CACHE_MAX_SIZE) {
        const oldestKey = cache.keys().next().value
        if (oldestKey !== undefined) {
          cache.delete(oldestKey)
        }
      }

      setState({
        isOpen: true,
        filePath,
        fileName,
        content: result.content,
        language,
        isLoading: false,
        error: null,
        lineCount,
        fileSize: result.size,
        scrollPosition: 0,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to read file'

      setState(prev => ({
        ...prev,
        isLoading: false,
        error: message,
        content: null,
      }))
    }
  }, [])

  const close = useCallback(() => {
    setState(INITIAL_STATE)
  }, [])

  const setScrollPosition = useCallback((position: number) => {
    setState(prev => ({ ...prev, scrollPosition: position }))
  }, [])

  return { state, openFile, close, setScrollPosition }
}

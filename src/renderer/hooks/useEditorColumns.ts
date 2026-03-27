/**
 * useEditorColumns — React hook managing multiple editor columns with file tabs.
 *
 * Manages editor column lifecycle, tab operations, and keyboard shortcuts for
 * a VSCode-like multi-pane editor experience. Each column has its own set of
 * file tabs that can be moved between columns.
 *
 * Keyboard shortcuts:
 * - Cmd+\: Add new column (split)
 * - Cmd+W: Close active tab in active column
 * - Cmd+Shift+W: Close active column
 * - Cmd+1/2/3/4: Focus column by index
 *
 * Features:
 * - Support 1-4 columns (configurable)
 * - Move tabs between columns
 * - Persistent layout across sessions
 * - Flexible column widths via splitRatio
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import type {
  FileTab,
  EditorColumn,
  ColumnsState,
  PersistedLayout,
} from '@/types/editor-columns'

// Local type for legacy format (not exported)
interface LegacyPersistedLayout {
  readonly columns: ReadonlyArray<{
    readonly id: string
    readonly tabs: ReadonlyArray<{
      readonly id: string
      readonly filePath: string
      readonly title: string
      readonly isActive: boolean
      readonly isModified: boolean
      readonly language?: string
    }>
    readonly activeTabId: string | null
    readonly splitRatio: number | null
  }>
  readonly activeColumnId: string | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_COLUMNS = 4
const MIN_COLUMNS = 1
const STORAGE_KEY = 'aiterminal-editor-layout'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let columnCounter = 0
let tabCounter = 0

function generateColumnId(): string {
  columnCounter += 1
  return `col-${Date.now()}-${columnCounter}`
}

function generateTabId(): string {
  tabCounter += 1
  return `tab-${Date.now()}-${tabCounter}`
}

function getFileName(path: string): string {
  return path.split('/').pop() || path
}

function getLanguageId(path: string): string | undefined {
  const ext = path.split('.').pop()?.toLowerCase()
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    css: 'css',
    scss: 'scss',
    html: 'html',
    json: 'json',
    md: 'markdown',
    sh: 'shellscript',
    zsh: 'shellscript',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    svg: 'xml',
  }
  return ext ? languageMap[ext] : undefined
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseEditorColumnsReturn {
  readonly state: ColumnsState
  readonly addColumn: () => void
  readonly removeColumn: (columnId: string) => void
  readonly addTab: (columnId: string, filePath: string) => void
  readonly closeTab: (columnId: string, tabId: string) => void
  readonly setActiveTab: (columnId: string, tabId: string) => void
  readonly moveTab: (tabId: string, fromColumnId: string, toColumnId: string) => void
  readonly setActiveColumn: (columnId: string) => void
  readonly setSplitRatio: (columnId: string, ratio: number) => void
  readonly setTabModified: (columnId: string, tabId: string, modified: boolean) => void
  readonly saveLayout: () => void
  readonly loadLayout: () => boolean
  readonly clearLayout: () => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEditorColumns(): UseEditorColumnsReturn {
  const [columns, setColumns] = useState<ReadonlyArray<EditorColumn>>([])
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null)
  const isInitializedRef = useRef(false)

  // -------------------------------------------------------------------------
  // Initialize with default layout on mount (if no persisted layout)
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (isInitializedRef.current) return

    // Try to load persisted layout first
    const loaded = loadLayout()

    // If no persisted layout, create single default column
    if (!loaded && columns.length === 0) {
      const defaultColumn: EditorColumn = {
        id: generateColumnId(),
        tabs: [],
        activeTabId: null,
        splitRatio: null,
      }
      setColumns([defaultColumn])
      setActiveColumnId(defaultColumn.id)
    }

    isInitializedRef.current = true
  }, [columns.length])

  // -------------------------------------------------------------------------
  // Add new column
  // -------------------------------------------------------------------------

  const addColumn = useCallback(() => {
    setColumns((prev) => {
      if (prev.length >= MAX_COLUMNS) {
        console.warn(`[useEditorColumns] Maximum columns (${MAX_COLUMNS}) reached`)
        return prev
      }

      const newColumn: EditorColumn = {
        id: generateColumnId(),
        tabs: [],
        activeTabId: null,
        splitRatio: null,
      }

      // Add new column and make it active
      const updated = [...prev, newColumn]
      setActiveColumnId(newColumn.id)
      return updated
    })
  }, [])

  // -------------------------------------------------------------------------
  // Remove column
  // -------------------------------------------------------------------------

  const removeColumn = useCallback(
    (columnId: string) => {
      setColumns((prev) => {
        // Prevent removing last column
        if (prev.length <= MIN_COLUMNS) {
          console.warn('[useEditorColumns] Cannot remove last column')
          return prev
        }

        const columnToRemove = prev.find((c) => c.id === columnId)
        if (!columnToRemove) {
          console.warn('[useEditorColumns] Column not found:', columnId)
          return prev
        }

        // Filter out the column
        const filtered = prev.filter((c) => c.id !== columnId)

        // If we removed the active column, activate another
        if (columnId === activeColumnId) {
          const newActive = filtered[0]
          setActiveColumnId(newActive.id)
        }

        return filtered
      })
    },
    [activeColumnId],
  )

  // -------------------------------------------------------------------------
  // Add tab to column
  // -------------------------------------------------------------------------

  const addTab = useCallback(
    (columnId: string, filePath: string) => {
      setColumns((prev) =>
        prev.map((column) => {
          if (column.id !== columnId) return column

          // Check if tab already exists in this column
          const existingTab = column.tabs.find((t) => t.filePath === filePath)
          if (existingTab) {
            // Just activate the existing tab
            return {
              ...column,
              tabs: column.tabs.map((t) =>
                t.id === existingTab.id ? { ...t, isActive: true } : { ...t, isActive: false },
              ),
              activeTabId: existingTab.id,
            }
          }

          // Create new tab
          const newTab: FileTab = {
            id: generateTabId(),
            filePath,
            title: getFileName(filePath),
            isActive: true,
            isModified: false,
            language: getLanguageId(filePath),
          }

          // Deactivate all other tabs and add new one
          return {
            ...column,
            tabs: [
              ...column.tabs.map((t) => ({ ...t, isActive: false })),
              newTab,
            ],
            activeTabId: newTab.id,
          }
        }),
      )
    },
    [],
  )

  // -------------------------------------------------------------------------
  // Close tab in column
  // -------------------------------------------------------------------------

  const closeTab = useCallback(
    (columnId: string, tabId: string) => {
      setColumns((prev) =>
        prev.map((column) => {
          if (column.id !== columnId) return column

          const filteredTabs = column.tabs.filter((t) => t.id !== tabId)

          // If we closed the active tab, activate another if available
          if (tabId === column.activeTabId && filteredTabs.length > 0) {
            const newActive = filteredTabs[0]
            return {
              ...column,
              tabs: filteredTabs.map((t) =>
                t.id === newActive.id ? { ...t, isActive: true } : { ...t, isActive: false },
              ),
              activeTabId: newActive.id,
            }
          }

          // If no tabs left, activeTabId becomes null
          if (tabId === column.activeTabId && filteredTabs.length === 0) {
            return {
              ...column,
              tabs: [],
              activeTabId: null,
            }
          }

          return {
            ...column,
            tabs: filteredTabs,
          }
        }),
      )
    },
    [],
  )

  // -------------------------------------------------------------------------
  // Set active tab in column
  // -------------------------------------------------------------------------

  const setActiveTab = useCallback((columnId: string, tabId: string) => {
    setColumns((prev) =>
      prev.map((column) => {
        if (column.id !== columnId) return column

        const tabExists = column.tabs.some((t) => t.id === tabId)
        if (!tabExists) {
          console.warn('[useEditorColumns] Tab not found:', tabId)
          return column
        }

        return {
          ...column,
          tabs: column.tabs.map((t) =>
            t.id === tabId ? { ...t, isActive: true } : { ...t, isActive: false },
          ),
          activeTabId: tabId,
        }
      }),
    )
  }, [])

  // -------------------------------------------------------------------------
  // Move tab between columns
  // -------------------------------------------------------------------------

  const moveTab = useCallback(
    (tabId: string, fromColumnId: string, toColumnId: string) => {
      if (fromColumnId === toColumnId) {
        console.warn('[useEditorColumns] Cannot move tab to same column')
        return
      }

      setColumns((prev) => {
        // Find the source column and tab
        const fromColumn = prev.find((c) => c.id === fromColumnId)
        if (!fromColumn) {
          console.warn('[useEditorColumns] Source column not found:', fromColumnId)
          return prev
        }

        const tabToMove = fromColumn.tabs.find((t) => t.id === tabId)
        if (!tabToMove) {
          console.warn('[useEditorColumns] Tab not found:', tabId)
          return prev
        }

        // Create updated columns array
        return prev.map((column) => {
          // Source column: remove the tab
          if (column.id === fromColumnId) {
            const filteredTabs = column.tabs.filter((t) => t.id !== tabId)

            // If we removed the active tab, activate another
            if (tabId === column.activeTabId && filteredTabs.length > 0) {
              const newActive = filteredTabs[0]
              return {
                ...column,
                tabs: filteredTabs.map((t) =>
                  t.id === newActive.id ? { ...t, isActive: true } : { ...t, isActive: false },
                ),
                activeTabId: newActive.id,
              }
            }

            return {
              ...column,
              tabs: filteredTabs,
              activeTabId:
                tabId === column.activeTabId ? null : column.activeTabId,
            }
          }

          // Destination column: add the tab (deactivate others in dest)
          if (column.id === toColumnId) {
            const newTab: FileTab = {
              ...tabToMove,
              isActive: true,
            }

            return {
              ...column,
              tabs: [
                ...column.tabs.map((t) => ({ ...t, isActive: false })),
                newTab,
              ],
              activeTabId: tabId,
            }
          }

          return column
        })
      })
    },
    [],
  )

  // -------------------------------------------------------------------------
  // Set active column
  // -------------------------------------------------------------------------

  const setActiveColumn = useCallback((columnId: string) => {
    setColumns((prev) => {
      const columnExists = prev.some((c) => c.id === columnId)
      if (!columnExists) {
        console.warn('[useEditorColumns] Column not found:', columnId)
        return prev
      }

      setActiveColumnId(columnId)
      return prev
    })
  }, [])

  // -------------------------------------------------------------------------
  // Set column split ratio
  // -------------------------------------------------------------------------

  const setSplitRatio = useCallback((columnId: string, ratio: number) => {
    if (ratio < 0 || ratio > 1) {
      console.warn('[useEditorColumns] Invalid split ratio:', ratio)
      return
    }

    setColumns((prev) =>
      prev.map((column) =>
        column.id === columnId ? { ...column, splitRatio: ratio } : column,
      ),
    )
  }, [])

  // -------------------------------------------------------------------------
  // Set tab modified state
  // -------------------------------------------------------------------------

  const setTabModified = useCallback(
    (columnId: string, tabId: string, modified: boolean) => {
      setColumns((prev) =>
        prev.map((column) => {
          if (column.id !== columnId) return column

          return {
            ...column,
            tabs: column.tabs.map((t) =>
              t.id === tabId ? { ...t, isModified: modified } : t,
            ),
          }
        }),
      )
    },
    [],
  )

  // -------------------------------------------------------------------------
  // Save layout to localStorage
  // -------------------------------------------------------------------------

  const saveLayout = useCallback(() => {
    try {
      const layout: PersistedLayout = {
        version: 1,
        timestamp: Date.now(),
        columns: columns.map((col) => ({
          id: col.id,
          tabs: col.tabs.map((tab) => ({
            id: tab.id,
            filePath: tab.filePath,
            title: tab.title,
            isActive: tab.isActive,
            isModified: tab.isModified,
            language: tab.language,
          })),
          activeTabId: col.activeTabId,
          splitRatio: col.splitRatio,
        })),
        activeColumnId,
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
      console.log('[useEditorColumns] Layout saved successfully')
    } catch (error) {
      console.error('[useEditorColumns] Failed to save layout:', error)
    }
  }, [columns, activeColumnId])

  // -------------------------------------------------------------------------
  // Load layout from localStorage
  // -------------------------------------------------------------------------

  const loadLayout = useCallback((): boolean => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) {
        console.log('[useEditorColumns] No saved layout found')
        return false
      }

      const parsed = JSON.parse(stored)

      // Check if this is a legacy layout (no version field)
      if (!parsed.version) {
        console.log('[useEditorColumns] Migrating legacy layout to version 1')
        return migrateLegacyLayout(parsed as LegacyPersistedLayout)
      }

      // Check version compatibility
      if (parsed.version !== 1) {
        console.warn(
          `[useEditorColumns] Unsupported layout version: ${parsed.version}`,
        )
        return false
      }

      const layout = parsed as PersistedLayout

      // Validate layout structure
      if (!layout.columns || !Array.isArray(layout.columns)) {
        console.warn('[useEditorColumns] Invalid layout: missing or invalid columns')
        return false
      }

      if (layout.columns.length === 0) {
        console.warn('[useEditorColumns] Invalid layout: no columns')
        return false
      }

      if (layout.columns.length > MAX_COLUMNS) {
        console.warn(
          `[useEditorColumns] Layout has ${layout.columns.length} columns, max is ${MAX_COLUMNS}`,
        )
        return false
      }

      // Validate each column
      for (const column of layout.columns) {
        if (!column.id || !Array.isArray(column.tabs)) {
          console.warn('[useEditorColumns] Invalid column structure:', column)
          return false
        }

        // Validate tabs
        for (const tab of column.tabs) {
          if (!tab.id || !tab.filePath || !tab.title) {
            console.warn('[useEditorColumns] Invalid tab structure:', tab)
            return false
          }
        }

        // Validate activeTabId exists in tabs
        if (column.activeTabId) {
          const tabExists = column.tabs.some(
            (t: { id: string }) => t.id === column.activeTabId,
          )
          if (!tabExists) {
            console.warn(
              '[useEditorColumns] Invalid activeTabId:',
              column.activeTabId,
            )
            return false
          }
        }

        // Validate splitRatio
        if (
          column.splitRatio !== null &&
          (typeof column.splitRatio !== 'number' ||
            column.splitRatio < 0 ||
            column.splitRatio > 1)
        ) {
          console.warn('[useEditorColumns] Invalid splitRatio:', column.splitRatio)
          return false
        }
      }

      // Validate activeColumnId exists
      if (layout.activeColumnId) {
        const columnExists = layout.columns.some(
          (c) => c.id === layout.activeColumnId,
        )
        if (!columnExists) {
          console.warn(
            '[useEditorColumns] Invalid activeColumnId:',
            layout.activeColumnId,
          )
          return false
        }
      }

      // Restore columns
      setColumns(layout.columns as EditorColumn[])
      setActiveColumnId(layout.activeColumnId)

      console.log(
        `[useEditorColumns] Layout loaded successfully (${layout.columns.length} column(s), ${layout.timestamp ? new Date(layout.timestamp).toISOString() : 'unknown time'})`,
      )

      return true
    } catch (error) {
      console.error('[useEditorColumns] Failed to load layout:', error)
      return false
    }
  }, [])

  // -------------------------------------------------------------------------
  // Migrate legacy layout (pre-versioning) to version 1
  // -------------------------------------------------------------------------

  const migrateLegacyLayout = useCallback(
    (legacy: LegacyPersistedLayout): boolean => {
      try {
        // Validate legacy structure
        if (!legacy.columns || !Array.isArray(legacy.columns)) {
          console.warn('[useEditorColumns] Invalid legacy layout')
          return false
        }

        // Convert to version 1 format
        const layout: PersistedLayout = {
          version: 1,
          timestamp: Date.now(),
          columns: legacy.columns as any,
          activeColumnId: legacy.activeColumnId,
        }

        // Save the migrated layout
        localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))

        // Restore state
        setColumns(legacy.columns as EditorColumn[])
        setActiveColumnId(legacy.activeColumnId)

        console.log('[useEditorColumns] Legacy layout migrated successfully')
        return true
      } catch (error) {
        console.error('[useEditorColumns] Failed to migrate legacy layout:', error)
        return false
      }
    },
    [],
  )

  // -------------------------------------------------------------------------
  // Clear persisted layout
  // -------------------------------------------------------------------------

  const clearLayout = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (error) {
      console.error('[useEditorColumns] Failed to clear layout:', error)
    }
  }, [])

  // -------------------------------------------------------------------------
  // Keyboard shortcuts
  // -------------------------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey

      // Cmd+\ — add new column (split)
      if (isMeta && e.key === '\\') {
        e.preventDefault()
        addColumn()
        return
      }

      // Cmd+Shift+W — close active column
      if (isMeta && e.shiftKey && e.key === 'w') {
        e.preventDefault()
        if (activeColumnId && columns.length > MIN_COLUMNS) {
          removeColumn(activeColumnId)
        }
        return
      }

      // Cmd+1/2/3/4 — focus column by index
      if (isMeta && /^[1-4]$/.test(e.key)) {
        e.preventDefault()
        const columnIndex = parseInt(e.key) - 1
        const column = columns[columnIndex]
        if (column) {
          setActiveColumn(column.id)
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [addColumn, removeColumn, setActiveColumn, activeColumnId, columns])

  // -------------------------------------------------------------------------
  // Auto-save layout on state changes
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!isInitializedRef.current) return

    // Debounce save to avoid excessive writes
    const timeoutId = setTimeout(() => {
      saveLayout()
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [columns, activeColumnId, saveLayout])

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const state: ColumnsState = useMemo(
    () => ({
      columns,
      activeColumnId,
    }),
    [columns, activeColumnId],
  )

  return {
    state,
    addColumn,
    removeColumn,
    addTab,
    closeTab,
    setActiveTab,
    moveTab,
    setActiveColumn,
    setSplitRatio,
    setTabModified,
    saveLayout,
    loadLayout,
    clearLayout,
  }
}

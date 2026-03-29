/**
 * useTerminalTabs — React hook managing multiple terminal tabs.
 *
 * Manages terminal tab lifecycle, active tab tracking, and session-aware
 * communication with the main process. Each tab has its own PTY session,
 * CWD, and file tree.
 *
 * Keyboard shortcuts:
 * - Cmd+N: Create new tab
 * - Cmd+W: Close active tab (prevents closing last tab)
 * - Cmd+1/2/3...: Switch to tab by index
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import type { TerminalTab, FileTab, Tab, TerminalTabsState, TerminalSessionInfo } from '@/types/terminal-tabs'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_TABS = 10
const DEFAULT_TAB_NAME = navigator.platform?.startsWith('Win') ? 'cmd' : 'zsh'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tabCounter = 0

function generateTabId(): string {
  tabCounter += 1
  return `tab-${Date.now()}-${tabCounter}`
}

function getShellName(shell: string): string {
  // Handle both Unix (/) and Windows (\) path separators
  const name = shell.split(/[/\\]/).pop() || DEFAULT_TAB_NAME
  // Strip .exe suffix on Windows
  return name.replace(/\.exe$/i, '')
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseTerminalTabsReturn {
  readonly state: TerminalTabsState
  readonly createTab: (shell?: string, cwd?: string) => Promise<void>
  readonly closeTab: (tabId: string) => void
  readonly switchTab: (tabId: string) => void
  readonly setActiveTabName: (tabId: string, name: string) => void
  readonly writeToActive: (data: string) => void
  readonly resizeActive: (cols: number, rows: number) => void
  readonly getActiveSessionId: () => string | null
  readonly updateTabAgentActivity: (tabId: string, intern: string, activity: string) => void
  readonly clearTabAgentActivity: (tabId: string) => void
  readonly openFileTab: (filePath: string, content: string, language: string | null) => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTerminalTabs(): UseTerminalTabsReturn {
  const [tabs, setTabs] = useState<ReadonlyArray<Tab>>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const sessionsRef = useRef<Map<string, TerminalSessionInfo>>(new Map())
  const tabToSessionMapRef = useRef<Map<string, string>>(new Map()) // tabId -> sessionId

  // -------------------------------------------------------------------------
  // Create tab
  // -------------------------------------------------------------------------

  const createTab = useCallback(
    async (shell?: string, cwd?: string) => {
      if (tabs.length >= MAX_TABS) {
        console.warn('[useTerminalTabs] Maximum number of tabs reached')
        return
      }

      try {
        const hasElectronAPI =
          typeof window !== 'undefined' &&
          'electronAPI' in window &&
          window.electronAPI?.createTerminalSession

        if (!hasElectronAPI) {
          console.error('[useTerminalTabs] electronAPI not available')
          return
        }

        const result = await window.electronAPI.createTerminalSession(shell, cwd)

        if (!result.success || !result.sessionId) {
          console.error('[useTerminalTabs] Failed to create session:', result.error)
          return
        }

        const { sessionId, ptyPid, shell: sessionShell, cwd: sessionCwd } = result
        const tabId = generateTabId()
        const shellName = getShellName(sessionShell || shell || DEFAULT_TAB_NAME)

        // Subscribe to session data
        const unsubscribe = window.electronAPI.onSessionData(sessionId, (data: string) => {
          // Data will be handled by TerminalView component via session data listener
          // This is just for hook-level bookkeeping if needed
          console.debug(`[useTerminalTabs] Data for session ${sessionId}:`, data.slice(0, 50))
        })

        // Store session info and mapping
        const sessionInfo: TerminalSessionInfo = {
          sessionId,
          ptyPid: ptyPid || 0,
          shell: sessionShell || shell || '',
          cwd: sessionCwd || cwd || '',
          unsubscribe,
        }
        sessionsRef.current.set(sessionId, sessionInfo)
        tabToSessionMapRef.current.set(tabId, sessionId)

        // Create tab
        const newTab: TerminalTab = {
          id: tabId,
          type: 'terminal',
          sessionId,
          name: shellName,
          shell: sessionShell || shell || '',
          cwd: sessionCwd || cwd || '',
          createdAt: Date.now(),
          isActive: true,
        }

        // Deactivate all existing tabs and add new one
        setTabs((prev) =>
          prev.map((t) => ({ ...t, isActive: false })).concat([newTab]),
        )
        setActiveTabId(tabId)
      } catch (error) {
        console.error('[useTerminalTabs] Error creating tab:', error)
      }
    },
    [tabs.length],
  )

  // -------------------------------------------------------------------------
  // Close tab
  // -------------------------------------------------------------------------

  const closeTab = useCallback(
    (tabId: string) => {
      // Prevent closing the last tab
      if (tabs.length <= 1) {
        console.warn('[useTerminalTabs] Cannot close the last tab')
        return
      }

      const tab = tabs.find((t) => t.id === tabId)
      if (!tab) {
        console.warn('[useTerminalTabs] Tab not found:', tabId)
        return
      }

      // Only clean up PTY for terminal tabs
      if (tab.type === 'terminal') {
        const sessionId = tabToSessionMapRef.current.get(tabId)
        if (sessionId) {
          const sessionInfo = sessionsRef.current.get(sessionId)
          if (sessionInfo) {
            sessionInfo.unsubscribe()
            window.electronAPI?.destroyTerminalSession?.(sessionId)
            sessionsRef.current.delete(sessionId)
          }
          tabToSessionMapRef.current.delete(tabId)
        }
      }

      // Remove tab and set new active tab if needed
      setTabs((prev) => {
        const filtered = prev.filter((t) => t.id !== tabId)

        // If we closed the active tab, activate the first remaining tab
        if (tabId === activeTabId && filtered.length > 0) {
          setActiveTabId(filtered[0].id)
          return filtered.map((t) => ({ ...t, isActive: t.id === filtered[0].id }))
        }

        return filtered
      })
    },
    [tabs, activeTabId],
  )

  // -------------------------------------------------------------------------
  // Switch tab
  // -------------------------------------------------------------------------

  const switchTab = useCallback((tabId: string) => {
    setTabs((prev) =>
      prev.map((t) => ({ ...t, isActive: t.id === tabId })),
    )
    setActiveTabId(tabId)
  }, [])

  // -------------------------------------------------------------------------
  // Set active tab name
  // -------------------------------------------------------------------------

  const setActiveTabName = useCallback((tabId: string, name: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, name } : t)),
    )
  }, [])

  // -------------------------------------------------------------------------
  // Write to active tab
  // -------------------------------------------------------------------------

  const writeToActive = useCallback((data: string) => {
    if (!activeTabId) return

    const hasElectronAPI =
      typeof window !== 'undefined' &&
      'electronAPI' in window &&
      window.electronAPI?.writeToSession

    if (!hasElectronAPI) {
      console.error('[useTerminalTabs] electronAPI not available')
      return
    }

    // Find session for active tab using the mapping
    const sessionId = tabToSessionMapRef.current.get(activeTabId)
    if (!sessionId) {
      console.error('[useTerminalTabs] No session found for active tab:', activeTabId)
      return
    }

    window.electronAPI.writeToSession(sessionId, data)
  }, [activeTabId])

  // -------------------------------------------------------------------------
  // Resize active tab
  // -------------------------------------------------------------------------

  const resizeActive = useCallback((cols: number, rows: number) => {
    if (!activeTabId) return

    const hasElectronAPI =
      typeof window !== 'undefined' &&
      'electronAPI' in window &&
      window.electronAPI?.resizeSession

    if (!hasElectronAPI) {
      console.error('[useTerminalTabs] electronAPI not available')
      return
    }

    // Find session for active tab using the mapping
    const sessionId = tabToSessionMapRef.current.get(activeTabId)
    if (!sessionId) {
      console.error('[useTerminalTabs] No session found for active tab:', activeTabId)
      return
    }

    window.electronAPI.resizeSession(sessionId, cols, rows)
  }, [activeTabId])

  // -------------------------------------------------------------------------
  // Get active session ID (returns the actual sessionId from main process)
  // -------------------------------------------------------------------------

  const getActiveSessionId = useCallback((): string | null => {
    if (!activeTabId) return null
    const tab = tabs.find((t) => t.id === activeTabId)
    if (!tab || tab.type !== 'terminal') return null
    return tab.sessionId
  }, [activeTabId, tabs])

  // -------------------------------------------------------------------------
  // Keyboard shortcuts
  // -------------------------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey

      // Cmd+N — create new tab
      if (isMeta && e.key === 'n') {
        e.preventDefault()
        createTab()
        return
      }

      // Cmd+W — close active tab
      if (isMeta && e.key === 'w') {
        e.preventDefault()
        if (activeTabId) {
          closeTab(activeTabId)
        }
        return
      }

      // Cmd+1/2/3... — switch to tab by index
      if (isMeta && /^[1-9]$/.test(e.key)) {
        e.preventDefault()
        const tabIndex = parseInt(e.key) - 1
        const tab = tabs[tabIndex]
        if (tab) {
          switchTab(tab.id)
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [createTab, closeTab, switchTab, activeTabId, tabs])

  // -------------------------------------------------------------------------
  // Create initial tab on mount
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (tabs.length === 0) {
      createTab()
    }
  }, [])

  // -------------------------------------------------------------------------
  // Listen for CWD changes from main process
  // -------------------------------------------------------------------------

  useEffect(() => {
    const hasElectronAPI =
      typeof window !== 'undefined' &&
      'electronAPI' in window &&
      window.electronAPI?.onSessionCwdChanged

    if (!hasElectronAPI) return

    const unsubscribe = window.electronAPI.onSessionCwdChanged((data: { sessionId: string; cwd: string }) => {
      // Find the tab associated with this session
      const tabId = Array.from(tabToSessionMapRef.current.entries())
        .find(([, sessionId]) => sessionId === data.sessionId)?.[0]

      if (tabId) {
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tabId ? { ...t, cwd: data.cwd } : t
          )
        )
      }
    })

    return () => {
      unsubscribe()
    }
  }, [tabs])

  // -------------------------------------------------------------------------
  // Update tab with agent activity (called by AgentMode)
  // -------------------------------------------------------------------------

  const updateTabAgentActivity = useCallback((tabId: string, intern: string, activity: string) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === tabId
          ? { ...t, agentIntern: intern, agentActivity: activity }
          : t
      )
    )
  }, [])

  const clearTabAgentActivity = useCallback((tabId: string) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === tabId
          ? { ...t, agentIntern: undefined, agentActivity: undefined }
          : t
      )
    )
  }, [])

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const activeSessionId = useMemo(() => {
    if (!activeTabId) return null
    const tab = tabs.find((t) => t.id === activeTabId)
    if (!tab || tab.type !== 'terminal') return null
    return tab.sessionId
  }, [tabs, activeTabId])

  const state: TerminalTabsState = useMemo(
    () => ({
      tabs,
      activeTabId,
      activeSessionId,
      sessions: sessionsRef.current,
    }),
    [tabs, activeTabId, activeSessionId],
  )

  // -------------------------------------------------------------------------
  // Open file tab
  // -------------------------------------------------------------------------

  const openFileTab = useCallback(
    (filePath: string, content: string, language: string | null) => {
      // Check if file is already open — switch to it
      const existing = tabs.find((t) => t.type === 'file' && t.filePath === filePath)
      if (existing) {
        setTabs((prev) => prev.map((t) => ({ ...t, isActive: t.id === existing.id })))
        setActiveTabId(existing.id)
        return
      }

      const tabId = generateTabId()
      const fileName = filePath.split('/').pop() || filePath

      const newTab: FileTab = {
        id: tabId,
        type: 'file',
        name: fileName,
        filePath,
        content,
        language,
        createdAt: Date.now(),
        isActive: true,
      }

      setTabs((prev) => [...prev.map((t) => ({ ...t, isActive: false })), newTab])
      setActiveTabId(tabId)
    },
    [tabs],
  )

  return {
    state,
    createTab,
    closeTab,
    switchTab,
    setActiveTabName,
    writeToActive,
    resizeActive,
    getActiveSessionId,
    updateTabAgentActivity,
    clearTabAgentActivity,
    openFileTab,
  }
}

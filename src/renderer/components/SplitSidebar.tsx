/**
 * SplitSidebar — split sidebar with terminal tabs (top) and file tree (bottom)
 *
 * Layout:
 * ┌─────────────────────────┐
 * │ Terminal Tab Bar        │  ← Top (resizable)
 * ├═════════════════════════┤  ← Draggable divider
 * │ File Tree               │  ← Bottom (resizable)
 * └─────────────────────────┘
 *
 * Features:
 * - Drag divider to resize panels
 * - Click tab area → tabs become 2/3
 * - Click file tree → file tree becomes 2/3
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { FC } from 'react'
import type { TerminalTab } from '@/types/terminal-tabs'
import type { FileEntry } from '@/types/file-tree'
import { TerminalTabBar } from './TerminalTabBar'
import { FileTree } from './FileTree'

export interface SplitSidebarProps {
  // Terminal tabs props
  readonly tabs: ReadonlyArray<TerminalTab>
  readonly activeTabId: string | null
  readonly onTabClick: (tabId: string) => void
  readonly onTabClose: (tabId: string) => void
  readonly onNewTab: () => void

  // File tree props
  readonly fileTreeCwd: string
  readonly fileTreeEntries: ReadonlyArray<FileEntry>
  readonly fileTreeVisible: boolean
  readonly onFileTreeToggle: () => void
  readonly onFileTreeSelectFile?: (path: string) => void
  readonly onFileTreeSelectDirectory?: (path: string) => void
  readonly onFileTreeGoToParent?: () => void
}

export const SplitSidebar: FC<SplitSidebarProps> = ({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onNewTab,
  fileTreeCwd,
  fileTreeEntries,
  fileTreeVisible,
  onFileTreeToggle,
  onFileTreeSelectFile,
  onFileTreeSelectDirectory,
  onFileTreeGoToParent,
}) => {
  // Split ratio: 0.5 = 50/50, 0.67 = 2/3 for top, 0.33 = 1/3 for top
  const [splitRatio, setSplitRatio] = useState(0.5)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const splitRatioRef = useRef(splitRatio)

  // Keep ref in sync with state
  useEffect(() => {
    splitRatioRef.current = splitRatio
  }, [splitRatio])

  // Load saved ratio from localStorage on mount
  useEffect(() => {
    try {
      if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
        return
      }
      const saved = localStorage.getItem('sidebar-split-ratio')
      if (saved) {
        const ratio = parseFloat(saved)
        if (!isNaN(ratio) && ratio >= 0.2 && ratio <= 0.8) {
          setSplitRatio(ratio)
        }
      }
    } catch {
      /* ignore (tests / private mode) */
    }
  }, [])

  // Save ratio to localStorage when it changes
  useEffect(() => {
    try {
      if (typeof localStorage === 'undefined' || typeof localStorage.setItem !== 'function') {
        return
      }
      localStorage.setItem('sidebar-split-ratio', String(splitRatio))
    } catch {
      /* ignore */
    }
  }, [splitRatio])

  // Handle divider drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const dividerHeight = 16 // Matches the CSS flex-basis of the divider
      const availableHeight = rect.height - dividerHeight

      const offsetY = e.clientY - rect.top
      // Clamp to available space to avoid divider jumping
      const clampedOffset = Math.max(0, Math.min(availableHeight, offsetY))
      const newRatio = Math.max(0.2, Math.min(0.8, clampedOffset / availableHeight))

      // Update both ref for immediate feedback and state for re-render
      splitRatioRef.current = newRatio
      setSplitRatio(newRatio)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    // Use capture phase for more reliable event handling
    document.addEventListener('mousemove', handleMouseMove, { capture: false })
    document.addEventListener('mouseup', handleMouseUp, { capture: false })

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  // Auto-resize to 2/3 for tabs when clicking tab area (via onTabClick prop)

  const tabsStyle = {
    flexGrow: splitRatio,
    flexShrink: 0,
    flexBasis: '0%',
  }

  const fileTreeStyle = {
    flexGrow: 1 - splitRatio,
    flexShrink: 0,
    flexBasis: '0%',
  }

  return (
    <div className="split-sidebar" ref={containerRef}>
      {/* Terminal tabs section (top) */}
      <div
        className="split-sidebar__tabs"
        style={tabsStyle}
      >
        <TerminalTabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onTabClick={(tabId) => {
            setSplitRatio(0.67) // Tabs get 2/3
            onTabClick(tabId)
          }}
          onTabClose={onTabClose}
          onNewTab={onNewTab}
        />
      </div>

      {/* Draggable divider */}
      <div
        className={`split-sidebar__divider ${isDragging ? 'split-sidebar__divider--dragging' : ''}`}
        onMouseDown={handleMouseDown}
        title="Drag to resize"
      />

      {/* File tree section (bottom) */}
      <div
        className="split-sidebar__file-tree"
        style={fileTreeStyle}
      >
        <FileTree
          cwd={fileTreeCwd}
          entries={fileTreeEntries}
          isVisible={fileTreeVisible}
          onToggle={onFileTreeToggle}
          onFileSelect={onFileTreeSelectFile}
          onDirectorySelect={onFileTreeSelectDirectory}
          onGoToParent={onFileTreeGoToParent}
        />
      </div>
    </div>
  )
}

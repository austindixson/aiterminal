/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/components/EditorTabBar.tsx
 * Module: renderer
 * Purpose: VSCode-style file tab bar for editor columns
 * Dependencies: react, @/types/editor-columns
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/App.tsx
 * Keywords: editor-tabs, file-tabs, tab-bar, vscode-style
 * Last Updated: 2026-03-25
 */

import type { FC, MouseEvent, ReactNode } from 'react'
import type { FileTab } from '@/types/editor-columns'

export interface EditorTabBarProps {
  /** Unique identifier for the column */
  readonly columnId: string
  /** All tabs in this column */
  readonly tabs: ReadonlyArray<FileTab>
  /** ID of the currently active tab */
  readonly activeTabId: string | null
  /** Called when a tab is clicked */
  readonly onTabClick: (tabId: string) => void
  /** Called when a tab close button is clicked */
  readonly onTabClose: (tabId: string) => void
  /** Optional extra content to render on the right side */
  readonly extra?: ReactNode
}

/**
 * Get file icon based on file extension
 */
function getFileIcon(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase()

  const iconMap: Record<string, string> = {
    ts: '⚛️',
    tsx: '⚛️',
    js: '📜',
    jsx: '📜',
    py: '🐍',
    rs: '🦀',
    go: '🔵',
    java: '☕',
    cpp: '⚙️',
    c: '⚙️',
    h: '⚙️',
    css: '🎨',
    scss: '🎨',
    html: '🌐',
    json: '📋',
    md: '📝',
    yaml: '📋',
    yml: '📋',
    xml: '📋',
    svg: '🖼️',
    sh: '⚡',
    zsh: '⚡',
    bash: '⚡',
  }

  return iconMap[ext || ''] || '📄'
}

/**
 * Truncate filename with ellipsis if too long
 */
function truncateFileName(fileName: string, maxLength: number = 20): string {
  if (fileName.length <= maxLength) return fileName

  // Try to truncate at extension boundary
  const extIndex = fileName.lastIndexOf('.')
  if (extIndex > 0) {
    const ext = fileName.slice(extIndex)
    const nameWithoutExt = fileName.slice(0, extIndex)
    const maxNameLength = maxLength - ext.length - 1

    if (maxNameLength > 3) {
      return `${nameWithoutExt.slice(0, maxNameLength)}…${ext}`
    }
  }

  return `${fileName.slice(0, maxLength - 1)}…`
}

/**
 * VSCode-style tab bar component
 *
 * Features:
 * - Active tab highlighting with bottom border
 * - Modified indicator (dot)
 * - File type icons
 * - Close button on hover
 * - Horizontal scrolling for many tabs
 * - Keyboard shortcut support (Cmd+1/2/3...)
 */
export const EditorTabBar: FC<EditorTabBarProps> = ({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  extra,
}) => {
  const handleTabClick = (tabId: string, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    onTabClick(tabId)
  }

  const handleTabClose = (tabId: string, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    onTabClose(tabId)
  }

  const handleTabMouseDown = (tabId: string, e: MouseEvent<HTMLButtonElement>) => {
    // Middle-click (button 1) to close tab
    if (e.button === 1) {
      e.preventDefault()
      onTabClose(tabId)
    }
  }

  if (tabs.length === 0) {
    // Completely hide tab bar when no tabs are open
    return null
  }

  return (
    <div className="editor-tab-bar">
      <div className="editor-tab-bar__tabs">
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId
          const icon = getFileIcon(tab.filePath)
          const truncatedTitle = truncateFileName(tab.title)

          return (
            <button
              key={tab.id}
              type="button"
              className={`editor-tab${isActive ? ' editor-tab--active' : ''}`}
              onClick={(e) => handleTabClick(tab.id, e)}
              onMouseDown={(e) => handleTabMouseDown(tab.id, e)}
              title={`${tab.filePath}${tab.isModified ? ' (modified)' : ''}`}
              aria-label={`Tab ${index + 1}: ${tab.title}${tab.isModified ? ' (modified)' : ''}`}
              aria-selected={isActive}
              role="tab"
            >
              {/* File icon */}
              <span className="editor-tab__icon" aria-hidden="true">
                {icon}
              </span>

              {/* File name */}
              <span className="editor-tab__title">{truncatedTitle}</span>

              {/* Modified indicator */}
              {tab.isModified && (
                <span className="editor-tab__modified" aria-label="Modified">
                  ●
                </span>
              )}

              {/* Close button */}
              <button
                type="button"
                className="editor-tab__close"
                onClick={(e) => handleTabClose(tab.id, e)}
                aria-label={`Close ${tab.title}`}
                title="Close (Cmd+W)"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M1 1L11 11M1 11L11 1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </button>
          )
        })}
      </div>
      {extra && <div className="editor-tab-bar__extra">{extra}</div>}
    </div>
  )
}

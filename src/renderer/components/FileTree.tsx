/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/components/FileTree.tsx
 * Module: renderer/components
 * Purpose: Recursive file tree component with expand/collapse, hidden files toggle, and parent navigation
 * Dependencies: react, @/types/file-tree, @/file-tree/file-tree-service
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/hooks/useFileTree.ts, /Users/ghost/Desktop/aiterminal/src/file-tree/file-tree-service.ts
 * Keywords: file-tree, recursive, expand-collapse, hidden-files, parent-directory, posix
 * Last Updated: 2026-03-24
 */

import { useState, useCallback, useMemo } from 'react'
import type { FC } from 'react'
import type { FileEntry } from '@/types/file-tree'
import { getFileIcon } from '@/file-tree/file-tree-service'

/** POSIX parent directory — browser-safe (no Node `path`; Vite cannot bundle it for the renderer). */
function posixDirname(p: string): string {
  if (!p || p === '/') return '/'
  const trimmed = p.replace(/\/+$/, '')
  if (trimmed === '/') return '/'
  const i = trimmed.lastIndexOf('/')
  if (i <= 0) return '/'
  return trimmed.slice(0, i) || '/'
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FileTreeProps {
  readonly cwd: string
  readonly entries: ReadonlyArray<FileEntry>
  readonly isVisible: boolean
  readonly onToggle: () => void
  readonly onFileSelect?: (path: string) => void
  readonly onDirectorySelect?: (path: string) => void
  /** Navigate to parent directory (shell + tree sync). */
  readonly onGoToParent?: () => void
  readonly canGoToParent?: boolean
}

// ---------------------------------------------------------------------------
// FileTreeNode — recursive entry renderer
// ---------------------------------------------------------------------------

interface FileTreeNodeProps {
  readonly entry: FileEntry
  readonly depth: number
  readonly expandedPaths: ReadonlySet<string>
  readonly selectedPath: string | null
  readonly showHidden: boolean
  readonly onToggleExpand: (path: string) => void
  readonly onSelect: (path: string) => void
  readonly onDirectorySelect?: (path: string) => void
}

const FileTreeNode: FC<FileTreeNodeProps> = ({
  entry,
  depth,
  expandedPaths,
  selectedPath,
  showHidden,
  onToggleExpand,
  onSelect,
  onDirectorySelect,
}) => {
  const isExpanded = expandedPaths.has(entry.path)
  const isSelected = selectedPath === entry.path
  const icon = getFileIcon(entry)

  const handleClick = useCallback(() => {
    if (entry.isDirectory) {
      onToggleExpand(entry.path)
    } else {
      onSelect(entry.path)
    }
  }, [entry.isDirectory, entry.path, onToggleExpand, onSelect])

  const handleDoubleClick = useCallback(() => {
    if (entry.isDirectory && onDirectorySelect) {
      onDirectorySelect(entry.path)
    }
  }, [entry.isDirectory, entry.path, onDirectorySelect])

  const entryClasses = [
    'file-tree-entry',
    isSelected ? 'file-tree-entry--selected' : '',
    entry.isDirectory ? 'file-tree-entry--directory' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <div
        className={entryClasses}
        data-testid="file-tree-entry"
        data-depth={String(depth)}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        role="treeitem"
        aria-expanded={entry.isDirectory ? isExpanded : undefined}
      >
        {entry.isDirectory && (
          <span className="file-tree-toggle" data-testid="file-tree-toggle">
            {isExpanded ? '\u25BE' : '\u25B8'}
          </span>
        )}
        <span className="file-tree-icon" data-testid="file-tree-icon">
          {icon}
        </span>
        <span className="file-tree-name">{entry.name}</span>
      </div>

      {entry.isDirectory && isExpanded && entry.children && (
        <div className="file-tree-children">
          {entry.children
            .filter(child => showHidden || !child.isHidden)
            .map(child => (
              <FileTreeNode
                key={child.path}
                entry={child}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                selectedPath={selectedPath}
                showHidden={showHidden}
                onToggleExpand={onToggleExpand}
                onSelect={onSelect}
                onDirectorySelect={onDirectorySelect}
              />
            ))}
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// FileTree — main panel component
// ---------------------------------------------------------------------------

export const FileTree: FC<FileTreeProps> = ({
  cwd,
  entries,
  isVisible,
  onToggle,
  onFileSelect,
  onDirectorySelect,
  onGoToParent,
  canGoToParent,
}) => {
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(new Set())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)

  const handleToggleExpand = useCallback((entryPath: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev)
      if (next.has(entryPath)) {
        next.delete(entryPath)
      } else {
        next.add(entryPath)
      }
      return next
    })
  }, [])

  const handleSelect = useCallback(
    (entryPath: string) => {
      setSelectedPath(entryPath)
      onFileSelect?.(entryPath)
    },
    [onFileSelect],
  )

  const handleToggleHidden = useCallback(() => {
    setShowHidden(prev => !prev)
  }, [])

  // Filter hidden entries at the top level
  const visibleEntries = useMemo(
    () => entries.filter(entry => showHidden || !entry.isHidden),
    [entries, showHidden],
  )

  const derivedCanGoParent = cwd.length > 0 && posixDirname(cwd) !== cwd
  const showParent =
    typeof onGoToParent === 'function' &&
    (canGoToParent !== undefined ? canGoToParent : derivedCanGoParent)

  if (!isVisible) {
    return null
  }

  return (
    <div className="file-tree-panel" role="tree">
      <div className="file-tree-header">
        <span className="file-tree-cwd" data-testid="file-tree-cwd" title={cwd}>
          {cwd}
        </span>
        <div className="file-tree-header-controls">
          {showParent && (
            <button
              type="button"
              className="file-tree-btn"
              onClick={onGoToParent}
              aria-label="Parent directory"
              title="Parent directory (cd ..)"
            >
              ↑
            </button>
          )}
          <button
            type="button"
            className="file-tree-btn"
            onClick={handleToggleHidden}
            aria-label="Toggle hidden files"
            title="Toggle hidden files"
          >
            {showHidden ? '\u25C9' : '\u25CE'}
          </button>
          <button
            type="button"
            className="file-tree-btn"
            onClick={onToggle}
            aria-label="Toggle file tree"
            title="Toggle file tree"
          >
            ×
          </button>
        </div>
      </div>

      <div className="file-tree-entries">
        {visibleEntries.map(entry => (
          <FileTreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            expandedPaths={expandedPaths}
            selectedPath={selectedPath}
            showHidden={showHidden}
            onToggleExpand={handleToggleExpand}
            onSelect={handleSelect}
            onDirectorySelect={onDirectorySelect}
          />
        ))}
      </div>
    </div>
  )
}

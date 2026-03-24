/**
 * FilePicker — Dropdown for selecting files via @mention or Cmd+K.
 *
 * Renders a glass-morphism dropdown with a search input, results list
 * with file icons, and keyboard navigation. Controlled entirely via
 * props from the useFilePicker hook.
 */

import { useEffect, useRef } from 'react'
import type { FC } from 'react'
import type { FilePickerState, FilePickerResult } from '@/types/file-context'

// ---------------------------------------------------------------------------
// File icon mapping
// ---------------------------------------------------------------------------

const ICON_DIRECTORY = '\u{1F4C1}'
const ICON_TYPESCRIPT = '\u{1F518}'
const ICON_JAVASCRIPT = '\u{1F7E1}'
const ICON_JSON = '\u{2699}\uFE0F'
const ICON_CSS = '\u{1F3A8}'
const ICON_FILE = '\u{1F4C4}'

function getFileIcon(result: FilePickerResult): string {
  if (result.isDirectory) return ICON_DIRECTORY

  const ext = result.name.includes('.')
    ? result.name.slice(result.name.lastIndexOf('.')).toLowerCase()
    : ''

  switch (ext) {
    case '.ts':
    case '.tsx':
      return ICON_TYPESCRIPT
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return ICON_JAVASCRIPT
    case '.json':
      return ICON_JSON
    case '.css':
    case '.scss':
    case '.less':
      return ICON_CSS
    default:
      return ICON_FILE
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FilePickerProps {
  readonly state: FilePickerState
  readonly onSelect: (result: FilePickerResult) => void
  readonly onDismiss: () => void
  readonly onQueryChange: (query: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const FilePicker: FC<FilePickerProps> = ({
  state,
  onSelect,
  onDismiss,
  onQueryChange,
}) => {
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus input when opened
  useEffect(() => {
    if (state.isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [state.isOpen])

  if (!state.isOpen) {
    return null
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onDismiss()
      return
    }

    if (e.key === 'Enter' && state.results.length > 0) {
      e.preventDefault()
      const selected = state.results[state.selectedIndex]
      if (selected) {
        onSelect(selected)
      }
      return
    }
  }

  return (
    <div className="file-picker" data-testid="file-picker">
      {/* Search input */}
      <div className="file-picker__search">
        <input
          ref={inputRef}
          className="file-picker__input"
          type="text"
          placeholder="Search files..."
          value={state.query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      </div>

      {/* Results list */}
      <div className="file-picker__results">
        {state.results.length === 0 && state.query.length > 0 && (
          <div className="file-picker__empty" data-testid="file-picker-empty">
            No files found
          </div>
        )}

        {state.results.map((result, index) => {
          const isSelected = index === state.selectedIndex
          const className = [
            'file-picker__item',
            isSelected ? 'file-picker__item--selected' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <div
              key={result.path}
              className={className}
              data-testid={`file-picker-item-${index}`}
              // Also support generic testid for querying all items
              {...(index >= 0 ? { 'data-file-picker-item': '' } : {})}
              onClick={() => onSelect(result)}
            >
              <span
                className="file-picker__icon"
                data-testid={`file-picker-icon-${index}`}
              >
                {getFileIcon(result)}
              </span>
              <span className="file-picker__name">{result.name}</span>
              <span className="file-picker__path">{result.relativePath}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

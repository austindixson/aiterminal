/**
 * DiffView — Inline diff review panel for AI-proposed code changes.
 *
 * Shows file tabs, line-by-line diff with colored gutters, and
 * Accept/Reject controls. Styled with glass morphism.
 */

import type { FC } from 'react'
import type { DiffViewState, DiffLine } from '@/types/diff'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DiffViewProps {
  readonly state: DiffViewState
  readonly onAccept: () => void
  readonly onReject: () => void
  readonly onSelectFile: (index: number) => void
  readonly onClose: () => void
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const DiffLineRow: FC<{ readonly line: DiffLine }> = ({ line }) => {
  const lineClass = `diff-line diff-line--${line.type}`

  return (
    <div className={lineClass}>
      <span className="diff-gutter diff-gutter--old">
        {line.oldLineNum ?? ''}
      </span>
      <span className="diff-gutter diff-gutter--new">
        {line.newLineNum ?? ''}
      </span>
      <span className="diff-content">
        {line.type === 'added' && '+ '}
        {line.type === 'removed' && '- '}
        {line.type === 'unchanged' && '  '}
        {line.content}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const DiffView: FC<DiffViewProps> = ({
  state,
  onAccept,
  onReject,
  onSelectFile,
  onClose,
}) => {
  if (!state.isOpen) {
    return null
  }

  const currentDiff = state.diffs[state.selectedFileIndex]
  const hasMultipleFiles = state.diffs.length > 1

  return (
    <div className="diff-view" data-testid="diff-view">
      {/* Header with close button */}
      <div className="diff-header">
        <div className="diff-header__info">
          {!hasMultipleFiles && currentDiff && (
            <>
              <span className="diff-header__path">{currentDiff.filePath}</span>
              <span className="diff-stats">
                <span className="diff-stats__additions">+{currentDiff.additions}</span>
                <span className="diff-stats__deletions">-{currentDiff.deletions}</span>
              </span>
            </>
          )}
        </div>
        <button
          className="diff-close-btn"
          onClick={onClose}
          aria-label="Close"
          type="button"
        >
          x
        </button>
      </div>

      {/* File tabs (when multiple diffs) */}
      {hasMultipleFiles && (
        <div className="diff-tabs">
          {state.diffs.map((diff, index) => (
            <button
              key={diff.filePath}
              type="button"
              className={`diff-tab${index === state.selectedFileIndex ? ' diff-tab--active' : ''}`}
              onClick={() => onSelectFile(index)}
            >
              <span>{diff.filePath}</span>
              <span className="diff-stats">
                <span className="diff-stats__additions">+{diff.additions}</span>
                <span className="diff-stats__deletions">-{diff.deletions}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Scrollable diff content */}
      <div className="diff-content-area">
        {currentDiff && currentDiff.lines.map((line, index) => (
          <DiffLineRow key={`${line.type}-${line.oldLineNum}-${line.newLineNum}-${index}`} line={line} />
        ))}
      </div>

      {/* Controls */}
      <div className="diff-controls">
        <button
          className="diff-controls__btn diff-controls__btn--accept"
          onClick={onAccept}
          aria-label="Accept"
          type="button"
        >
          Accept
        </button>
        <button
          className="diff-controls__btn diff-controls__btn--reject"
          onClick={onReject}
          aria-label="Reject"
          type="button"
        >
          Reject
        </button>
      </div>
    </div>
  )
}

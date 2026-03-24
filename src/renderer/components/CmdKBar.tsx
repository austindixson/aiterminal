/**
 * CmdKBar — Floating inline AI command bar (Cmd+K).
 *
 * Renders a glass-morphism overlay with an input field, result display,
 * loading indicator, and history dropdown. Controlled entirely via props
 * from the useCmdK hook.
 */

import { useEffect, useRef } from 'react'
import type { FC } from 'react'
import type { CmdKState } from '@/types/cmd-k'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CmdKBarProps {
  readonly state: CmdKState
  readonly onClose: () => void
  readonly onSubmit: () => void
  readonly onQueryChange: (query: string) => void
  readonly onNavigateHistory: (direction: -1 | 1) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CmdKBar: FC<CmdKBarProps> = ({
  state,
  onClose,
  onSubmit,
  onQueryChange,
  onNavigateHistory,
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
      onClose()
      return
    }

    if (e.key === 'Enter' && state.query.trim().length > 0) {
      e.preventDefault()
      onSubmit()
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      onNavigateHistory(-1)
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      onNavigateHistory(1)
      return
    }
  }

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only close if clicking the overlay itself, not children
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const resultTypeClass = state.result
    ? `cmd-k-result cmd-k-result--${state.result.type}`
    : ''

  return (
    <div
      className="cmd-k-overlay"
      data-testid="cmd-k-overlay"
      onClick={handleOverlayClick}
    >
      <div className="cmd-k-bar" data-testid="cmd-k-bar">
        {/* Input */}
        <div className="cmd-k-input-wrapper">
          <input
            ref={inputRef}
            className="cmd-k-input"
            type="text"
            placeholder="Ask AI anything... (Cmd+K)"
            value={state.query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>

        {/* Loading indicator */}
        {state.isProcessing && (
          <div className="cmd-k-loading" data-testid="cmd-k-loading">
            <div className="cmd-k-loading__dots">
              <span className="cmd-k-loading__dot" />
              <span className="cmd-k-loading__dot" />
              <span className="cmd-k-loading__dot" />
            </div>
          </div>
        )}

        {/* Result */}
        {state.result && !state.isProcessing && (
          <div className={resultTypeClass} data-testid="cmd-k-result">
            {state.result.type === 'command' && state.result.isAutoExecuted && (
              <div className="cmd-k-result__command-label">
                <span className="cmd-k-result__ran-label">Ran:</span>{' '}
                <code className="cmd-k-result__command-code">
                  {state.result.command}
                </code>
              </div>
            )}
            <div className="cmd-k-result__content">{state.result.content}</div>
          </div>
        )}

        {/* History */}
        {state.history.length > 0 && !state.result && !state.isProcessing && (
          <div className="cmd-k-history" data-testid="cmd-k-history">
            {state.history
              .slice(-10)
              .reverse()
              .map((entry, i) => (
                <div key={`${entry.timestamp}-${i}`} className="cmd-k-history__item">
                  <span className="cmd-k-history__query">{entry.query}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

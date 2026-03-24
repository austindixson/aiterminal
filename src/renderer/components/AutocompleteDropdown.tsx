/**
 * AutocompleteDropdown — visual dropdown for tab completion suggestions.
 *
 * Renders a glassmorphism dropdown with suggestion rows, each showing:
 * - Type icon (command=>, path=/, flag=--, ai=sparkle)
 * - Completion text
 * - Description (dimmed)
 *
 * Positioned absolutely near the cursor in the terminal.
 */

import type { FC } from 'react'
import type { AutocompleteState, AutocompleteSuggestion } from '@/types/autocomplete'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AutocompleteDropdownProps {
  readonly state: AutocompleteState
  readonly onAccept: (text: string) => void
  readonly onDismiss: () => void
  readonly position: { readonly x: number; readonly y: number }
}

// ---------------------------------------------------------------------------
// Icon mapping
// ---------------------------------------------------------------------------

function getTypeIcon(type: AutocompleteSuggestion['type']): string {
  switch (type) {
    case 'command':
      return '>'
    case 'path':
      return '/'
    case 'flag':
      return '--'
    case 'ai':
      return '\u2728' // sparkle
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AutocompleteDropdown: FC<AutocompleteDropdownProps> = ({
  state,
  onAccept,
  onDismiss: _onDismiss,
  position,
}) => {
  if (!state.isVisible && !state.isLoading) {
    return null
  }

  return (
    <div
      className="autocomplete-dropdown"
      data-testid="autocomplete-dropdown"
      style={{
        left: `${position.x}px`,
        bottom: `${position.y}px`,
      }}
    >
      {state.isLoading && (
        <div className="autocomplete-loading" data-testid="autocomplete-loading">
          <span className="autocomplete-loading__dots">&bull;&bull;&bull;</span>
        </div>
      )}

      {state.suggestions.map((suggestion, index) => (
        <div
          key={`${suggestion.text}-${index}`}
          className={`autocomplete-item${
            index === state.selectedIndex ? ' autocomplete-item--selected' : ''
          }`}
          data-testid="autocomplete-item"
          onClick={() => onAccept(suggestion.text)}
          role="option"
          aria-selected={index === state.selectedIndex}
        >
          <span className="autocomplete-item__icon" data-testid="autocomplete-icon">
            {getTypeIcon(suggestion.type)}
          </span>
          <span className="autocomplete-item__text">{suggestion.text}</span>
          <span className="autocomplete-item__desc">{suggestion.description}</span>
        </div>
      ))}
    </div>
  )
}

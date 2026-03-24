/**
 * KeybindingsHelp — Modal overlay showing all keyboard shortcuts.
 *
 * Displays shortcuts grouped by category with macOS-style key pills.
 * Closes on Escape or click outside the modal.
 */

import { useEffect, useCallback } from 'react'
import type { FC } from 'react'
import type { KeybindingAction } from '@/types/keybindings'
import { formatKeybinding } from '@/renderer/hooks/useKeybindings'
import '@/renderer/styles/keybindings.css'

// ---------------------------------------------------------------------------
// Category display names & ordering
// ---------------------------------------------------------------------------

const CATEGORY_ORDER = ['general', 'ai', 'navigation', 'editor'] as const
const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  ai: 'AI',
  navigation: 'Navigation',
  editor: 'Editor',
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface KeybindingsHelpProps {
  readonly isVisible: boolean
  readonly actions: ReadonlyArray<KeybindingAction>
  readonly onClose: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const KeybindingsHelp: FC<KeybindingsHelpProps> = ({
  isVisible,
  actions,
  onClose,
}) => {
  // Close on Escape
  useEffect(() => {
    if (!isVisible) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isVisible, onClose])

  // Close when clicking the overlay (not the modal)
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose],
  )

  if (!isVisible) return null

  // Group actions by category
  const grouped = groupByCategory(actions)

  return (
    <div className="keybindings-overlay" onClick={handleOverlayClick}>
      <div className="keybindings-modal">
        <h2 className="keybindings-title">Keyboard Shortcuts</h2>

        {CATEGORY_ORDER.map((category) => {
          const categoryActions = grouped[category]
          if (!categoryActions || categoryActions.length === 0) return null

          return (
            <div key={category} className="keybindings-category">
              <h3 className="keybindings-category__header">
                {CATEGORY_LABELS[category]}
              </h3>
              <div className="keybindings-category__list">
                {categoryActions.map((action) => (
                  <div key={action.binding.id} className="keybinding-row">
                    <span className="keybinding-key">
                      {formatKeybinding(action.binding)}
                    </span>
                    <span className="keybinding-description">
                      {action.binding.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByCategory(
  actions: ReadonlyArray<KeybindingAction>,
): Record<string, ReadonlyArray<KeybindingAction>> {
  const result: Record<string, KeybindingAction[]> = {}

  for (const action of actions) {
    const cat = action.binding.category
    if (!result[cat]) {
      result[cat] = []
    }
    result[cat].push(action)
  }

  return result
}

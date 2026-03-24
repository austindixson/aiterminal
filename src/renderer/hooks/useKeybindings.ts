/**
 * useKeybindings — Unified keyboard shortcut system for AITerminal.
 *
 * Provides a central hook for registering, unregistering, and matching
 * keyboard shortcuts. All components use this instead of ad-hoc keydown
 * listeners.
 *
 * Exported pure functions (isMatch, formatKeybinding, createKeybinding)
 * are independently testable without React.
 */

import { useCallback, useEffect, useRef } from 'react'
import type { Keybinding, KeybindingAction } from '@/types/keybindings'

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Check whether a KeyboardEvent matches a Keybinding definition.
 * Key comparison is case-insensitive for letter keys.
 */
export function isMatch(event: KeyboardEvent, binding: Keybinding): boolean {
  const eventKey = event.key.toLowerCase()
  const bindingKey = binding.key.toLowerCase()

  if (eventKey !== bindingKey) return false
  if (event.metaKey !== binding.meta) return false
  if (event.shiftKey !== binding.shift) return false
  if (event.altKey !== binding.alt) return false
  if (event.ctrlKey !== binding.ctrl) return false

  return true
}

/**
 * Format a Keybinding for display using macOS symbols.
 *
 * Symbol mapping:
 *   Ctrl  -> ⌃
 *   Alt   -> ⌥
 *   Shift -> ⇧
 *   Meta  -> ⌘
 *
 * Special key names (Escape -> Esc) are handled.
 * Letter keys are uppercased; symbols (/, ., ,) stay as-is.
 */
export function formatKeybinding(binding: Keybinding): string {
  const parts: string[] = []

  if (binding.ctrl) parts.push('\u2303')   // ⌃
  if (binding.meta) parts.push('\u2318')   // ⌘
  if (binding.alt) parts.push('\u2325')    // ⌥
  if (binding.shift) parts.push('\u21e7')  // ⇧

  const keyDisplay = formatKeyName(binding.key)
  parts.push(keyDisplay)

  return parts.join('')
}

function formatKeyName(key: string): string {
  switch (key) {
    case 'Escape':
      return 'Esc'
    case 'ArrowUp':
      return '\u2191'
    case 'ArrowDown':
      return '\u2193'
    case 'ArrowLeft':
      return '\u2190'
    case 'ArrowRight':
      return '\u2192'
    case 'Enter':
      return '\u21a9'
    case 'Backspace':
      return '\u232b'
    case 'Tab':
      return '\u21e5'
    case ' ':
      return 'Space'
    default:
      // Single letter keys are uppercased; symbols stay as-is
      return key.length === 1 && /[a-z]/i.test(key)
        ? key.toUpperCase()
        : key
  }
}

/**
 * Factory for creating a Keybinding with sensible defaults.
 * Modifiers default to false unless specified.
 */
export function createKeybinding(
  id: string,
  key: string,
  description: string,
  category: Keybinding['category'],
  modifiers: {
    readonly meta?: boolean
    readonly shift?: boolean
    readonly alt?: boolean
    readonly ctrl?: boolean
  } = {},
): Keybinding {
  return {
    id,
    key,
    meta: modifiers.meta ?? false,
    shift: modifiers.shift ?? false,
    alt: modifiers.alt ?? false,
    ctrl: modifiers.ctrl ?? false,
    description,
    category,
  }
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseKeybindingsReturn {
  readonly register: (binding: Keybinding, handler: () => void, enabled?: boolean) => void
  readonly unregister: (id: string) => void
  readonly getKeybindings: () => ReadonlyArray<KeybindingAction>
  readonly getKeybindingsByCategory: (category: Keybinding['category']) => ReadonlyArray<KeybindingAction>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns true if the event target is an input-like element where
 * keystrokes should be forwarded to the element rather than handled
 * as shortcuts — unless a meta/ctrl modifier is held.
 */
function isInputFocused(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null
  if (!target || !target.tagName) return false

  const tagName = target.tagName.toLowerCase()
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true
  }

  // contenteditable
  if (target.isContentEditable) {
    return true
  }

  return false
}

export function useKeybindings(): UseKeybindingsReturn {
  // Mutable ref so the keydown handler always sees the latest registry
  // without needing to re-attach the listener.
  const actionsRef = useRef<Map<string, KeybindingAction>>(new Map())

  // -----------------------------------------------------------------------
  // Register / unregister
  // -----------------------------------------------------------------------

  const register = useCallback(
    (binding: Keybinding, handler: () => void, enabled: boolean = true) => {
      const action: KeybindingAction = { binding, handler, enabled }
      // Replace any existing action with the same id (last-registered wins)
      actionsRef.current = new Map(actionsRef.current)
      actionsRef.current.set(binding.id, action)
    },
    [],
  )

  const unregister = useCallback((id: string) => {
    actionsRef.current = new Map(actionsRef.current)
    actionsRef.current.delete(id)
  }, [])

  // -----------------------------------------------------------------------
  // Query helpers
  // -----------------------------------------------------------------------

  const getKeybindings = useCallback((): ReadonlyArray<KeybindingAction> => {
    return Array.from(actionsRef.current.values())
  }, [])

  const getKeybindingsByCategory = useCallback(
    (category: Keybinding['category']): ReadonlyArray<KeybindingAction> => {
      return Array.from(actionsRef.current.values()).filter(
        (a) => a.binding.category === category,
      )
    },
    [],
  )

  // -----------------------------------------------------------------------
  // Global keydown listener
  // -----------------------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const inputFocused = isInputFocused(event)

      for (const action of actionsRef.current.values()) {
        if (!action.enabled) continue
        if (!isMatch(event, action.binding)) continue

        // When an input element is focused, only fire if a meta/ctrl
        // modifier is part of the binding (global shortcuts).
        if (inputFocused && !action.binding.meta && !action.binding.ctrl) {
          continue
        }

        event.preventDefault()
        action.handler()
        return // First match wins
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return { register, unregister, getKeybindings, getKeybindingsByCategory }
}

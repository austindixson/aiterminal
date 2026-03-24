/**
 * useAutocomplete — React hook managing autocomplete state and interactions.
 *
 * Provides a debounced trigger, keyboard navigation (selectNext/selectPrev),
 * accept/dismiss actions, and reactive state for the AutocompleteDropdown.
 */

import { useCallback, useRef, useState } from 'react'
import type { AutocompleteState, AutocompleteSuggestion } from '@/types/autocomplete'
import {
  getLocalSuggestions,
  getCommandSuggestions,
  getAISuggestions,
  mergeSuggestions,
} from '@/autocomplete/autocomplete-service'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 200

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const INITIAL_STATE: AutocompleteState = {
  isVisible: false,
  suggestions: [],
  selectedIndex: 0,
  partialInput: '',
  isLoading: false,
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseAutocompleteReturn {
  readonly state: AutocompleteState
  readonly trigger: (partial: string, cwd: string) => void
  readonly selectNext: () => void
  readonly selectPrev: () => void
  readonly accept: () => string | null
  readonly dismiss: () => void
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function useAutocomplete(): UseAutocompleteReturn {
  const [state, setState] = useState<AutocompleteState>(INITIAL_STATE)
  const stateRef = useRef<AutocompleteState>(INITIAL_STATE)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep ref in sync with state for synchronous reads in accept()
  stateRef.current = state

  const trigger = useCallback((partial: string, cwd: string) => {
    // Clear existing debounce timer
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current)
    }

    // Empty input clears everything
    if (partial.trim().length === 0) {
      debounceRef.current = setTimeout(() => {
        setState({
          ...INITIAL_STATE,
          partialInput: '',
        })
      }, DEBOUNCE_MS)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setState((prev) => ({
        ...prev,
        partialInput: partial,
        isLoading: true,
      }))

      try {
        // Fetch suggestions from all sources in parallel
        const [localSuggestions, aiSuggestions] = await Promise.all([
          getLocalSuggestions(partial, cwd),
          getAISuggestions({
            partialInput: partial,
            cwd,
            recentCommands: [],
            shellType: 'zsh',
          }),
        ])

        const commandSuggestions = getCommandSuggestions(partial)

        // Merge local (path + command) with AI
        const allLocal: ReadonlyArray<AutocompleteSuggestion> = [
          ...commandSuggestions,
          ...localSuggestions,
        ]
        const merged = mergeSuggestions(allLocal, aiSuggestions)

        setState({
          isVisible: merged.length > 0,
          suggestions: merged,
          selectedIndex: 0,
          partialInput: partial,
          isLoading: false,
        })
      } catch {
        setState((prev) => ({
          ...prev,
          isLoading: false,
        }))
      }
    }, DEBOUNCE_MS)
  }, [])

  const selectNext = useCallback(() => {
    setState((prev) => {
      if (prev.suggestions.length === 0) return prev

      const nextIndex = (prev.selectedIndex + 1) % prev.suggestions.length
      return { ...prev, selectedIndex: nextIndex }
    })
  }, [])

  const selectPrev = useCallback(() => {
    setState((prev) => {
      if (prev.suggestions.length === 0) return prev

      const prevIndex =
        prev.selectedIndex === 0
          ? prev.suggestions.length - 1
          : prev.selectedIndex - 1
      return { ...prev, selectedIndex: prevIndex }
    })
  }, [])

  const accept = useCallback((): string | null => {
    const current = stateRef.current

    if (current.suggestions.length === 0) {
      return null
    }

    const accepted = current.suggestions[current.selectedIndex].text
    setState(INITIAL_STATE)
    return accepted
  }, [])

  const dismiss = useCallback(() => {
    setState(INITIAL_STATE)
  }, [])

  return {
    state,
    trigger,
    selectNext,
    selectPrev,
    accept,
    dismiss,
  }
}

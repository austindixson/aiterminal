/**
 * useTerminalLocation — React hook managing terminal location state.
 *
 * Manages terminal position between center and bottom layout.
 * All state updates are immutable.
 */

import { useState, useCallback, useMemo } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TerminalLocation = 'center' | 'bottom'

export interface TerminalLocationState {
  readonly location: TerminalLocation
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseTerminalLocationReturn {
  readonly state: TerminalLocationState
  readonly toggle: () => void
  readonly setLocation: (location: TerminalLocation) => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTerminalLocation(): UseTerminalLocationReturn {
  const [location, setLocationState] = useState<TerminalLocation>('center')

  // -------------------------------------------------------------------------
  // Controls
  // -------------------------------------------------------------------------

  const toggle = useCallback(() => {
    setLocationState((prev) => (prev === 'center' ? 'bottom' : 'center'))
  }, [])

  const setLocation = useCallback((newLocation: TerminalLocation) => {
    setLocationState(newLocation)
  }, [])

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const state: TerminalLocationState = useMemo(
    () => ({
      location,
    }),
    [location],
  )

  return {
    state,
    toggle,
    setLocation,
  }
}

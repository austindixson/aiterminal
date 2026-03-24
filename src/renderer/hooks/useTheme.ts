import { useState, useCallback, useEffect, useMemo } from 'react'

import type { Theme } from '@/themes/types'
import { ThemeManager, applyThemeToDOM } from '@/themes/theme-manager'

export interface UseThemeReturn {
  /** The currently active theme (readonly). */
  readonly activeTheme: Theme
  /** Switch to a theme by name. Returns false if the name is invalid. */
  readonly setTheme: (name: string) => boolean
  /** All available themes (readonly array). */
  readonly availableThemes: readonly Theme[]
  /** Override the theme's default opacity (0.0 - 1.0). */
  readonly setOpacity: (opacity: number) => void
  /** Override the theme's default blur (0 - 50 px). */
  readonly setBlur: (blur: number) => void
}

/**
 * React hook that provides theme state and controls.
 *
 * - Applies CSS custom properties to the DOM whenever the theme, opacity,
 *   or blur changes.
 * - Returns immutable state — callers cannot mutate the theme directly.
 */
export function useTheme(): UseThemeReturn {
  const [manager, setManager] = useState<ThemeManager>(() => ThemeManager.create())
  const [opacityOverride, setOpacityOverride] = useState<number | null>(null)
  const [blurOverride, setBlurOverride] = useState<number | null>(null)

  const activeTheme = manager.getActiveTheme()

  // Derive the effective theme with any opacity/blur overrides applied
  const effectiveTheme: Theme = useMemo(() => {
    const needsOverride = opacityOverride !== null || blurOverride !== null
    if (!needsOverride) {
      return activeTheme
    }
    return {
      ...activeTheme,
      colors: { ...activeTheme.colors },
      opacity: opacityOverride ?? activeTheme.opacity,
      blur: blurOverride ?? activeTheme.blur,
    }
  }, [activeTheme, opacityOverride, blurOverride])

  // Apply to DOM whenever the effective theme changes
  useEffect(() => {
    applyThemeToDOM(effectiveTheme)
  }, [effectiveTheme])

  const setTheme = useCallback(
    (name: string): boolean => {
      const next = manager.setTheme(name)
      if (next === null) {
        return false
      }
      setManager(next)
      // Reset overrides when switching themes so the new theme's defaults apply
      setOpacityOverride(null)
      setBlurOverride(null)
      return true
    },
    [manager],
  )

  const setOpacity = useCallback((opacity: number): void => {
    const clamped = Math.max(0, Math.min(1, opacity))
    setOpacityOverride(clamped)
  }, [])

  const setBlur = useCallback((blur: number): void => {
    const clamped = Math.max(0, Math.min(50, blur))
    setBlurOverride(clamped)
  }, [])

  const availableThemes = useMemo(() => manager.getAvailableThemes(), [manager])

  return {
    activeTheme: effectiveTheme,
    setTheme,
    availableThemes,
    setOpacity,
    setBlur,
  }
}

import { useState, useCallback } from 'react'
import type { FC } from 'react'
import type { Theme } from '@/themes/types'
import { useTheme } from '@/renderer/hooks/useTheme'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract 4 representative swatches from a theme:
 * background, foreground, blue (accent1), magenta (accent2)
 */
function getSwatchColors(theme: Theme): readonly string[] {
  return [
    theme.colors.background,
    theme.colors.foreground,
    theme.colors.blue,
    theme.colors.magenta,
  ]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ThemeSelector: FC = () => {
  const { activeTheme, setTheme, availableThemes, setOpacity, setBlur } = useTheme()
  const [isOpen, setIsOpen] = useState(false)

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const handleThemeSelect = useCallback(
    (themeName: string) => {
      setTheme(themeName)
    },
    [setTheme],
  )

  const handleOpacityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(e.target.value) / 100
      setOpacity(value)
    },
    [setOpacity],
  )

  const handleBlurChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(e.target.value)
      setBlur(value)
    },
    [setBlur],
  )

  return (
    <div className="theme-selector">
      <button
        type="button"
        className="theme-selector__toggle"
        onClick={handleToggle}
        aria-label="Theme selector"
      >
        &#x1F3A8;
      </button>

      {isOpen && (
        <div className="theme-selector__dropdown">
          <div className="theme-selector__section-label">Themes</div>

          {availableThemes.map((theme) => {
            const isActive = theme.name === activeTheme.name
            const swatches = getSwatchColors(theme)

            return (
              <button
                key={theme.name}
                type="button"
                className={`theme-option${isActive ? ' theme-option--active' : ''}`}
                data-testid={`theme-option-${theme.name}`}
                onClick={() => handleThemeSelect(theme.name)}
              >
                <span className="theme-option__checkmark">
                  {isActive && (
                    <span data-testid="theme-checkmark">&#x2713;</span>
                  )}
                </span>
                <span className="theme-option__name">{theme.displayName}</span>
                <span className="theme-option__swatches">
                  {swatches.map((color, index) => (
                    <span
                      key={index}
                      className="color-swatch"
                      data-testid="color-swatch"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </span>
              </button>
            )
          })}

          <div className="theme-selector__divider" />

          {/* Opacity slider */}
          <div className="theme-selector__slider-group">
            <label className="theme-selector__slider-label" htmlFor="opacity-slider">
              <span>Opacity</span>
              <span>{Math.round(activeTheme.opacity * 100)}%</span>
            </label>
            <input
              id="opacity-slider"
              type="range"
              className="theme-selector__slider"
              min="0"
              max="100"
              value={Math.round(activeTheme.opacity * 100)}
              onChange={handleOpacityChange}
            />
          </div>

          {/* Blur slider */}
          <div className="theme-selector__slider-group">
            <label className="theme-selector__slider-label" htmlFor="blur-slider">
              <span>Blur</span>
              <span>{activeTheme.blur}px</span>
            </label>
            <input
              id="blur-slider"
              type="range"
              className="theme-selector__slider"
              min="0"
              max="50"
              value={activeTheme.blur}
              onChange={handleBlurChange}
            />
          </div>
        </div>
      )}
    </div>
  )
}

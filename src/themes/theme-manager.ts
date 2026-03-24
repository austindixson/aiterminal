import type { Theme, ThemeConfig } from './types'
import { THEMES, DEFAULT_THEME } from './index'

// ---------------------------------------------------------------------------
// Type for xterm.js ITheme-compatible options
// ---------------------------------------------------------------------------
export interface IThemeOptions {
  readonly background: string
  readonly foreground: string
  readonly cursor: string
  readonly cursorAccent: string
  readonly selectionBackground: string
  readonly selectionForeground: string
  readonly black: string
  readonly red: string
  readonly green: string
  readonly yellow: string
  readonly blue: string
  readonly magenta: string
  readonly cyan: string
  readonly white: string
  readonly brightBlack: string
  readonly brightRed: string
  readonly brightGreen: string
  readonly brightYellow: string
  readonly brightBlue: string
  readonly brightMagenta: string
  readonly brightCyan: string
  readonly brightWhite: string
}

// ---------------------------------------------------------------------------
// Default theme config
// ---------------------------------------------------------------------------
const DEFAULT_THEME_CONFIG: ThemeConfig = {
  activeTheme: DEFAULT_THEME,
  customOpacity: null,
  customBlur: null,
} as const

// ---------------------------------------------------------------------------
// ThemeManager — immutable theme state manager
// ---------------------------------------------------------------------------
export class ThemeManager {
  private readonly _activeThemeName: string

  private constructor(activeThemeName: string) {
    this._activeThemeName = activeThemeName
  }

  /** Create a ThemeManager with the default theme (Dracula). */
  static create(activeThemeName: string = DEFAULT_THEME): ThemeManager {
    return new ThemeManager(activeThemeName)
  }

  /** Returns the currently active Theme object. */
  getActiveTheme(): Theme {
    return THEMES.get(this._activeThemeName) ?? THEMES.get(DEFAULT_THEME)!
  }

  /**
   * Switch to a new theme by name.
   * Returns a new ThemeManager instance with the updated theme, or null if
   * the theme name is not found (original manager is never mutated).
   */
  setTheme(name: string): ThemeManager | null {
    if (!THEMES.has(name)) {
      return null
    }
    return new ThemeManager(name)
  }

  /** Returns a readonly array of all available themes. */
  getAvailableThemes(): readonly Theme[] {
    return Array.from(THEMES.values())
  }
}

// ---------------------------------------------------------------------------
// themeToXtermOptions — converts Theme to xterm.js ITheme shape
// ---------------------------------------------------------------------------
export function themeToXtermOptions(theme: Theme): IThemeOptions {
  const { colors } = theme
  return {
    background: colors.background,
    foreground: colors.foreground,
    cursor: colors.cursor,
    cursorAccent: colors.cursorAccent,
    selectionBackground: colors.selectionBackground,
    selectionForeground: colors.selectionForeground,
    black: colors.black,
    red: colors.red,
    green: colors.green,
    yellow: colors.yellow,
    blue: colors.blue,
    magenta: colors.magenta,
    cyan: colors.cyan,
    white: colors.white,
    brightBlack: colors.brightBlack,
    brightRed: colors.brightRed,
    brightGreen: colors.brightGreen,
    brightYellow: colors.brightYellow,
    brightBlue: colors.brightBlue,
    brightMagenta: colors.brightMagenta,
    brightCyan: colors.brightCyan,
    brightWhite: colors.brightWhite,
  }
}

// ---------------------------------------------------------------------------
// themeToCSSProperties — converts Theme to CSS custom property map
// ---------------------------------------------------------------------------
export function themeToCSSProperties(theme: Theme): Record<string, string> {
  const { colors } = theme
  return {
    '--terminal-bg': colors.background,
    '--terminal-fg': colors.foreground,
    '--terminal-cursor': colors.cursor,
    '--terminal-cursor-accent': colors.cursorAccent,
    '--terminal-selection': colors.selectionBackground,

    '--ansi-black': colors.black,
    '--ansi-red': colors.red,
    '--ansi-green': colors.green,
    '--ansi-yellow': colors.yellow,
    '--ansi-blue': colors.blue,
    '--ansi-magenta': colors.magenta,
    '--ansi-cyan': colors.cyan,
    '--ansi-white': colors.white,
    '--ansi-bright-black': colors.brightBlack,
    '--ansi-bright-red': colors.brightRed,
    '--ansi-bright-green': colors.brightGreen,
    '--ansi-bright-yellow': colors.brightYellow,
    '--ansi-bright-blue': colors.brightBlue,
    '--ansi-bright-magenta': colors.brightMagenta,
    '--ansi-bright-cyan': colors.brightCyan,
    '--ansi-bright-white': colors.brightWhite,

    '--window-opacity': String(theme.opacity),
    '--window-blur': `${theme.blur}px`,
  }
}

// ---------------------------------------------------------------------------
// applyThemeToDOM — sets CSS custom properties on document.documentElement
// ---------------------------------------------------------------------------
export function applyThemeToDOM(theme: Theme): void {
  const props = themeToCSSProperties(theme)
  const root = document.documentElement.style

  for (const [property, value] of Object.entries(props)) {
    root.setProperty(property, value)
  }
}

// ---------------------------------------------------------------------------
// Serialization helpers for theme config persistence
// ---------------------------------------------------------------------------
export function serializeThemeConfig(config: ThemeConfig): string {
  return JSON.stringify({
    activeTheme: config.activeTheme,
    customOpacity: config.customOpacity,
    customBlur: config.customBlur,
  })
}

export function deserializeThemeConfig(json: string): ThemeConfig {
  try {
    const parsed = JSON.parse(json)

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.activeTheme !== 'string'
    ) {
      return DEFAULT_THEME_CONFIG
    }

    return {
      activeTheme: parsed.activeTheme,
      customOpacity:
        typeof parsed.customOpacity === 'number' ? parsed.customOpacity : null,
      customBlur:
        typeof parsed.customBlur === 'number' ? parsed.customBlur : null,
    }
  } catch {
    return DEFAULT_THEME_CONFIG
  }
}

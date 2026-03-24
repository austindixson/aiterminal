export interface ThemeColors {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
  selectionForeground: string
  // ANSI 16 colors
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

export interface Theme {
  readonly name: string
  readonly displayName: string
  readonly colors: Readonly<ThemeColors>
  readonly opacity: number // 0.0 - 1.0
  readonly blur: number // 0 - 50 (px)
  readonly isDark: boolean
}

export interface ThemeConfig {
  readonly activeTheme: string
  readonly customOpacity: number | null // null = use theme default
  readonly customBlur: number | null
}

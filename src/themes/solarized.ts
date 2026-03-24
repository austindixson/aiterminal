import type { Theme } from './types'

export const solarized = {
  name: 'solarized',
  displayName: 'Solarized Dark',
  colors: {
    background: '#002B36',  // base03
    foreground: '#839496',  // base0
    cursor: '#839496',      // base0
    cursorAccent: '#002B36', // base03
    selectionBackground: '#073642', // base02
    selectionForeground: '#93A1A1', // base1
    // ANSI 16 colors — Solarized official palette
    black: '#073642',    // base02
    red: '#DC322F',      // red
    green: '#859900',    // green
    yellow: '#B58900',   // yellow
    blue: '#268BD2',     // blue
    magenta: '#D33682',  // magenta
    cyan: '#2AA198',     // cyan
    white: '#EEE8D5',    // base2
    brightBlack: '#002B36',    // base03
    brightRed: '#CB4B16',      // orange
    brightGreen: '#586E75',    // base01
    brightYellow: '#657B83',   // base00
    brightBlue: '#839496',     // base0
    brightMagenta: '#6C71C4',  // violet
    brightCyan: '#93A1A1',     // base1
    brightWhite: '#FDF6E3',    // base3
  },
  opacity: 0.95,
  blur: 10,
  isDark: true,
} as const satisfies Theme

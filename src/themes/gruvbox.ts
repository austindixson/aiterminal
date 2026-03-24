import type { Theme } from './types'

export const gruvbox = {
  name: 'gruvbox',
  displayName: 'Gruvbox Dark',
  colors: {
    background: '#282828',  // bg0
    foreground: '#EBDBB2',  // fg1
    cursor: '#EBDBB2',      // fg1
    cursorAccent: '#282828', // bg0
    selectionBackground: '#3C3836', // bg1
    selectionForeground: '#EBDBB2', // fg1
    // ANSI 16 colors — Gruvbox official palette (dark, medium contrast)
    black: '#282828',        // bg0
    red: '#CC241D',          // red
    green: '#98971A',        // green
    yellow: '#D79921',       // yellow
    blue: '#458588',         // blue
    magenta: '#B16286',      // purple
    cyan: '#689D6A',         // aqua
    white: '#A89984',        // fg4
    brightBlack: '#928374',  // gray
    brightRed: '#FB4934',    // bright red
    brightGreen: '#B8BB26',  // bright green
    brightYellow: '#FABD2F', // bright yellow
    brightBlue: '#83A598',   // bright blue
    brightMagenta: '#D3869B', // bright purple
    brightCyan: '#8EC07C',   // bright aqua
    brightWhite: '#EBDBB2',  // fg1
  },
  opacity: 0.95,
  blur: 10,
  isDark: true,
} as const satisfies Theme

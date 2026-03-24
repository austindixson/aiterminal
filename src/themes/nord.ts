import type { Theme } from './types'

export const nord = {
  name: 'nord',
  displayName: 'Nord',
  colors: {
    background: '#2E3440',
    foreground: '#D8DEE9',
    cursor: '#D8DEE9',
    cursorAccent: '#2E3440',
    selectionBackground: '#434C5E',
    selectionForeground: '#D8DEE9',
    // ANSI 16 colors — Nord palette (nord0–nord15)
    black: '#3B4252',    // nord1
    red: '#BF616A',      // nord11
    green: '#A3BE8C',    // nord14
    yellow: '#EBCB8B',   // nord13
    blue: '#81A1C1',     // nord9
    magenta: '#B48EAD',  // nord15
    cyan: '#88C0D0',     // nord8
    white: '#E5E9F0',    // nord5
    brightBlack: '#4C566A',   // nord3
    brightRed: '#BF616A',     // nord11
    brightGreen: '#A3BE8C',   // nord14
    brightYellow: '#EBCB8B',  // nord13
    brightBlue: '#81A1C1',    // nord9
    brightMagenta: '#B48EAD', // nord15
    brightCyan: '#8FBCBB',    // nord7
    brightWhite: '#ECEFF4',   // nord6
  },
  opacity: 0.95,
  blur: 10,
  isDark: true,
} as const satisfies Theme

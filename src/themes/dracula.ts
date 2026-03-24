import type { Theme } from './types'

export const dracula = {
  name: 'dracula',
  displayName: 'Dracula',
  colors: {
    background: '#282A36',
    foreground: '#F8F8F2',
    cursor: '#F8F8F2',
    cursorAccent: '#282A36',
    selectionBackground: '#44475A',
    selectionForeground: '#F8F8F2',
    // ANSI 16 colors
    black: '#21222C',
    red: '#FF5555',
    green: '#50FA7B',
    yellow: '#F1FA8C',
    blue: '#BD93F9',
    magenta: '#FF79C6',
    cyan: '#8BE9FD',
    white: '#F8F8F2',
    brightBlack: '#6272A4',
    brightRed: '#FF6E6E',
    brightGreen: '#69FF94',
    brightYellow: '#FFFFA5',
    brightBlue: '#D6ACFF',
    brightMagenta: '#FF92DF',
    brightCyan: '#A4FFFF',
    brightWhite: '#FFFFFF',
  },
  opacity: 0.95,
  blur: 10,
  isDark: true,
} as const satisfies Theme

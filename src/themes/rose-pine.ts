import type { Theme } from './types'

export const rosePine = {
  name: 'rose-pine',
  displayName: 'Ros\u00e9 Pine',
  colors: {
    background: '#191724',  // base
    foreground: '#E0DEF4',  // text
    cursor: '#E0DEF4',      // text
    cursorAccent: '#191724', // base
    selectionBackground: '#26233A', // overlay
    selectionForeground: '#E0DEF4', // text
    // ANSI 16 colors — Ros\u00e9 Pine official palette
    black: '#26233A',        // overlay
    red: '#EB6F92',          // love
    green: '#31748F',        // pine
    yellow: '#F6C177',       // gold
    blue: '#9CCFD8',         // foam
    magenta: '#C4A7E7',      // iris
    cyan: '#EBBCBA',         // rose
    white: '#E0DEF4',        // text
    brightBlack: '#6E6A86',  // muted
    brightRed: '#EB6F92',    // love
    brightGreen: '#31748F',  // pine
    brightYellow: '#F6C177', // gold
    brightBlue: '#9CCFD8',   // foam
    brightMagenta: '#C4A7E7', // iris
    brightCyan: '#EBBCBA',   // rose
    brightWhite: '#E0DEF4',  // text
  },
  opacity: 0.95,
  blur: 12,
  isDark: true,
} as const satisfies Theme

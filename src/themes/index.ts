import type { Theme } from './types'
import { dracula } from './dracula'
import { nord } from './nord'
import { solarized } from './solarized'
import { gruvbox } from './gruvbox'
import { rosePine } from './rose-pine'

export type { Theme, ThemeColors, ThemeConfig } from './types'
export { dracula } from './dracula'
export { nord } from './nord'
export { solarized } from './solarized'
export { gruvbox } from './gruvbox'
export { rosePine } from './rose-pine'

export const DEFAULT_THEME = 'dracula'

export const THEMES: ReadonlyMap<string, Theme> = new Map<string, Theme>([
  [dracula.name, dracula],
  [nord.name, nord],
  [solarized.name, solarized],
  [gruvbox.name, gruvbox],
  [rosePine.name, rosePine],
])

export function getTheme(name: string): Theme {
  return THEMES.get(name) ?? THEMES.get(DEFAULT_THEME)!
}

// Theme engine utilities
export {
  ThemeManager,
  themeToXtermOptions,
  themeToCSSProperties,
  applyThemeToDOM,
  serializeThemeConfig,
  deserializeThemeConfig,
} from './theme-manager'
export type { IThemeOptions } from './theme-manager'

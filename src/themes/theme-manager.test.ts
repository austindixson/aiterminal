import { describe, it, expect, beforeEach } from 'vitest'

import type { ThemeConfig } from './types'
import { dracula } from './dracula'
import { nord } from './nord'
import { solarized } from './solarized'
import { gruvbox } from './gruvbox'
import { rosePine } from './rose-pine'
import {
  ThemeManager,
  themeToXtermOptions,
  themeToCSSProperties,
  applyThemeToDOM,
  serializeThemeConfig,
  deserializeThemeConfig,
} from './theme-manager'

// ---------------------------------------------------------------------------
// ThemeManager.getActiveTheme()
// ---------------------------------------------------------------------------
describe('ThemeManager.getActiveTheme()', () => {
  it('returns Dracula as the default theme', () => {
    const manager = ThemeManager.create()
    const active = manager.getActiveTheme()

    expect(active.name).toBe('dracula')
    expect(active.displayName).toBe('Dracula')
  })

  it('returns a correct theme object with all required fields', () => {
    const manager = ThemeManager.create()
    const active = manager.getActiveTheme()

    expect(active).toHaveProperty('name')
    expect(active).toHaveProperty('displayName')
    expect(active).toHaveProperty('colors')
    expect(active).toHaveProperty('opacity')
    expect(active).toHaveProperty('blur')
    expect(active).toHaveProperty('isDark')
    expect(active.colors).toHaveProperty('background')
    expect(active.colors).toHaveProperty('foreground')
  })
})

// ---------------------------------------------------------------------------
// ThemeManager.setTheme(name)
// ---------------------------------------------------------------------------
describe('ThemeManager.setTheme(name)', () => {
  it('switches to a valid theme and returns the new manager', () => {
    const manager = ThemeManager.create()
    const updated = manager.setTheme('nord')

    expect(updated).not.toBeNull()
    expect(updated!.getActiveTheme().name).toBe('nord')
  })

  it('returns null for an invalid theme name', () => {
    const manager = ThemeManager.create()
    const result = manager.setTheme('nonexistent-theme')

    expect(result).toBeNull()
  })

  it('stays on the current theme when given an invalid name', () => {
    const manager = ThemeManager.create()
    manager.setTheme('nonexistent-theme')

    // Original manager is unchanged (immutable)
    expect(manager.getActiveTheme().name).toBe('dracula')
  })

  it('does not mutate the original manager (immutability)', () => {
    const manager = ThemeManager.create()
    const updated = manager.setTheme('gruvbox')

    // Original is unchanged
    expect(manager.getActiveTheme().name).toBe('dracula')
    // Updated has the new theme
    expect(updated!.getActiveTheme().name).toBe('gruvbox')
  })

  it('can switch through all available themes', () => {
    let manager = ThemeManager.create()

    for (const name of ['nord', 'solarized', 'gruvbox', 'rose-pine', 'dracula']) {
      const next = manager.setTheme(name)
      expect(next).not.toBeNull()
      expect(next!.getActiveTheme().name).toBe(name)
      manager = next!
    }
  })
})

// ---------------------------------------------------------------------------
// ThemeManager.getAvailableThemes()
// ---------------------------------------------------------------------------
describe('ThemeManager.getAvailableThemes()', () => {
  it('returns all 5 themes', () => {
    const manager = ThemeManager.create()
    const themes = manager.getAvailableThemes()

    expect(themes).toHaveLength(5)
  })

  it('each theme has name and displayName', () => {
    const manager = ThemeManager.create()
    const themes = manager.getAvailableThemes()

    for (const theme of themes) {
      expect(theme).toHaveProperty('name')
      expect(theme).toHaveProperty('displayName')
      expect(typeof theme.name).toBe('string')
      expect(typeof theme.displayName).toBe('string')
      expect(theme.name.length).toBeGreaterThan(0)
      expect(theme.displayName.length).toBeGreaterThan(0)
    }
  })

  it('includes all expected theme names', () => {
    const manager = ThemeManager.create()
    const names = manager.getAvailableThemes().map((t) => t.name)

    expect(names).toContain('dracula')
    expect(names).toContain('nord')
    expect(names).toContain('solarized')
    expect(names).toContain('gruvbox')
    expect(names).toContain('rose-pine')
  })
})

// ---------------------------------------------------------------------------
// themeToXtermOptions(theme)
// ---------------------------------------------------------------------------
describe('themeToXtermOptions(theme)', () => {
  it('maps background and foreground correctly', () => {
    const opts = themeToXtermOptions(dracula)

    expect(opts.background).toBe(dracula.colors.background)
    expect(opts.foreground).toBe(dracula.colors.foreground)
  })

  it('maps cursor colors correctly', () => {
    const opts = themeToXtermOptions(dracula)

    expect(opts.cursor).toBe(dracula.colors.cursor)
    expect(opts.cursorAccent).toBe(dracula.colors.cursorAccent)
  })

  it('maps selection colors correctly', () => {
    const opts = themeToXtermOptions(dracula)

    expect(opts.selectionBackground).toBe(dracula.colors.selectionBackground)
    expect(opts.selectionForeground).toBe(dracula.colors.selectionForeground)
  })

  it('maps all 16 ANSI colors', () => {
    const opts = themeToXtermOptions(nord)

    expect(opts.black).toBe(nord.colors.black)
    expect(opts.red).toBe(nord.colors.red)
    expect(opts.green).toBe(nord.colors.green)
    expect(opts.yellow).toBe(nord.colors.yellow)
    expect(opts.blue).toBe(nord.colors.blue)
    expect(opts.magenta).toBe(nord.colors.magenta)
    expect(opts.cyan).toBe(nord.colors.cyan)
    expect(opts.white).toBe(nord.colors.white)
    expect(opts.brightBlack).toBe(nord.colors.brightBlack)
    expect(opts.brightRed).toBe(nord.colors.brightRed)
    expect(opts.brightGreen).toBe(nord.colors.brightGreen)
    expect(opts.brightYellow).toBe(nord.colors.brightYellow)
    expect(opts.brightBlue).toBe(nord.colors.brightBlue)
    expect(opts.brightMagenta).toBe(nord.colors.brightMagenta)
    expect(opts.brightCyan).toBe(nord.colors.brightCyan)
    expect(opts.brightWhite).toBe(nord.colors.brightWhite)
  })

  it('returns a proper xterm-compatible object (no extra keys)', () => {
    const opts = themeToXtermOptions(solarized)
    const keys = Object.keys(opts)

    // Should only contain xterm ITheme keys
    const expectedKeys = [
      'background',
      'foreground',
      'cursor',
      'cursorAccent',
      'selectionBackground',
      'selectionForeground',
      'black',
      'red',
      'green',
      'yellow',
      'blue',
      'magenta',
      'cyan',
      'white',
      'brightBlack',
      'brightRed',
      'brightGreen',
      'brightYellow',
      'brightBlue',
      'brightMagenta',
      'brightCyan',
      'brightWhite',
    ]

    expect(keys.sort()).toEqual(expectedKeys.sort())
  })
})

// ---------------------------------------------------------------------------
// themeToCSSProperties(theme)
// ---------------------------------------------------------------------------
describe('themeToCSSProperties(theme)', () => {
  it('returns --terminal-bg and --terminal-fg', () => {
    const props = themeToCSSProperties(dracula)

    expect(props['--terminal-bg']).toBe(dracula.colors.background)
    expect(props['--terminal-fg']).toBe(dracula.colors.foreground)
  })

  it('includes --terminal-cursor and --terminal-cursor-accent', () => {
    const props = themeToCSSProperties(dracula)

    expect(props['--terminal-cursor']).toBe(dracula.colors.cursor)
    expect(props['--terminal-cursor-accent']).toBe(dracula.colors.cursorAccent)
  })

  it('includes --terminal-selection', () => {
    const props = themeToCSSProperties(dracula)

    expect(props['--terminal-selection']).toBe(dracula.colors.selectionBackground)
  })

  it('includes --terminal-opacity and --terminal-blur', () => {
    const props = themeToCSSProperties(dracula)

    expect(props['--window-opacity']).toBe(String(dracula.opacity))
    expect(props['--window-blur']).toBe(`${dracula.blur}px`)
  })

  it('includes all ANSI color CSS variables', () => {
    const props = themeToCSSProperties(gruvbox)

    expect(props['--ansi-black']).toBe(gruvbox.colors.black)
    expect(props['--ansi-red']).toBe(gruvbox.colors.red)
    expect(props['--ansi-green']).toBe(gruvbox.colors.green)
    expect(props['--ansi-yellow']).toBe(gruvbox.colors.yellow)
    expect(props['--ansi-blue']).toBe(gruvbox.colors.blue)
    expect(props['--ansi-magenta']).toBe(gruvbox.colors.magenta)
    expect(props['--ansi-cyan']).toBe(gruvbox.colors.cyan)
    expect(props['--ansi-white']).toBe(gruvbox.colors.white)
    expect(props['--ansi-bright-black']).toBe(gruvbox.colors.brightBlack)
    expect(props['--ansi-bright-red']).toBe(gruvbox.colors.brightRed)
    expect(props['--ansi-bright-green']).toBe(gruvbox.colors.brightGreen)
    expect(props['--ansi-bright-yellow']).toBe(gruvbox.colors.brightYellow)
    expect(props['--ansi-bright-blue']).toBe(gruvbox.colors.brightBlue)
    expect(props['--ansi-bright-magenta']).toBe(gruvbox.colors.brightMagenta)
    expect(props['--ansi-bright-cyan']).toBe(gruvbox.colors.brightCyan)
    expect(props['--ansi-bright-white']).toBe(gruvbox.colors.brightWhite)
  })

  it('all values are strings', () => {
    const props = themeToCSSProperties(rosePine)

    for (const [_key, value] of Object.entries(props)) {
      expect(typeof value).toBe('string')
    }
  })
})

// ---------------------------------------------------------------------------
// applyThemeToDOM(theme)
// ---------------------------------------------------------------------------
describe('applyThemeToDOM(theme)', () => {
  beforeEach(() => {
    // Reset all inline styles on documentElement between tests
    document.documentElement.style.cssText = ''
  })

  it('sets --terminal-bg on documentElement.style', () => {
    applyThemeToDOM(dracula)

    expect(document.documentElement.style.getPropertyValue('--terminal-bg')).toBe(
      dracula.colors.background,
    )
  })

  it('sets --terminal-fg on documentElement.style', () => {
    applyThemeToDOM(nord)

    expect(document.documentElement.style.getPropertyValue('--terminal-fg')).toBe(
      nord.colors.foreground,
    )
  })

  it('sets --window-opacity', () => {
    applyThemeToDOM(dracula)

    expect(document.documentElement.style.getPropertyValue('--window-opacity')).toBe(
      String(dracula.opacity),
    )
  })

  it('sets --window-blur with px suffix', () => {
    applyThemeToDOM(rosePine)

    expect(document.documentElement.style.getPropertyValue('--window-blur')).toBe(
      `${rosePine.blur}px`,
    )
  })

  it('sets all ANSI color CSS custom properties', () => {
    applyThemeToDOM(gruvbox)

    expect(document.documentElement.style.getPropertyValue('--ansi-black')).toBe(
      gruvbox.colors.black,
    )
    expect(document.documentElement.style.getPropertyValue('--ansi-bright-white')).toBe(
      gruvbox.colors.brightWhite,
    )
  })

  it('sets all CSS custom properties from themeToCSSProperties', () => {
    applyThemeToDOM(solarized)
    const expectedProps = themeToCSSProperties(solarized)

    for (const [prop, value] of Object.entries(expectedProps)) {
      expect(document.documentElement.style.getPropertyValue(prop)).toBe(value)
    }
  })
})

// ---------------------------------------------------------------------------
// serializeThemeConfig / deserializeThemeConfig
// ---------------------------------------------------------------------------
describe('serializeThemeConfig(config)', () => {
  it('returns a valid JSON string', () => {
    const config: ThemeConfig = {
      activeTheme: 'dracula',
      customOpacity: null,
      customBlur: null,
    }

    const json = serializeThemeConfig(config)
    expect(() => JSON.parse(json)).not.toThrow()
  })

  it('preserves all config fields in the JSON', () => {
    const config: ThemeConfig = {
      activeTheme: 'nord',
      customOpacity: 0.8,
      customBlur: 15,
    }

    const json = serializeThemeConfig(config)
    const parsed = JSON.parse(json)

    expect(parsed.activeTheme).toBe('nord')
    expect(parsed.customOpacity).toBe(0.8)
    expect(parsed.customBlur).toBe(15)
  })
})

describe('deserializeThemeConfig(json)', () => {
  it('returns a ThemeConfig object from valid JSON', () => {
    const json = JSON.stringify({
      activeTheme: 'gruvbox',
      customOpacity: 0.9,
      customBlur: 20,
    })

    const config = deserializeThemeConfig(json)

    expect(config.activeTheme).toBe('gruvbox')
    expect(config.customOpacity).toBe(0.9)
    expect(config.customBlur).toBe(20)
  })

  it('returns default config for invalid JSON', () => {
    const config = deserializeThemeConfig('not valid json {{{')

    expect(config.activeTheme).toBe('dracula')
    expect(config.customOpacity).toBeNull()
    expect(config.customBlur).toBeNull()
  })

  it('returns default config for empty string', () => {
    const config = deserializeThemeConfig('')

    expect(config.activeTheme).toBe('dracula')
    expect(config.customOpacity).toBeNull()
    expect(config.customBlur).toBeNull()
  })

  it('returns default config when JSON is missing required fields', () => {
    const config = deserializeThemeConfig('{"someOtherField": true}')

    expect(config.activeTheme).toBe('dracula')
    expect(config.customOpacity).toBeNull()
    expect(config.customBlur).toBeNull()
  })

  it('roundtrips through serialize/deserialize', () => {
    const original: ThemeConfig = {
      activeTheme: 'rose-pine',
      customOpacity: 0.75,
      customBlur: 8,
    }

    const roundtripped = deserializeThemeConfig(serializeThemeConfig(original))

    expect(roundtripped).toEqual(original)
  })
})

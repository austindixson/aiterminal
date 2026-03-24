import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeSelector } from './ThemeSelector'

// ---------------------------------------------------------------------------
// Mock useTheme hook
// ---------------------------------------------------------------------------

const mockSetTheme = vi.fn().mockReturnValue(true)
const mockSetOpacity = vi.fn()
const mockSetBlur = vi.fn()

const mockThemes = [
  {
    name: 'dracula',
    displayName: 'Dracula',
    colors: {
      background: '#282A36',
      foreground: '#F8F8F2',
      cursor: '#F8F8F2',
      cursorAccent: '#282A36',
      selectionBackground: '#44475A',
      selectionForeground: '#F8F8F2',
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
  },
  {
    name: 'nord',
    displayName: 'Nord',
    colors: {
      background: '#2E3440',
      foreground: '#D8DEE9',
      cursor: '#D8DEE9',
      cursorAccent: '#2E3440',
      selectionBackground: '#434C5E',
      selectionForeground: '#D8DEE9',
      black: '#3B4252',
      red: '#BF616A',
      green: '#A3BE8C',
      yellow: '#EBCB8B',
      blue: '#81A1C1',
      magenta: '#B48EAD',
      cyan: '#88C0D0',
      white: '#E5E9F0',
      brightBlack: '#4C566A',
      brightRed: '#BF616A',
      brightGreen: '#A3BE8C',
      brightYellow: '#EBCB8B',
      brightBlue: '#81A1C1',
      brightMagenta: '#B48EAD',
      brightCyan: '#8FBCBB',
      brightWhite: '#ECEFF4',
    },
    opacity: 0.92,
    blur: 12,
    isDark: true,
  },
  {
    name: 'solarized',
    displayName: 'Solarized Dark',
    colors: {
      background: '#002B36',
      foreground: '#839496',
      cursor: '#839496',
      cursorAccent: '#002B36',
      selectionBackground: '#073642',
      selectionForeground: '#839496',
      black: '#073642',
      red: '#DC322F',
      green: '#859900',
      yellow: '#B58900',
      blue: '#268BD2',
      magenta: '#D33682',
      cyan: '#2AA198',
      white: '#EEE8D5',
      brightBlack: '#586E75',
      brightRed: '#CB4B16',
      brightGreen: '#586E75',
      brightYellow: '#657B83',
      brightBlue: '#839496',
      brightMagenta: '#6C71C4',
      brightCyan: '#93A1A1',
      brightWhite: '#FDF6E3',
    },
    opacity: 0.9,
    blur: 15,
    isDark: true,
  },
  {
    name: 'gruvbox',
    displayName: 'Gruvbox Dark',
    colors: {
      background: '#282828',
      foreground: '#EBDBB2',
      cursor: '#EBDBB2',
      cursorAccent: '#282828',
      selectionBackground: '#3C3836',
      selectionForeground: '#EBDBB2',
      black: '#282828',
      red: '#CC241D',
      green: '#98971A',
      yellow: '#D79921',
      blue: '#458588',
      magenta: '#B16286',
      cyan: '#689D6A',
      white: '#A89984',
      brightBlack: '#928374',
      brightRed: '#FB4934',
      brightGreen: '#B8BB26',
      brightYellow: '#FABD2F',
      brightBlue: '#83A598',
      brightMagenta: '#D3869B',
      brightCyan: '#8EC07C',
      brightWhite: '#EBDBB2',
    },
    opacity: 0.93,
    blur: 8,
    isDark: true,
  },
  {
    name: 'rose-pine',
    displayName: 'Rose Pine',
    colors: {
      background: '#191724',
      foreground: '#E0DEF4',
      cursor: '#E0DEF4',
      cursorAccent: '#191724',
      selectionBackground: '#2A273F',
      selectionForeground: '#E0DEF4',
      black: '#26233A',
      red: '#EB6F92',
      green: '#31748F',
      yellow: '#F6C177',
      blue: '#9CCFD8',
      magenta: '#C4A7E7',
      cyan: '#EBBCBA',
      white: '#E0DEF4',
      brightBlack: '#6E6A86',
      brightRed: '#EB6F92',
      brightGreen: '#31748F',
      brightYellow: '#F6C177',
      brightBlue: '#9CCFD8',
      brightMagenta: '#C4A7E7',
      brightCyan: '#EBBCBA',
      brightWhite: '#E0DEF4',
    },
    opacity: 0.9,
    blur: 20,
    isDark: true,
  },
]

vi.mock('@/renderer/hooks/useTheme', () => ({
  useTheme: () => ({
    activeTheme: mockThemes[0],
    setTheme: mockSetTheme,
    availableThemes: mockThemes,
    setOpacity: mockSetOpacity,
    setBlur: mockSetBlur,
  }),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ThemeSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the theme toggle button', () => {
    render(<ThemeSelector />)

    expect(
      screen.getByRole('button', { name: /theme/i }),
    ).toBeInTheDocument()
  })

  it('shows dropdown with all 5 themes when toggled', async () => {
    const user = userEvent.setup()

    render(<ThemeSelector />)

    await user.click(screen.getByRole('button', { name: /theme/i }))

    expect(screen.getByText('Dracula')).toBeInTheDocument()
    expect(screen.getByText('Nord')).toBeInTheDocument()
    expect(screen.getByText('Solarized Dark')).toBeInTheDocument()
    expect(screen.getByText('Gruvbox Dark')).toBeInTheDocument()
    expect(screen.getByText('Rose Pine')).toBeInTheDocument()
  })

  it('shows the active theme as selected with a checkmark', async () => {
    const user = userEvent.setup()

    render(<ThemeSelector />)

    await user.click(screen.getByRole('button', { name: /theme/i }))

    const draculaOption = screen.getByTestId('theme-option-dracula')
    expect(within(draculaOption).getByTestId('theme-checkmark')).toBeInTheDocument()
  })

  it('calls setTheme when a theme is clicked', async () => {
    const user = userEvent.setup()

    render(<ThemeSelector />)

    await user.click(screen.getByRole('button', { name: /theme/i }))
    await user.click(screen.getByText('Nord'))

    expect(mockSetTheme).toHaveBeenCalledWith('nord')
  })

  it('shows theme color preview swatches for each option', async () => {
    const user = userEvent.setup()

    render(<ThemeSelector />)

    await user.click(screen.getByRole('button', { name: /theme/i }))

    const draculaOption = screen.getByTestId('theme-option-dracula')
    const swatches = within(draculaOption).getAllByTestId('color-swatch')

    // Should show 4 swatches: bg, fg, accent1 (blue), accent2 (magenta)
    expect(swatches).toHaveLength(4)
  })

  it('renders opacity slider', async () => {
    const user = userEvent.setup()

    render(<ThemeSelector />)

    await user.click(screen.getByRole('button', { name: /theme/i }))

    expect(screen.getByLabelText(/opacity/i)).toBeInTheDocument()
  })

  it('renders blur slider', async () => {
    const user = userEvent.setup()

    render(<ThemeSelector />)

    await user.click(screen.getByRole('button', { name: /theme/i }))

    expect(screen.getByLabelText(/blur/i)).toBeInTheDocument()
  })
})

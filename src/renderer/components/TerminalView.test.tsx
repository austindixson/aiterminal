import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock xterm.js and addons — vi.hoisted ensures these exist before vi.mock
// ---------------------------------------------------------------------------

const { mockTerminalInstance, MockTerminal } = vi.hoisted(() => {
  const instance = {
    open: vi.fn(),
    dispose: vi.fn(),
    focus: vi.fn(),
    write: vi.fn(),
    writeln: vi.fn(),
    onData: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    loadAddon: vi.fn(),
    options: {} as Record<string, unknown>,
  }
  const ctor = vi.fn().mockImplementation(() => instance)
  return { mockTerminalInstance: instance, MockTerminal: ctor }
})

vi.mock('@xterm/xterm', () => ({
  Terminal: MockTerminal,
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: vi.fn(),
    dispose: vi.fn(),
    activate: vi.fn(),
  })),
}))

// ---------------------------------------------------------------------------
// Mock theme
// ---------------------------------------------------------------------------

const mockTheme = {
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
}

import { TerminalView } from './TerminalView'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TerminalView', () => {
  const onCommand = vi.fn()
  const sessionId = 'test-session-id'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a terminal container div', () => {
    render(<TerminalView onCommand={onCommand} theme={mockTheme} sessionId={sessionId} />)

    const container = screen.getByTestId('terminal-view')
    expect(container).toBeInTheDocument()
  })

  it('applies theme colors via xterm options', () => {
    render(<TerminalView onCommand={onCommand} theme={mockTheme} sessionId={sessionId} />)

    expect(MockTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: expect.objectContaining({
          background: 'rgba(40, 42, 54, 0)',
          foreground: '#F8F8F2',
          cursor: '#F8F8F2',
        }),
      }),
    )
  })

  it('calls onCommand when user presses Enter', () => {
    render(<TerminalView onCommand={onCommand} theme={mockTheme} sessionId={sessionId} />)

    // Grab the callback passed to terminal.onData
    const onDataCb = mockTerminalInstance.onData.mock.calls[0]?.[0]
    expect(onDataCb).toBeDefined()

    // Simulate typing "ls -la" then pressing Enter (\r)
    onDataCb('l')
    onDataCb('s')
    onDataCb(' ')
    onDataCb('-')
    onDataCb('l')
    onDataCb('a')
    onDataCb('\r')

    expect(onCommand).toHaveBeenCalledWith('ls -la')
  })

  it('when NL is handled, clears the line with Ctrl+U (no SIGINT) and erases typed text in xterm', () => {
    const writeToSession = vi.fn()
    const w = window as unknown as {
      electronAPI?: { writeToSession: typeof writeToSession; onSessionData: () => () => void }
    }
    const prev = w.electronAPI
    w.electronAPI = {
      writeToSession,
      onSessionData: vi.fn(() => () => {}),
    }
    try {
      const onCommandNl = vi.fn().mockReturnValue(true)
      render(<TerminalView onCommand={onCommandNl} theme={mockTheme} sessionId={sessionId} />)

      const onDataCb = mockTerminalInstance.onData.mock.calls[0]?.[0]
      expect(onDataCb).toBeDefined()

      onDataCb('h')
      onDataCb('i')
      onDataCb('\r')

      expect(onCommandNl).toHaveBeenCalledWith('hi')
      expect(writeToSession).toHaveBeenCalledWith(sessionId, '\x15')
      expect(mockTerminalInstance.write).toHaveBeenCalledWith('\b\b\x1b[K')
    } finally {
      if (prev !== undefined) {
        w.electronAPI = prev
      } else {
        delete w.electronAPI
      }
    }
  })

  it('opens xterm Terminal into the container div', () => {
    render(<TerminalView onCommand={onCommand} theme={mockTheme} sessionId={sessionId} />)

    expect(mockTerminalInstance.open).toHaveBeenCalledWith(
      expect.any(HTMLElement),
    )
  })

  it('loads the FitAddon', () => {
    render(<TerminalView onCommand={onCommand} theme={mockTheme} sessionId={sessionId} />)

    expect(mockTerminalInstance.loadAddon).toHaveBeenCalled()
  })

  it('disposes xterm Terminal on unmount', () => {
    const { unmount } = render(
      <TerminalView onCommand={onCommand} theme={mockTheme} sessionId={sessionId} />,
    )

    unmount()

    expect(mockTerminalInstance.dispose).toHaveBeenCalled()
  })
})

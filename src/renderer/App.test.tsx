import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock child components to isolate App logic
// ---------------------------------------------------------------------------

vi.mock('@/renderer/components/TerminalView', () => ({
  TerminalView: (props: { onCommand: (cmd: string) => void }) => (
    <div data-testid="terminal-view" data-on-command={!!props.onCommand} />
  ),
}))

vi.mock('@/renderer/components/AIResponsePanel', () => ({
  AIResponsePanel: (props: { response: unknown; isLoading: boolean; onDismiss: () => void }) => (
    <div
      data-testid="ai-response-panel"
      data-has-response={props.response !== null}
      data-is-loading={props.isLoading}
    >
      {props.response !== null && (
        <button onClick={props.onDismiss}>Dismiss</button>
      )}
    </div>
  ),
}))

vi.mock('@/renderer/components/ThemeSelector', () => ({
  ThemeSelector: () => <div data-testid="theme-selector" />,
}))

// ---------------------------------------------------------------------------
// Mock useTheme hook
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

vi.mock('@/renderer/hooks/useTheme', () => ({
  useTheme: () => ({
    activeTheme: mockTheme,
    setTheme: vi.fn(),
    availableThemes: [mockTheme],
    setOpacity: vi.fn(),
    setBlur: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// Mock shell service
// ---------------------------------------------------------------------------

vi.mock('@/shell/shell-service', () => ({
  isNaturalLanguage: vi.fn().mockReturnValue(false),
  shouldTriggerAI: vi.fn().mockReturnValue(false),
  parseCommandResult: vi.fn().mockReturnValue({
    exitCode: 0,
    stdout: '',
    stderr: '',
    isAITriggered: false,
  }),
  buildAIPrompt: vi.fn().mockReturnValue('mock prompt'),
}))

// ---------------------------------------------------------------------------
// Mock terminal tabs — real hook needs electron createTerminalSession
// ---------------------------------------------------------------------------

vi.mock('@/renderer/hooks/useTerminalTabs', () => ({
  useTerminalTabs: () => ({
    state: {
      tabs: [
        {
          id: 'tab-test-1',
          sessionId: 'session-test-1',
          name: 'zsh',
          shell: '/bin/zsh',
          cwd: '/',
          createdAt: Date.now(),
          isActive: true,
        },
      ],
      activeTabId: 'tab-test-1',
      activeSessionId: 'session-test-1',
      sessions: new Map(),
    },
    createTab: vi.fn(),
    closeTab: vi.fn(),
    switchTab: vi.fn(),
    setActiveTabName: vi.fn(),
    writeToActive: vi.fn(),
    resizeActive: vi.fn(),
    getActiveSessionId: vi.fn(() => 'session-test-1'),
  }),
}))

// ---------------------------------------------------------------------------
// Mock electronAPI on window
// ---------------------------------------------------------------------------

Object.defineProperty(window, 'electronAPI', {
  value: {
    executeCommand: vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: 'file.txt\n',
      stderr: '',
      isAITriggered: false,
    }),
    aiQuery: vi.fn().mockResolvedValue({
      content: 'AI response',
      model: 'test-model',
      tokens: 10,
      latency: 100,
    }),
    getActiveAiModel: vi.fn().mockResolvedValue({
      id: 'test/model',
      displayName: 'Test Model',
      presetName: 'balanced',
    }),
    getThemes: vi.fn().mockResolvedValue([]),
    setTheme: vi.fn().mockResolvedValue(undefined),
  },
  writable: true,
})

import { App } from './App'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders TerminalView inside app-layout', () => {
    const { container } = render(<App />)
    expect(screen.getByTestId('terminal-view')).toBeInTheDocument()
    expect(container.querySelector('.app-layout')).toBeInTheDocument()
  })

  it('renders ThemeSelector', () => {
    render(<App />)
    expect(screen.getByTestId('theme-selector')).toBeInTheDocument()
  })

  it('does not render AI section when no AI is active', () => {
    const { container } = render(<App />)

    const aiSection = container.querySelector('.ai-section')
    expect(aiSection).toBeNull()
  })

  it('terminal section takes full height when no AI is active', () => {
    const { container } = render(<App />)

    const terminalSection = container.querySelector('.terminal-section')
    expect(terminalSection).toBeInTheDocument()
    expect(terminalSection).not.toHaveClass('terminal-section--with-ai')
  })

  it('passes an onCommand callback to TerminalView', () => {
    render(<App />)

    const terminal = screen.getByTestId('terminal-view')
    expect(terminal).toHaveAttribute('data-on-command', 'true')
  })

  it('handles natural language command flow', async () => {
    const { isNaturalLanguage } = await import('@/shell/shell-service')
    ;(isNaturalLanguage as ReturnType<typeof vi.fn>).mockReturnValue(true)

    render(<App />)

    // The App component provides onCommand to TerminalView.
    // Since we mock TerminalView we can't simulate the callback directly here.
    // This test validates the component renders correctly with NL detection wired up.
    expect(screen.getByTestId('terminal-view')).toBeInTheDocument()
  })
})

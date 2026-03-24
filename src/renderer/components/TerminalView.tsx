import { useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { Theme } from '@/themes/types'
import { themeToXtermOptions } from '@/themes/theme-manager'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TerminalViewProps {
  readonly onCommand: (input: string) => void
  readonly theme: Theme
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TerminalView: React.FC<TerminalViewProps> = ({ onCommand, theme }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const inputBufferRef = useRef<string>('')

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const xtermTheme = themeToXtermOptions(theme)

    const terminal = new Terminal({
      theme: xtermTheme,
      fontFamily: '"SF Mono", "Cascadia Code", "Fira Code", "JetBrains Mono", "Menlo", "Consolas", monospace',
      fontSize: 14,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(container)

    try {
      fitAddon.fit()
    } catch {
      // FitAddon.fit() can throw if container has zero dimensions (e.g., in tests)
    }

    // Buffer keystrokes and fire onCommand on Enter
    const dataDisposable = terminal.onData((data: string) => {
      if (data === '\r' || data === '\n') {
        const command = inputBufferRef.current
        inputBufferRef.current = ''
        terminal.write('\r\n')
        if (command.length > 0) {
          onCommand(command)
        }
      } else if (data === '\x7f') {
        // Backspace
        if (inputBufferRef.current.length > 0) {
          inputBufferRef.current = inputBufferRef.current.slice(0, -1)
          terminal.write('\b \b')
        }
      } else {
        inputBufferRef.current += data
        terminal.write(data)
      }
    })

    // Handle resize
    const handleResize = () => {
      try {
        fitAddon.fit()
      } catch {
        // Ignore fit errors during resize
      }
    }
    window.addEventListener('resize', handleResize)

    // Observe container dimension changes (e.g., when AI panel splits the viewport)
    const resizeObserver = new ResizeObserver(() => {
      handleResize()
    })
    resizeObserver.observe(container)

    terminalRef.current = terminal
    terminal.focus()

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', handleResize)
      dataDisposable.dispose()
      terminal.dispose()
      terminalRef.current = null
    }
  }, [theme, onCommand])

  return (
    <div
      ref={containerRef}
      className="terminal-view"
      data-testid="terminal-view"
    />
  )
}

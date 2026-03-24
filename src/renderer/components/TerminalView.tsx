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
  readonly onPtyOutput?: (data: string) => void
  readonly theme: Theme
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TerminalView: React.FC<TerminalViewProps> = ({ onCommand, onPtyOutput, theme }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const inputBufferRef = useRef<string>('')
  const onCommandRef = useRef(onCommand)
  const onPtyOutputRef = useRef(onPtyOutput)
  onCommandRef.current = onCommand
  onPtyOutputRef.current = onPtyOutput

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

    // Check if electronAPI is available (not in tests)
    const hasElectronAPI = typeof window !== 'undefined' && 'electronAPI' in window

    // Receive PTY output → write to xterm display + forward to parent
    if (hasElectronAPI) {
      window.electronAPI.onPtyData((data: string) => {
        terminal.write(data)
        onPtyOutputRef.current?.(data)
      })
    }

    // Send keystrokes to PTY AND track input buffer for AI routing
    const dataDisposable = terminal.onData((data: string) => {
      // Track the current line for AI detection on Enter
      if (data === '\r' || data === '\n') {
        const command = inputBufferRef.current
        inputBufferRef.current = ''
        if (command.length > 0) {
          onCommandRef.current(command)
        }
      } else if (data === '\x7f') {
        // Backspace — update buffer
        if (inputBufferRef.current.length > 0) {
          inputBufferRef.current = inputBufferRef.current.slice(0, -1)
        }
      } else {
        inputBufferRef.current += data
      }

      // Forward ALL keystrokes to PTY (PTY handles echo, not us)
      if (hasElectronAPI) {
        window.electronAPI.writeToPty(data)
      }
    })

    // Handle resize — sync xterm AND PTY dimensions
    const handleResize = () => {
      try {
        fitAddon.fit()
        if (hasElectronAPI && terminal.cols && terminal.rows) {
          window.electronAPI.resizePty(terminal.cols, terminal.rows)
        }
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

    // Initial resize sync
    handleResize()

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', handleResize)
      dataDisposable.dispose()
      terminal.dispose()
      terminalRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  return (
    <div
      ref={containerRef}
      className="terminal-view"
      data-testid="terminal-view"
    />
  )
}

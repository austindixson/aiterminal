import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { Theme } from '@/themes/types'
import { themeToXtermOptions } from '@/themes/theme-manager'

export interface TerminalViewProps {
  /** Called on Enter. Return true if handled (NL → chat) to prevent PTY execution. */
  readonly onCommand: (input: string) => boolean
  readonly onPtyOutput?: (data: string) => void
  readonly theme: Theme
}

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
    if (!container) return

    const xtermTheme = themeToXtermOptions(theme)

    const terminal = new Terminal({
      theme: xtermTheme,
      fontFamily: '"SF Mono", "Cascadia Code", "Fira Code", "JetBrains Mono", "Menlo", "Consolas", monospace',
      fontSize: 14,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowProposedApi: true,
      allowTransparency: true,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(container)

    try { fitAddon.fit() } catch { /* ignore zero-dimension errors */ }

    const hasElectronAPI = typeof window !== 'undefined' && 'electronAPI' in window

    // PTY output → xterm
    if (hasElectronAPI) {
      window.electronAPI.onPtyData((data: string) => {
        terminal.write(data)
        onPtyOutputRef.current?.(data)
      })
    }

    // Keystrokes → PTY + command tracking
    const dataDisposable = terminal.onData((data: string) => {
      if (data === '\r' || data === '\n') {
        const command = inputBufferRef.current
        inputBufferRef.current = ''

        if (command.length > 0) {
          const handled = onCommandRef.current(command)
          if (handled) {
            // Natural language was routed to chat — clear the shell line
            // (chars were already echoed to PTY while typing)
            if (hasElectronAPI) {
              window.electronAPI.writeToPty('\x15\r') // Ctrl+U: kill line + newline for clean prompt
            }
            return // don't send Enter to PTY
          }
        }
      } else if (data === '\x7f') {
        if (inputBufferRef.current.length > 0) {
          inputBufferRef.current = inputBufferRef.current.slice(0, -1)
        }
      } else {
        inputBufferRef.current += data
      }

      if (hasElectronAPI) {
        window.electronAPI.writeToPty(data)
      }
    })

    // Resize sync
    const handleResize = () => {
      try {
        fitAddon.fit()
        if (hasElectronAPI && terminal.cols && terminal.rows) {
          window.electronAPI.resizePty(terminal.cols, terminal.rows)
        }
      } catch { /* ignore */ }
    }
    window.addEventListener('resize', handleResize)

    const resizeObserver = new ResizeObserver(() => handleResize())
    resizeObserver.observe(container)

    terminalRef.current = terminal
    terminal.focus()
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

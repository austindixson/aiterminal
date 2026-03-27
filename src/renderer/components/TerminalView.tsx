/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/components/TerminalView.tsx
 * Module: renderer/components
 * Purpose: xterm.js terminal wrapper - handles PTY I/O, resize, focus, and natural language interception
 * Dependencies: react, @xterm/xterm, @xterm/addon-fit, @/themes/types, @/themes/theme-manager
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/App.tsx, /Users/ghost/Desktop/aiterminal/src/main/terminal-session-manager.ts
 * Keywords: terminal, xterm, pty, fit-addon, resize, focus, natural-language
 * Last Updated: 2026-03-24
 */

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { Theme } from '@/themes/types'
import { themeToXtermOptions } from '@/themes/theme-manager'

export interface TerminalViewProps {
  /** Called on Enter. Return true if handled (NL → chat) to prevent PTY execution. */
  readonly onCommand: (input: string) => boolean
  readonly onPtyOutput?: (data: string) => void
  readonly theme: Theme
  readonly sessionId: string | null
  /** When false, terminal is hidden (another tab is active) — skip focus; refit when true again. */
  readonly isActive?: boolean
}

export interface TerminalViewRef {
  readonly terminal: Terminal | null
  selectAll: () => void
}

export const TerminalView = forwardRef<TerminalViewRef, TerminalViewProps>((props, ref) => {
  const {
    onCommand,
    onPtyOutput,
    theme,
    sessionId,
    isActive = true,
  } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const inputBufferRef = useRef<string>('')
  const onCommandRef = useRef(onCommand)
  const onPtyOutputRef = useRef(onPtyOutput)
  const sessionIdRef = useRef(sessionId)
  const isActiveRef = useRef(isActive)
  onCommandRef.current = onCommand
  onPtyOutputRef.current = onPtyOutput
  sessionIdRef.current = sessionId
  isActiveRef.current = isActive

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
    fitAddonRef.current = fitAddon
    terminal.loadAddon(fitAddon)
    terminal.open(container)

    try { fitAddon.fit() } catch { /* ignore zero-dimension errors */ }

    const api = typeof window !== 'undefined' ? window.electronAPI : undefined

    const sid = sessionIdRef.current
    const unsubscribe =
      sid && api?.onSessionData
        ? api.onSessionData(sid, (data: string) => {
            terminal.write(data)
            if (isActiveRef.current) {
              onPtyOutputRef.current?.(data)
            }
          })
        : () => {}

    // Store unsubscribe for cleanup (use `terminal` — ref is assigned below)
    ;(terminal as unknown as { _sessionUnsubscribe?: () => void })._sessionUnsubscribe =
      unsubscribe

    // Keystrokes → PTY + command tracking
    const dataDisposable = terminal.onData((data: string) => {
      let skipPtyWrite = false

      if (data === '\r' || data === '\n') {
        const command = inputBufferRef.current
        inputBufferRef.current = ''

        if (command.length > 0) {
          const handled = onCommandRef.current(command)
          if (handled) {
            // Natural language — do not send Enter to the shell; keep PTY buffer in sync
            // and avoid Ctrl+C (would print ^C and extra prompts / clutter).
            skipPtyWrite = true
            const cells = [...command].length
            if (cells > 0) {
              // Erase what the user typed from the xterm buffer (cursor is after the text).
              terminal.write('\b'.repeat(cells) + '\x1b[K')
            }
            if (api) {
              // Readline/zle: Ctrl+U clears the current line in the shell without SIGINT.
              const clearLine = '\x15'
              if (sessionIdRef.current) {
                api.writeToSession(sessionIdRef.current, clearLine)
              } else {
                api.writeToPty(clearLine)
              }
            }
          }
          // For shell commands: don't skip Enter (let it execute normally)
        }
      } else if (data === '\x7f') {
        // Backspace — remove from input buffer
        if (inputBufferRef.current.length > 0) {
          inputBufferRef.current = inputBufferRef.current.slice(0, -1)
        }
      } else {
        // Regular character — add to input buffer
        inputBufferRef.current += data
      }

      // Send to PTY (unless skipped for NL handling)
      if (api && !skipPtyWrite) {
        if (sessionIdRef.current) {
          api.writeToSession(sessionIdRef.current, data)
        } else {
          api.writeToPty(data)
        }
      }
    })

    // Resize sync
    const handleResize = () => {
      try {
        fitAddon.fit()
        if (api && terminal.cols && terminal.rows) {
          if (sessionIdRef.current) {
            api.resizeSession(sessionIdRef.current, terminal.cols, terminal.rows)
          } else {
            api.resizePty(terminal.cols, terminal.rows)
          }
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
      const t = terminal as unknown as { _sessionUnsubscribe?: () => void }
      t._sessionUnsubscribe?.()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [theme, sessionId])

  // Update sessionId ref when it changes (for immediate access in effects)
  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  // After tab switch, refit and focus so prompt redraws and input goes to the visible shell
  useEffect(() => {
    if (!isActive) return
    const id = requestAnimationFrame(() => {
      try {
        fitAddonRef.current?.fit()
        terminalRef.current?.focus()
      } catch {
        /* ignore */
      }
    })
    return () => cancelAnimationFrame(id)
  }, [isActive])

  // Expose terminal methods via ref
  useImperativeHandle(ref, () => ({
    terminal: terminalRef.current,
    selectAll: () => {
      terminalRef.current?.selectAll()
    },
  }), [])

  return (
    <div
      ref={containerRef}
      className="terminal-view"
      data-testid="terminal-view"
    />
  )
})

TerminalView.displayName = 'TerminalView'

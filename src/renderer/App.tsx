import { useState, useCallback, useEffect, useRef } from 'react'
import type { FC } from 'react'
import type { AIResponse } from '@/ai/types'
import type { AIQueryRequest } from '@/types/index'
import { useTheme } from '@/renderer/hooks/useTheme'
import { useCmdK } from '@/renderer/hooks/useCmdK'
import { isNaturalLanguage, buildAIPrompt } from '@/shell/shell-service'
import { TerminalView } from '@/renderer/components/TerminalView'
import { AIResponsePanel } from '@/renderer/components/AIResponsePanel'
import { CmdKBar } from '@/renderer/components/CmdKBar'
import { ThemeSelector } from '@/renderer/components/ThemeSelector'

function classifyNaturalLanguage(input: string): 'code_explain' | 'general' {
  const codePhrases = /\b(code|function|class|module|import|export|variable|error|bug|syntax)\b/i
  return codePhrases.test(input) ? 'code_explain' : 'general'
}

function mapIpcResponse(ipcResponse: any): AIResponse {
  return {
    content: ipcResponse.content ?? '',
    model: ipcResponse.model ?? '',
    inputTokens: ipcResponse.inputTokens ?? 0,
    outputTokens: ipcResponse.outputTokens ?? ipcResponse.tokens ?? 0,
    latencyMs: ipcResponse.latencyMs ?? ipcResponse.latency ?? 0,
    cost: ipcResponse.cost ?? 0,
  }
}

function createErrorAIResponse(message: string): AIResponse {
  return {
    content: message,
    model: 'error',
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    cost: 0,
  }
}

/**
 * Parse [RUN]command[/RUN] tags from AI response.
 * Returns { command, cleanContent } or null if no RUN tag.
 */
function parseAutoRun(content: string): { command: string; cleanContent: string } | null {
  const match = content.match(/\[RUN\](.*?)\[\/RUN\]/s)
  if (!match) return null
  const command = match[1].trim()
  const cleanContent = content.replace(/\[RUN\].*?\[\/RUN\]/s, '').trim()
  return { command, cleanContent }
}

export const App: FC = () => {
  const { activeTheme } = useTheme()
  const [aiResponse, setAIResponse] = useState<AIResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const cmdK = useCmdK()

  // Global Cmd+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        cmdK.toggle()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cmdK.toggle])

  const handleDismiss = useCallback(() => {
    setAIResponse(null)
  }, [])

  // Track last command for error-triggered AI
  const lastCommandRef = useRef<string>('')

  // Handle AI response — auto-execute [RUN] commands
  const processAIResponse = useCallback((response: any) => {
    const mapped = mapIpcResponse(response)
    const autoRun = parseAutoRun(mapped.content)

    if (autoRun && autoRun.command) {
      // Auto-execute the command via PTY
      const hasElectronAPI = typeof window !== 'undefined' && 'electronAPI' in window
      if (hasElectronAPI) {
        window.electronAPI.writeToPty(autoRun.command + '\r')
      }

      // Show what we did (or the explanation if any)
      if (autoRun.cleanContent) {
        setAIResponse({ ...mapped, content: `Ran: \`${autoRun.command}\`\n\n${autoRun.cleanContent}` })
      } else {
        setAIResponse({ ...mapped, content: `Ran: \`${autoRun.command}\`` })
      }
      // Auto-dismiss after 3 seconds for simple auto-runs
      setTimeout(() => setAIResponse(null), 3000)
    } else {
      setAIResponse(mapped)
    }
  }, [])

  const handleCommand = useCallback(async (input: string) => {
    const trimmed = input.trim()
    if (trimmed.length === 0) return

    if (isNaturalLanguage(trimmed)) {
      setIsLoading(true)
      try {
        const taskType = classifyNaturalLanguage(trimmed)
        const prompt = buildAIPrompt(trimmed, null, taskType)
        const request: AIQueryRequest = { prompt, taskType }
        const response = await window.electronAPI.aiQuery(request)
        processAIResponse(response)
      } catch {
        setAIResponse(createErrorAIResponse('Failed to get AI response.'))
      } finally {
        setIsLoading(false)
      }
      return
    }
    // Shell commands go directly through PTY — save for error detection
    lastCommandRef.current = trimmed
  }, [processAIResponse])

  // Monitor PTY output for error patterns and trigger AI
  const handlePtyOutput = useCallback((data: string) => {
    const errorPatterns = [
      /command not found/i,
      /No such file or directory/i,
      /Permission denied/i,
      /not recognized as/i,
    ]

    const cmd = lastCommandRef.current
    if (cmd && errorPatterns.some(p => p.test(data))) {
      const capturedCmd = cmd
      lastCommandRef.current = '' // prevent re-trigger

      setIsLoading(true)
      const prompt = buildAIPrompt(capturedCmd, {
        exitCode: 127,
        stdout: '',
        stderr: data.trim(),
        isAITriggered: true,
      }, 'command_help')

      window.electronAPI.aiQuery({ prompt, taskType: 'command_help' })
        .then((response: any) => {
          processAIResponse(response)
        })
        .catch(() => {
          setAIResponse(createErrorAIResponse('Failed to get AI help.'))
        })
        .finally(() => {
          setIsLoading(false)
        })
    }
  }, [processAIResponse])

  const isAIActive = aiResponse !== null || isLoading

  return (
    <div className="app-layout">
      {/* Titlebar with drag region */}
      <div className="titlebar">
        <span className="titlebar__title">AITerminal</span>
      </div>

      {/* Theme selector in titlebar area */}
      <ThemeSelector />

      {/* Terminal */}
      <div className={`terminal-section${isAIActive ? ' terminal-section--with-ai' : ''}`}>
        <TerminalView onCommand={handleCommand} onPtyOutput={handlePtyOutput} theme={activeTheme} />
      </div>

      {/* AI panel */}
      {isAIActive && (
        <div className="ai-section">
          <AIResponsePanel
            response={aiResponse}
            isLoading={isLoading}
            onDismiss={handleDismiss}
          />
        </div>
      )}

      {/* Cmd+K inline AI bar */}
      <CmdKBar
        state={cmdK.state}
        onClose={cmdK.close}
        onSubmit={cmdK.submit}
        onQueryChange={cmdK.setQuery}
        onNavigateHistory={cmdK.navigateHistory}
      />

      {/* Status bar */}
      <div className="statusbar">
        <div className="statusbar__item">
          <span className="statusbar__dot" />
          <span>zsh</span>
        </div>
        <div className="statusbar__separator" />
        <div className="statusbar__item">
          <span>{activeTheme.displayName}</span>
        </div>
        <div className="statusbar__separator" />
        <div className="statusbar__item">
          <span className={`statusbar__dot${isAIActive ? ' statusbar__dot--ai' : ''}`} style={{ background: isAIActive ? undefined : 'transparent', boxShadow: isAIActive ? undefined : 'none' }} />
          <span>{isAIActive ? 'AI Active' : 'AI Ready'}</span>
        </div>
        <div style={{ flex: 1 }} />
        <div className="statusbar__item">
          <span style={{ opacity: 0.6 }}>v0.1.0</span>
        </div>
      </div>
    </div>
  )
}

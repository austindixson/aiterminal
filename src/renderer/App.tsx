import { useState, useCallback } from 'react'
import type { FC } from 'react'
import type { AIResponse } from '@/ai/types'
import type { AIQueryRequest } from '@/types/index'
import { useTheme } from '@/renderer/hooks/useTheme'
import { isNaturalLanguage, shouldTriggerAI, parseCommandResult, buildAIPrompt } from '@/shell/shell-service'
import { TerminalView } from '@/renderer/components/TerminalView'
import { AIResponsePanel } from '@/renderer/components/AIResponsePanel'
import { ThemeSelector } from '@/renderer/components/ThemeSelector'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Classify a natural-language input into a TaskType for AI prompt construction.
 * Simple heuristic: questions about code -> code_explain, otherwise -> general.
 */
function classifyNaturalLanguage(input: string): 'code_explain' | 'general' {
  const codePhrases = /\b(code|function|class|module|import|export|variable|error|bug|syntax)\b/i
  return codePhrases.test(input) ? 'code_explain' : 'general'
}

/**
 * Map the IPC AIResponse shape (types/index.ts) to the AI module's richer AIResponse shape.
 */
function mapIpcResponse(
  ipcResponse: { content: string; model: string; tokens: number; latency: number },
): AIResponse {
  return {
    content: ipcResponse.content,
    model: ipcResponse.model,
    inputTokens: 0,
    outputTokens: ipcResponse.tokens,
    latencyMs: ipcResponse.latency,
    cost: 0,
  }
}

/**
 * Create an error AIResponse for display in the panel.
 */
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

// ---------------------------------------------------------------------------
// App Component
// ---------------------------------------------------------------------------

export const App: FC = () => {
  const { activeTheme } = useTheme()

  const [aiResponse, setAIResponse] = useState<AIResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleDismiss = useCallback(() => {
    setAIResponse(null)
  }, [])

  const handleCommand = useCallback(async (input: string) => {
    const trimmed = input.trim()
    if (trimmed.length === 0) {
      return
    }

    // Path 1: Natural language -> send directly to AI
    if (isNaturalLanguage(trimmed)) {
      setIsLoading(true)
      try {
        const taskType = classifyNaturalLanguage(trimmed)
        const prompt = buildAIPrompt(trimmed, null, taskType)
        const request: AIQueryRequest = { prompt, taskType }
        const response = await window.electronAPI.aiQuery(request)
        setAIResponse(mapIpcResponse(response))
      } catch {
        setAIResponse(createErrorAIResponse('Failed to get AI response. Please try again.'))
      } finally {
        setIsLoading(false)
      }
      return
    }

    // Path 2: Shell command -> execute via IPC
    try {
      const result = await window.electronAPI.executeCommand(trimmed)
      const commandResult = parseCommandResult(result.exitCode, result.stdout, result.stderr)

      // Check if AI should help with the result
      if (shouldTriggerAI(trimmed, commandResult)) {
        setIsLoading(true)
        try {
          const taskType = commandResult.exitCode === 127 ? 'command_help' : 'error_analysis'
          const prompt = buildAIPrompt(trimmed, commandResult, taskType)
          const request: AIQueryRequest = { prompt, taskType }
          const response = await window.electronAPI.aiQuery(request)
          setAIResponse(mapIpcResponse(response))
        } catch {
          setAIResponse(createErrorAIResponse('Failed to get AI response for error analysis.'))
        } finally {
          setIsLoading(false)
        }
      }
    } catch {
      setAIResponse(createErrorAIResponse('Failed to execute command.'))
    }
  }, [])

  const isAIActive = aiResponse !== null || isLoading

  return (
    <div className="app-layout">
      <div className={`terminal-section${isAIActive ? ' terminal-section--with-ai' : ''}`}>
        <TerminalView onCommand={handleCommand} theme={activeTheme} />
      </div>
      <ThemeSelector />
      {isAIActive && (
        <div className="ai-section">
          <AIResponsePanel
            response={aiResponse}
            isLoading={isLoading}
            onDismiss={handleDismiss}
          />
        </div>
      )}
    </div>
  )
}

/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/components/AIResponsePanel.tsx
 * Module: renderer/components
 * Purpose: Display AI response with model info, token count, and latency metrics
 * Dependencies: react, @/ai/types
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/App.tsx, /Users/ghost/Desktop/aiterminal/src/ai/client.ts
 * Keywords: ai-response, display-panel, model-info, tokens, latency
 * Last Updated: 2026-03-24
 */

import type { FC } from 'react'
import type { AIResponse } from '@/ai/types'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AIResponsePanelProps {
  readonly response: AIResponse | null
  readonly isLoading: boolean
  readonly onDismiss: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AIResponsePanel: FC<AIResponsePanelProps> = ({
  response,
  isLoading,
  onDismiss,
}) => {
  if (isLoading) {
    return (
      <div className="ai-loading" data-testid="ai-loading-spinner">
        <div className="ai-loading__dots">
          <span className="ai-loading__dot" />
          <span className="ai-loading__dot" />
          <span className="ai-loading__dot" />
        </div>
        <span>Thinking...</span>
      </div>
    )
  }

  if (response === null) {
    return null
  }

  const totalTokens = response.inputTokens + response.outputTokens
  const hasStats = response.model && response.model !== '' && response.model !== 'error'

  return (
    <div className="ai-response-panel" data-testid="ai-response-card">
      <div className="ai-response-panel__header">
        <div className="ai-response-panel__meta" data-testid="ai-response-meta">
          {hasStats && (
            <>
              <span className="model-badge" data-testid="model-badge">
                {response.model}
              </span>
              {totalTokens > 0 && (
                <span className="token-info" data-testid="token-info">
                  {totalTokens} tokens
                </span>
              )}
              {response.latencyMs > 0 && (
                <span className="latency-info" data-testid="latency-info">
                  {response.latencyMs}ms
                </span>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          className="ai-response-panel__dismiss"
          onClick={onDismiss}
          aria-label="Dismiss AI response"
        >
          &#x2715;
        </button>
      </div>
      <pre className="ai-response-panel__content">{response.content}</pre>
    </div>
  )
}

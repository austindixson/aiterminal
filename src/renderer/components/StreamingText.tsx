/**
 * StreamingText — displays AI response content as it streams in.
 *
 * Features:
 * - Progressive text rendering from accumulated content
 * - Blinking block cursor while streaming
 * - Code block detection (``` fences) with styled <pre><code> wrapping
 * - Agent identity header with colored dot
 */

import type { FC } from 'react'
import type { AgentIdentity, StreamState } from '@/types/agent-cursor'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface StreamingTextProps {
  readonly streamState: StreamState
  readonly agent: AgentIdentity
  readonly modelName?: string
}

// ---------------------------------------------------------------------------
// Content parser — splits text into segments (plain text vs code blocks)
// ---------------------------------------------------------------------------

interface TextSegment {
  readonly type: 'text' | 'code'
  readonly content: string
  readonly language?: string
}

function parseContent(raw: string): readonly TextSegment[] {
  const segments: TextSegment[] = []
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(raw)) !== null) {
    // Text before this code block
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: raw.slice(lastIndex, match.index),
      })
    }

    segments.push({
      type: 'code',
      content: match[2],
      language: match[1] || undefined,
    })

    lastIndex = match.index + match[0].length
  }

  // Remaining text after last code block
  if (lastIndex < raw.length) {
    segments.push({
      type: 'text',
      content: raw.slice(lastIndex),
    })
  }

  return segments
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const StreamingText: FC<StreamingTextProps> = ({
  streamState,
  agent,
  modelName,
}) => {
  const segments = parseContent(streamState.content)

  return (
    <div className="streaming-text" data-agent-id={agent.id}>
      {/* Agent header */}
      <div className="streaming-text__agent-header">
        <span
          className="streaming-text__agent-dot"
          style={{ backgroundColor: agent.color }}
        />
        <span className="streaming-text__agent-name">{agent.name}</span>
        {modelName && (
          <span className="streaming-text__model-name">{modelName}</span>
        )}
      </div>

      {/* Content area */}
      <div className="streaming-text__content">
        {segments.map((segment, index) => {
          if (segment.type === 'code') {
            return (
              <pre key={index} className="streaming-text__code-block">
                <code>{segment.content}</code>
              </pre>
            )
          }

          // Plain text — preserve line breaks
          const lines = segment.content.split('\n')
          return lines.map((line, lineIndex) => (
            <span key={`${index}-${lineIndex}`} className="streaming-text__line">
              {line}
              {lineIndex < lines.length - 1 && <br />}
            </span>
          ))
        })}

        {/* Blinking cursor while streaming */}
        {streamState.isStreaming && (
          <span className="streaming-text__cursor">{'\u2588'}</span>
        )}
      </div>
    </div>
  )
}

/**
 * ChatMessageBubble — renders a single chat message.
 *
 * Supports markdown-lite rendering: code blocks, inline code, bold, links.
 * Shows model badge for assistant messages and relative timestamps.
 */

import type { FC, ReactNode } from 'react'
import type { ChatMessage } from '@/types/chat'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChatMessageBubbleProps {
  readonly message: ChatMessage
}

// ---------------------------------------------------------------------------
// Markdown-lite parser
// ---------------------------------------------------------------------------

/**
 * Parses a subset of Markdown into React elements:
 * - Triple-backtick code blocks
 * - Inline backtick code
 * - Double-asterisk bold
 * - URL links
 */
function parseContent(content: string): ReactNode[] {
  const elements: ReactNode[] = []

  // Split on code blocks first (```...```)
  const codeBlockRegex = /```(?:\w+)?\n?([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null = null

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Parse text before the code block
    if (match.index > lastIndex) {
      elements.push(
        ...parseInline(content.slice(lastIndex, match.index), elements.length),
      )
    }

    // Render code block
    elements.push(
      <div
        key={`codeblock-${elements.length}`}
        className="chat-message__code-block"
      >
        <pre>
          <code>{match[1]}</code>
        </pre>
      </div>,
    )

    lastIndex = match.index + match[0].length
  }

  // Parse remaining text after last code block
  if (lastIndex < content.length) {
    elements.push(...parseInline(content.slice(lastIndex), elements.length))
  }

  return elements
}

/**
 * Parses inline markdown: `code`, **bold**, and plain text.
 */
function parseInline(text: string, keyOffset: number): ReactNode[] {
  const parts: ReactNode[] = []
  // Pattern matches inline code OR bold
  const inlineRegex = /`([^`]+)`|\*\*([^*]+)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null = null

  while ((match = inlineRegex.exec(text)) !== null) {
    // Plain text before the match
    if (match.index > lastIndex) {
      parts.push(
        <span key={`text-${keyOffset}-${parts.length}`}>
          {text.slice(lastIndex, match.index)}
        </span>,
      )
    }

    if (match[1] !== undefined) {
      // Inline code
      parts.push(
        <code key={`code-${keyOffset}-${parts.length}`}>{match[1]}</code>,
      )
    } else if (match[2] !== undefined) {
      // Bold
      parts.push(
        <strong key={`bold-${keyOffset}-${parts.length}`}>{match[2]}</strong>,
      )
    }

    lastIndex = match.index + match[0].length
  }

  // Remaining plain text
  if (lastIndex < text.length) {
    parts.push(
      <span key={`text-${keyOffset}-${parts.length}`}>
        {text.slice(lastIndex)}
      </span>,
    )
  }

  return parts
}

// ---------------------------------------------------------------------------
// Relative time
// ---------------------------------------------------------------------------

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)

  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ChatMessageBubble: FC<ChatMessageBubbleProps> = ({ message }) => {
  const isAssistant = message.role === 'assistant'

  return (
    <div
      className={`chat-message chat-message--${message.role}`}
      data-testid={`chat-message-${message.id}`}
    >
      {/* Model badge for assistant messages */}
      {isAssistant && message.model && (
        <span className="chat-message__model">{message.model}</span>
      )}

      {/* Message content with markdown-lite parsing */}
      <div className="chat-message__content">
        {parseContent(message.content)}
      </div>

      {/* Streaming indicator */}
      {message.isStreaming && (
        <div className="chat-message__streaming" data-testid="streaming-dots">
          <span className="streaming-dot" />
          <span className="streaming-dot" />
          <span className="streaming-dot" />
        </div>
      )}

      {/* Timestamp */}
      <span className="chat-message__timestamp">
        {formatRelativeTime(message.timestamp)}
      </span>
    </div>
  )
}

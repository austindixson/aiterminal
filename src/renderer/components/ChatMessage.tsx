/**
 * ChatMessageBubble — renders a single chat message.
 *
 * Uses react-markdown for full Markdown rendering in assistant messages.
 * User messages render as plain text. Shows model badge for assistant
 * messages and relative timestamps.
 */

import type { FC } from 'react'
import ReactMarkdown from 'react-markdown'
import type { ChatMessage } from '@/types/chat'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChatMessageBubbleProps {
  readonly message: ChatMessage
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

      {/* Message content */}
      <div className="chat-message__content">
        {isAssistant ? (
          <ReactMarkdown
            components={{
              code({ inline, className, children, ...props }: any) {
                if (inline) {
                  return <code {...props}>{children}</code>
                }
                return (
                  <div className="chat-message__code-block">
                    <pre>
                      <code className={className} {...props}>
                        {children}
                      </code>
                    </pre>
                  </div>
                )
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        ) : (
          message.content
        )}
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

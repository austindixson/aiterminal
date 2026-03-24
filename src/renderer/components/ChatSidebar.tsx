/**
 * ChatSidebar — resizable glass sidebar for AI chat.
 *
 * Right-side panel with glass morphism styling. Includes:
 * - Header with title, model info, new chat & close buttons
 * - Scrollable message list with auto-scroll
 * - File attachment chips
 * - Textarea input with @mention support
 * - Resize handle on the left edge
 */

import { useRef, useEffect, useCallback } from 'react'
import type { FC, KeyboardEvent, ChangeEvent } from 'react'
import type { ChatState, FileAttachment } from '@/types/chat'
import { ChatMessageBubble } from './ChatMessage'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChatSidebarProps {
  readonly state: ChatState
  readonly onSendMessage: () => void
  readonly onClose: () => void
  readonly onNewChat: () => void
  readonly onResizeStart: (e: MouseEvent) => void
  readonly onInputChange: (value: string) => void
  readonly onRemoveAttachment: (path: string) => void
  readonly onMentionTrigger: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ChatSidebar: FC<ChatSidebarProps> = ({
  state,
  onSendMessage,
  onClose,
  onNewChat,
  onResizeStart,
  onInputChange,
  onRemoveAttachment,
  onMentionTrigger,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // -------------------------------------------------------------------------
  // Auto-scroll to bottom on new messages
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (
      messagesEndRef.current &&
      typeof messagesEndRef.current.scrollIntoView === 'function'
    ) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [state.messages.length])

  // -------------------------------------------------------------------------
  // Keyboard handling
  // -------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (state.inputValue.trim().length > 0) {
          onSendMessage()
        }
      }
    },
    [state.inputValue, onSendMessage],
  )

  // -------------------------------------------------------------------------
  // Input change with @mention detection
  // -------------------------------------------------------------------------

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      onInputChange(value)

      // Detect @ trigger
      if (value.endsWith('@')) {
        onMentionTrigger()
      }
    },
    [onInputChange, onMentionTrigger],
  )

  // -------------------------------------------------------------------------
  // Resize handle
  // -------------------------------------------------------------------------

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      onResizeStart(e.nativeEvent)
    },
    [onResizeStart],
  )

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!state.isOpen) {
    return null
  }

  const isSendDisabled = state.inputValue.trim().length === 0

  return (
    <div
      className="chat-sidebar"
      data-testid="chat-sidebar"
    >
      {/* Resize handle on left edge */}
      <div
        className="chat-resize-handle"
        onMouseDown={handleResizeMouseDown}
      />

      {/* Header */}
      <div className="chat-header">
        <h2 className="chat-header__title">AI Chat</h2>
        <div className="chat-header__controls">
          <button
            type="button"
            className="chat-header__btn"
            onClick={onNewChat}
            aria-label="New chat"
          >
            +
          </button>
          <button
            type="button"
            className="chat-header__btn"
            onClick={onClose}
            aria-label="Close chat"
          >
            &#x2715;
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages" ref={messagesContainerRef}>
        {state.messages.map((msg) => (
          <ChatMessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming indicator */}
        {state.isStreaming && (
          <div
            className="chat-streaming-indicator"
            data-testid="chat-streaming-indicator"
          >
            <div className="ai-loading__dots">
              <span className="ai-loading__dot" />
              <span className="ai-loading__dot" />
              <span className="ai-loading__dot" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="chat-input-area">
        {/* File attachment chips */}
        {state.attachedFiles.length > 0 && (
          <div className="chat-attachments">
            {state.attachedFiles.map((file: FileAttachment) => (
              <div key={file.path} className="chat-attachment-chip">
                <span className="chat-attachment-chip__icon">&#x1F4C4;</span>
                <span className="chat-attachment-chip__name">{file.name}</span>
                <button
                  type="button"
                  className="chat-attachment-chip__remove"
                  onClick={() => onRemoveAttachment(file.path)}
                  aria-label={`Remove ${file.name}`}
                >
                  &#x2715;
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Textarea */}
        <div className="chat-input-row">
          <textarea
            className="chat-textarea"
            placeholder="Type a message... (@file to attach)"
            value={state.inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button
            type="button"
            className="chat-send-btn"
            onClick={onSendMessage}
            disabled={isSendDisabled}
            aria-label="Send message"
          >
            &#x27A4;
          </button>
        </div>
      </div>
    </div>
  )
}

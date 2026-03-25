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
  readonly onAvatarResizeStart?: (e: MouseEvent) => void
  readonly onInputChange: (value: string) => void
  readonly onRemoveAttachment: (path: string) => void
  readonly onMentionTrigger: () => void
  // Avatar integration
  readonly avatarSection?: React.ReactNode
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
  onAvatarResizeStart,
  onInputChange,
  onRemoveAttachment,
  onMentionTrigger,
  avatarSection,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const CHAT_INPUT_MIN_PX = 88
  const CHAT_INPUT_MAX_PX = 260

  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '0px'
    const h = Math.min(
      Math.max(el.scrollHeight, CHAT_INPUT_MIN_PX),
      CHAT_INPUT_MAX_PX,
    )
    el.style.height = `${h}px`
  }, [])

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

  useEffect(() => {
    adjustTextareaHeight()
  }, [state.inputValue, adjustTextareaHeight])

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

  const handleAvatarResizeMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (onAvatarResizeStart) {
        onAvatarResizeStart(e.nativeEvent)
      }
    },
    [onAvatarResizeStart],
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
      className={`chat-sidebar${avatarSection ? ' chat-sidebar--with-avatar' : ''}`}
      data-testid="chat-sidebar"
    >
      {/* Resize handle on left edge */}
      <div
        className="chat-resize-handle"
        onMouseDown={handleResizeMouseDown}
      />

      {/* Avatar section (split panel) */}
      {avatarSection && (
        <>
          <div
            className="chat-avatar-section"
            style={{ height: state.avatarHeight ? `${state.avatarHeight}px` : undefined }}
          >
            {avatarSection}
          </div>

          {/* Resizable separator */}
          {onAvatarResizeStart && (
            <div
              className="chat-avatar-resize-handle"
              onMouseDown={handleAvatarResizeMouseDown}
              title="Drag to resize avatar section"
            />
          )}
        </>
      )}

      {/* Header */}
      <div className="chat-header">
        <div className="chat-header__heading">
          <h2 className="chat-header__title">AI Chat</h2>
          {(state.activeModelLabel || state.activePresetLabel) && (
            <p
              className="chat-header__subtitle"
              title={
                state.activeModelId
                  ? `${state.activeModelId}${state.activePresetLabel ? ` · preset: ${state.activePresetLabel}` : ''}`
                  : undefined
              }
            >
              {[state.activePresetLabel, state.activeModelLabel].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
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
        <div className="chat-composer">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            placeholder="Ask anything… (@file to attach)"
            value={state.inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
            spellCheck
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

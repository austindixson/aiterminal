/**
 * TroubleshootView — interactive AI troubleshoot panel with 3 tabs.
 *
 * - Chat: Interactive conversation with AI, full session context
 * - Console: Scrollable log of recent terminal activity (color-coded)
 * - Context: Session info cards (CWD, Shell, Duration, Error Count)
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import type { FC } from 'react'
import type {
  TroubleshootState,
  TroubleshootMessage,
  ConsoleEntry,
  SessionContext,
} from '@/types/troubleshoot'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TroubleshootViewProps {
  readonly state: TroubleshootState
  readonly onSendMessage: (message: string) => void
  readonly onSwitchTab: (tab: 'chat' | 'console' | 'context') => void
  readonly onClose: () => void
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const ChatTab: FC<{
  readonly messages: ReadonlyArray<TroubleshootMessage>
  readonly isLoading: boolean
  readonly onSendMessage: (message: string) => void
}> = ({ messages, isLoading, onSendMessage }) => {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = input.trim()
      if (trimmed.length === 0) {
        return
      }
      onSendMessage(trimmed)
      setInput('')
    },
    [input, onSendMessage],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const trimmed = input.trim()
        if (trimmed.length === 0) {
          return
        }
        onSendMessage(trimmed)
        setInput('')
      }
    },
    [input, onSendMessage],
  )

  return (
    <div className="troubleshoot-chat" data-testid="troubleshoot-chat">
      <div
        className="troubleshoot-chat__messages"
        ref={messagesContainerRef}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-message chat-message--${msg.role}`}
          >
            {msg.role === 'assistant' && msg.model && (
              <span className="chat-message__model">{msg.model}</span>
            )}
            <div className="chat-message__content">{msg.content}</div>
          </div>
        ))}
        {isLoading && (
          <div
            className="chat-message chat-message--loading"
            data-testid="troubleshoot-loading"
          >
            <div className="typing-indicator">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form className="troubleshoot-chat__input-area" onSubmit={handleSubmit}>
        <input
          type="text"
          className="troubleshoot-chat__input"
          placeholder="Ask a follow-up question..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="submit"
          className="troubleshoot-chat__send"
          aria-label="Send message"
        >
          Send
        </button>
      </form>
    </div>
  )
}

const ConsoleTab: FC<{
  readonly entries: ReadonlyArray<ConsoleEntry>
}> = ({ entries }) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [entries.length])

  return (
    <div
      className="troubleshoot-console"
      data-testid="troubleshoot-console"
      ref={containerRef}
    >
      {entries.map((entry) => (
        <div
          key={entry.id}
          className={`console-entry console-entry--${entry.type}`}
        >
          <span className="console-entry__timestamp">
            {formatTime(entry.timestamp)}
          </span>
          <span className="console-entry__content">
            {entry.type === 'command' ? '$ ' : ''}
            {entry.content}
          </span>
          {entry.type === 'command' &&
            entry.exitCode !== undefined &&
            entry.exitCode !== 0 && (
              <span className="console-entry__exit-code">
                [exit: {entry.exitCode}]
              </span>
            )}
        </div>
      ))}
      {entries.length === 0 && (
        <div className="console-entry console-entry--empty">
          No terminal activity yet.
        </div>
      )}
    </div>
  )
}

const ContextTab: FC<{
  readonly context: SessionContext
}> = ({ context }) => {
  const duration = Math.floor((Date.now() - context.sessionStartTime) / 1000)
  const minutes = Math.floor(duration / 60)
  const seconds = duration % 60

  return (
    <div className="troubleshoot-context" data-testid="troubleshoot-context">
      <div className="context-cards">
        <div className="context-card">
          <div className="context-card__label">Working Directory</div>
          <div className="context-card__value">{context.cwd}</div>
        </div>
        <div className="context-card">
          <div className="context-card__label">Shell</div>
          <div className="context-card__value">{context.shell}</div>
        </div>
        <div className="context-card">
          <div className="context-card__label">Session Duration</div>
          <div className="context-card__value">
            {minutes}m {seconds}s
          </div>
        </div>
        <div className="context-card">
          <div className="context-card__label">Errors</div>
          <div className="context-card__value">{context.errorCount}</div>
        </div>
      </div>
      {Object.keys(context.env).length > 0 && (
        <div className="context-env">
          <div className="context-env__title">Environment Variables</div>
          {Object.entries(context.env).map(([key, value]) => (
            <div key={key} className="context-env__entry">
              <span className="context-env__key">{key}</span>
              <span className="context-env__value">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'chat' as const, label: 'Chat', icon: '💬' },
  { id: 'console' as const, label: 'Console', icon: '>' },
  { id: 'context' as const, label: 'Context', icon: 'i' },
] as const

// ---------------------------------------------------------------------------
// TroubleshootView
// ---------------------------------------------------------------------------

export const TroubleshootView: FC<TroubleshootViewProps> = ({
  state,
  onSendMessage,
  onSwitchTab,
  onClose,
}) => {
  if (!state.isOpen) {
    return null
  }

  return (
    <div className="troubleshoot-view" data-testid="troubleshoot-view">
      <div className="troubleshoot-view__header">
        <div className="troubleshoot-tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-label={tab.label}
              aria-selected={state.activeTab === tab.id}
              className={`troubleshoot-tab${
                state.activeTab === tab.id ? ' troubleshoot-tab--active' : ''
              }`}
              onClick={() => onSwitchTab(tab.id)}
            >
              <span className="troubleshoot-tab__icon">{tab.icon}</span>
              <span className="troubleshoot-tab__label">{tab.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="troubleshoot-view__close"
          onClick={onClose}
          aria-label="Close troubleshoot"
        >
          &#x2715;
        </button>
      </div>

      <div className="troubleshoot-view__body">
        {state.activeTab === 'chat' && (
          <ChatTab
            messages={state.messages}
            isLoading={state.isLoading}
            onSendMessage={onSendMessage}
          />
        )}
        {state.activeTab === 'console' && (
          <ConsoleTab entries={state.sessionContext.recentEntries} />
        )}
        {state.activeTab === 'context' && (
          <ContextTab context={state.sessionContext} />
        )}
      </div>
    </div>
  )
}

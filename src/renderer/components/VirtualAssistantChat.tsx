/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/components/VirtualAssistantChat.tsx
 * Module: renderer/components
 * Purpose: Clear background AI chat overlay for VRM sidebar
 * Dependencies: react
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/App.tsx
 * Keywords: virtual-assistant, chat-overlay, transparent, vrm-sidebar
 * Last Updated: 2026-03-26
 */

import { useState, useRef, useEffect } from 'react';
import type { FC } from 'react';
import type { ChatMessage } from '@/types/chat';

type SoraState = 'sleeping' | 'summarizing' | 'listening' | 'relaying';

interface VirtualAssistantChatProps {
  messages: ChatMessage[];
  onSendMessage?: (message: string) => void;
  isStreaming?: boolean;
  onEndRp?: () => void;
  compact?: boolean;
  onRequestStatus?: () => void;
  soraState?: SoraState;
}

/**
 * Transparent AI chat overlay for VRM sidebar
 * Displays chat history with clear background overlaying the 3D model
 */
export const VirtualAssistantChat: FC<VirtualAssistantChatProps> = ({
  messages,
  onSendMessage,
  isStreaming = false,
  onEndRp,
  compact = false,
  onRequestStatus,
  soraState = 'sleeping',
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && onSendMessage) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div ref={containerRef} className={`virtual-assistant-chat${compact ? ' virtual-assistant-chat--compact' : ''}`}>
      {/* Chat Messages - Scrollable area */}
      <div className="virtual-assistant-chat__messages">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`virtual-assistant-chat__message virtual-assistant-chat__message--${msg.role}`}
          >
            <div className="virtual-assistant-chat__message-bubble">
              <div className="virtual-assistant-chat__message-content">
                {msg.content}
              </div>
              {msg.timestamp && (
                <div className="virtual-assistant-chat__message-time">
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
        {isStreaming && (
          <div className="virtual-assistant-chat__message virtual-assistant-chat__message--assistant">
            <div className="virtual-assistant-chat__message-bubble">
              <div className="virtual-assistant-chat__message-content virtual-assistant-chat__message-content--streaming">
                <span className="streaming-dots">...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      {onSendMessage && (
        <form onSubmit={handleSubmit} className="virtual-assistant-chat__input">
          {onEndRp && (
            <button
              type="button"
              onClick={onEndRp}
              className="virtual-assistant-chat__end-btn"
            >
              End
            </button>
          )}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={soraState === 'listening' ? 'Tell me what to do next...' : soraState === 'sleeping' ? 'Ask Sora anything...' : 'Sora is thinking...'}
            className="virtual-assistant-chat__input-field"
            disabled={isStreaming}
          />
          {onRequestStatus && (
            <button
              type="button"
              onClick={onRequestStatus}
              className="virtual-assistant-chat__status-btn"
              disabled={isStreaming}
              title="Get status update"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </button>
          )}
          <button
            type="submit"
            className="virtual-assistant-chat__input-send"
            disabled={isStreaming || !input.trim()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </form>
      )}
    </div>
  );
};

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

interface VirtualAssistantChatProps {
  messages: ChatMessage[];
  onSendMessage?: (message: string) => void;
  isStreaming?: boolean;
}

/**
 * Transparent AI chat overlay for VRM sidebar
 * Displays chat history with clear background overlaying the 3D model
 */
export const VirtualAssistantChat: FC<VirtualAssistantChatProps> = ({
  messages,
  onSendMessage,
  isStreaming = false
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
    <div ref={containerRef} className="virtual-assistant-chat">
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
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me anything..."
            className="virtual-assistant-chat__input-field"
            disabled={isStreaming}
          />
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

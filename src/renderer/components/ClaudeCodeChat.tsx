import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { InlineFileOpsApproval } from './InlineFileOpsApproval';
import type { FileOperation } from '../../types/agent';
import type { ChatMode } from '../../types/chat';
import '../styles/components.css';

interface ClaudeCodeChatProps {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  onSendMessage: (text: string) => void;
  backend: 'openrouter' | 'claude-code';
  claudeCodeStream?: string;
  activeIntern?: string | null;
  modelLabel?: string;
  presetLabel?: string;
  writeToClaudeCode?: (input: string) => void;
  clearClaudeCodeStream?: () => void;
  onToggleTerminal?: () => void;
  terminalVisible?: boolean;
  isWaitingForPermissions?: boolean;
  placeholder?: string;
  onClose?: () => void;
  pendingFileOps?: ReadonlyArray<FileOperation>;
  onApproveFileOps?: () => void;
  onRejectFileOps?: () => void;
  chatMode?: ChatMode;
  onCycleChatMode?: () => void;
}

/**
 * ClaudeCodeChat - Cursor-style chat input with glass-morphism design
 * Single-line input by default, Shift+Enter for multiline
 */
export const ClaudeCodeChat: React.FC<ClaudeCodeChatProps> = ({
  messages,
  onSendMessage,
  backend,
  claudeCodeStream = '',
  activeIntern = null,
  modelLabel,
  presetLabel,
  writeToClaudeCode,
  clearClaudeCodeStream,
  onToggleTerminal,
  terminalVisible = true,
  isWaitingForPermissions = false,
  placeholder = 'Type a message...',
  onClose,
  pendingFileOps = [],
  onApproveFileOps,
  onRejectFileOps,
  chatMode = 'normal',
  onCycleChatMode,
}) => {
  const [input, setInput] = useState('');
  const [isMultiline, setIsMultiline] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const programmaticScrollRef = useRef(false);

  // Local message state for Claude Code mode (bubbles without triggering OpenRouter)
  const [localMessages, setLocalMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

  // Detect user scroll: if user scrolls up, disable auto-scroll.
  // If user scrolls back to bottom, re-enable it.
  const handleMessagesScroll = () => {
    // Ignore scroll events we caused programmatically
    if (programmaticScrollRef.current) {
      programmaticScrollRef.current = false;
      return;
    }
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // User scrolled up — stop auto-scrolling
    if (distanceFromBottom > 150) {
      autoScrollRef.current = false;
    }
    // User scrolled back to bottom — resume auto-scrolling
    if (distanceFromBottom < 30) {
      autoScrollRef.current = true;
    }
  };

  // Auto-scroll on new content, but only if user hasn't scrolled up
  useEffect(() => {
    if (!autoScrollRef.current) return;
    const el = messagesContainerRef.current;
    if (el) {
      programmaticScrollRef.current = true;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Focus textarea on mount and when backend changes to claude-code
  useEffect(() => {
    if (backend === 'claude-code' && textareaRef.current) {
      // Small delay to ensure the chat is rendered
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
    // Clear local messages when switching away from Claude Code mode
    if (backend === 'openrouter') {
      setLocalMessages([]);
    }
  }, [backend]);
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Shift+Tab: cycle chat mode
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      onCycleChatMode?.();
      return;
    }

    // Block input while waiting for permissions
    if (isWaitingForPermissions) {
      e.preventDefault();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && !isMultiline) {
      e.preventDefault();
      const messageText = input.trim();
      console.log('[ClaudeCodeChat] Enter pressed, sending:', messageText);
      if (messageText) {
        setInput('');  // Clear input immediately
        if (backend === 'claude-code' && writeToClaudeCode) {
          console.log('[ClaudeCodeChat] Sending to Claude Code via PTY only (no OpenRouter)');
          clearClaudeCodeStream?.();
          writeToClaudeCode(messageText);
          // Add to local messages for bubble display (no OpenRouter trigger)
          setLocalMessages(prev => [...prev, { role: 'user', content: messageText }]);
        } else {
          console.log('[ClaudeCodeChat] Sending to OpenRouter');
          onSendMessage(messageText);
        }
        // Re-focus after sending
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
          }
        }, 10);
      }
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    console.log('[ClaudeCodeChat] Input changed:', newValue);
    setInput(newValue);

    // Auto-expand for multiline if shift+enter was used
    const lines = newValue.split('\n');
    if (lines.length > 1) {
      setIsMultiline(true);
    } else if (lines.length === 1 && newValue.slice(-1) !== '\n') {
      setIsMultiline(false);
    }
  }

  // Backend display names
  const backendNames = {
    'openrouter': 'OpenRouter',
    'claude-code': 'Claude Code'
  }

  const backendColors = {
    'openrouter': '#bd93f9',
    'claude-code': '#ff6b6b'
  }

  // Update placeholder based on state
  const getPlaceholder = () => {
    if (isWaitingForPermissions) {
      return '⏳ Accepting permissions...';
    }
    return placeholder;
  }

  return (
    <div style={styles.container}>
      {/* Header with close button */}
      {onClose && (
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.headerTitle}>AI Chat</span>
            <span style={{
              ...styles.backendBadge,
              backgroundColor: backendColors[backend] + '20',
              color: backendColors[backend],
              border: `1px solid ${backendColors[backend]}40`
            }}>
              {backendNames[backend]}
            </span>
            {backend === 'claude-code' && onToggleTerminal && (
              <button
                onClick={onToggleTerminal}
                style={{
                  ...styles.backendBadge,
                  backgroundColor: terminalVisible ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                  color: terminalVisible ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.4)',
                  border: terminalVisible ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid rgba(255, 255, 255, 0.1)',
                  cursor: 'pointer',
                  marginLeft: '8px',
                }}
                title={terminalVisible ? 'Hide terminal' : 'Show terminal'}
              >
                {terminalVisible ? 'Terminal Visible' : 'Show Terminal'}
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            style={styles.closeButton}
            title="Close chat (Escape)"
          >
            ✕
          </button>
        </div>
      )}

      {/* Message History */}
      <div ref={messagesContainerRef} onScroll={handleMessagesScroll} style={styles.messagesContainer}>
        {/* In Claude Code mode, use local messages; in OpenRouter mode, use prop messages */}
        {(backend === 'claude-code' ? localMessages : messages).map((msg, idx) => (
          <div
            key={idx}
            style={{
              ...styles.message,
              ...(msg.role === 'assistant' ? styles.messageRight : styles.messageLeft)
            }}
          >
            {msg.role === 'assistant' && (
              <div style={styles.messageMeta}>
                <span style={styles.aiName}>{activeIntern ? activeIntern.toUpperCase() : 'MEI'}</span>
                <span style={styles.aiModel}>•</span>
                <span style={styles.aiModel}>{presetLabel || modelLabel || 'Unknown'}</span>
              </div>
            )}
            <div style={styles.messageBubble}>
              <div style={styles.messageContent}>
                <div style={styles.markdownWrapper}>
                  <ReactMarkdown
                    components={{
                      code: ({node, children, className, ...props}: any) =>
                        className?.includes('language-') || !props.inline ? (
                          <code style={styles.markdownCodeBlock} {...props}>
                            {children}
                          </code>
                        ) : (
                          <code style={styles.markdownInlineCode} {...props}>
                            {children}
                          </code>
                        ),
                      p: ({children}: any) => <p style={styles.markdownParagraph}>{children}</p>,
                      ul: ({children}: any) => <ul style={{margin: '0 0 8px 0', paddingLeft: '16px'}}>{children}</ul>,
                      ol: ({children}: any) => <ol style={{margin: '0 0 8px 0', paddingLeft: '16px'}}>{children}</ol>,
                      li: ({children}: any) => <li style={{marginBottom: '2px'}}>{children}</li>,
                      strong: ({children}: any) => <strong style={{fontWeight: 600}}>{children}</strong>,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        ))}
        {backend === 'claude-code' && claudeCodeStream && (
          <div style={{...styles.message, ...styles.messageRight}}>
            <div style={styles.messageMeta}>
              <span style={styles.aiName}>{activeIntern ? activeIntern.toUpperCase() : 'MEI'}</span>
              <span style={styles.aiModel}>•</span>
              <span style={styles.aiModel}>{presetLabel || modelLabel || 'Unknown'}</span>
            </div>
            <div style={styles.messageBubble}>
              <div style={styles.messageContent}>
                <div style={styles.markdownWrapper}>
                  <ReactMarkdown
                    components={{
                      code: ({node, children, className, ...props}: any) =>
                        className?.includes('language-') || !props.inline ? (
                          <code style={styles.markdownCodeBlock} {...props}>
                            {children}
                          </code>
                        ) : (
                          <code style={styles.markdownInlineCode} {...props}>
                            {children}
                          </code>
                        ),
                      p: ({children}: any) => <p style={styles.markdownParagraph}>{children}</p>,
                      ul: ({children}: any) => <ul style={{margin: '0 0 8px 0', paddingLeft: '16px'}}>{children}</ul>,
                      ol: ({children}: any) => <ol style={{margin: '0 0 8px 0', paddingLeft: '16px'}}>{children}</ol>,
                      li: ({children}: any) => <li style={{marginBottom: '2px'}}>{children}</li>,
                      strong: ({children}: any) => <strong style={{fontWeight: 600}}>{children}</strong>,
                    }}
                  >
                    {claudeCodeStream}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* File operation approval widget */}
        {pendingFileOps.length > 0 && onApproveFileOps && onRejectFileOps && (
          <InlineFileOpsApproval
            operations={pendingFileOps}
            onApprove={onApproveFileOps}
            onReject={onRejectFileOps}
          />
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Line */}
      <div style={styles.inputContainer}>
        <span style={{
          ...styles.prompt,
          ...(isWaitingForPermissions ? { opacity: 0.3 } : {})
        }}>▶</span>
        {chatMode !== 'normal' && (
          <button
            onClick={onCycleChatMode}
            style={{
              ...modeIndicatorStyles.base,
              ...(chatMode === 'plan' ? modeIndicatorStyles.plan : modeIndicatorStyles.autocode),
            }}
            title="Shift+Tab to cycle modes"
          >
            {chatMode === 'plan' ? 'PLAN' : 'YOLO'}
          </button>
        )}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={getPlaceholder()}
          disabled={isWaitingForPermissions}
          style={{
            ...styles.textarea,
            ...(isMultiline ? styles.textareaMultiline : {}),
            ...(isWaitingForPermissions ? { opacity: 0.5, cursor: 'wait' } : {})
          }}
          rows={isMultiline ? undefined : 1}
        />
        {isWaitingForPermissions && (
          <div style={{
            position: 'absolute',
            right: '20px',
            bottom: '20px',
            fontSize: '12px',
            color: '#ff6b6b',
            background: 'rgba(255, 107, 107, 0.1)',
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid rgba(255, 107, 107, 0.3)'
          }}>
            Accepting permissions...
          </div>
        )}
      </div>
    </div>
  );
};

// Mode indicator styles
const modeIndicatorStyles = {
  base: {
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 700 as const,
    letterSpacing: '0.08em',
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
    lineHeight: '16px',
  },
  plan: {
    background: 'rgba(107, 157, 255, 0.2)',
    color: '#6b9dff',
    border: '1px solid rgba(107, 157, 255, 0.3)',
  },
  autocode: {
    background: 'rgba(255, 149, 0, 0.2)',
    color: '#ff9500',
    border: '1px solid rgba(255, 149, 0, 0.3)',
  },
};

// Styles
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Mono", "Monaco", "Inconsolata", "Fira Code", monospace',
    color: '#e0e0e0',
    fontSize: '14px',
    lineHeight: '1.6',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(20, 22, 30, 0.9)',
    flexShrink: 0,
  },

  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },

  headerTitle: {
    fontSize: '13px',
    fontWeight: 600,
    opacity: 0.9,
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
    color: '#bd93f9',
  },

  backendBadge: {
    fontSize: '10px',
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: '4px',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },

  closeButton: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.5)',
    cursor: 'pointer',
    fontSize: '18px',
    padding: '4px 8px',
    borderRadius: '4px',
    transition: 'all 0.15s ease',
    lineHeight: 1,
  },

  messagesContainer: {
    flex: 1,
    overflow: 'auto',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    backgroundColor: 'rgba(25, 27, 35, 0.5)',
  },

  message: {
    display: 'flex',
    gap: '12px',
    lineHeight: '1.6',
  },

  messageLeft: {
    flexDirection: 'row' as const,
  },

  messageRight: {
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
  },

  messageMeta: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    marginBottom: '4px',
    fontSize: '10px',
  },

  aiName: {
    fontWeight: 700,
    color: '#bd93f9',
    letterSpacing: '0.05em',
  },

  aiModel: {
    opacity: 0.3,
    fontSize: '9px',
    fontWeight: 500,
  },

  messageBubble: {
    display: 'flex',
    gap: '8px',
    maxWidth: '85%',
  },

  roleLabel: {
    fontWeight: 600,
    minWidth: '20px',
    opacity: 0.6,
    fontSize: '13px',
    flexShrink: 0,
  },

  messageContent: {
    flex: 1,
    fontSize: '14px',
    lineHeight: '1.5',
  },

  markdownWrapper: {
    width: '100%',
  },

  markdownParagraph: {
    margin: '0 0 8px 0',
    lineHeight: '1.5',
  },

  markdownCodeBlock: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: '12px',
    borderRadius: '6px',
    fontFamily: 'monospace',
    fontSize: '13px',
    overflow: 'auto',
    border: '1px solid rgba(255,255,255,0.1)',
    margin: '8px 0',
  },

  markdownInlineCode: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: '2px 6px',
    borderRadius: '3px',
    fontFamily: 'monospace',
    fontSize: '13px',
  },

  inputContainer: {
    display: 'flex',
    alignItems: 'flex-end',
    padding: '16px 20px',
    backdropFilter: 'blur(10px)',
    backgroundColor: 'rgba(20, 22, 30, 0.95)',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    gap: '12px',
    flexShrink: 0,
  },

  prompt: {
    fontWeight: 'bold',
    opacity: 0.8,
    userSelect: 'none' as const,
    fontSize: '18px',
    flexShrink: 0,
    paddingBottom: '2px',
    color: '#bd93f9',
  },

  textarea: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#e0e0e0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Mono", "Monaco", "Inconsolata", "Fira Code", monospace',
    fontSize: '14px',
    lineHeight: '1.5',
    resize: 'none' as const,
    overflow: 'hidden',
    padding: '0',
    minHeight: '24px',
    maxHeight: '150px',
  },

  textareaMultiline: {
    overflow: 'auto' as const,
    minHeight: '48px',
  },

  cursor: {
    animation: 'blink 1s step-end infinite',
    fontWeight: 'bold',
    userSelect: 'none' as const,
    minWidth: '10px',
  },
};

// Inject keyframes for blinking cursor
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }
`;
if (!document.head.querySelector('style[data-claude-code-chat]')) {
  styleSheet.setAttribute('data-claude-code-chat', 'true');
  document.head.appendChild(styleSheet);
}

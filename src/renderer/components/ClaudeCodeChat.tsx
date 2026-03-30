import React, { useState, useRef, useEffect } from 'react';
import { InlineFileOpsApproval } from './InlineFileOpsApproval';
import { ProcessBadge } from './ProcessBadge';
import { TextShimmer } from './TextShimmer';
import { StreamingMarkdown } from './StreamingMarkdown';
import { ChatErrorBoundary } from './ChatErrorBoundary';
import { parseIntoParts } from '../parts/parse-parts';
import { groupContextParts } from '../parts/context-group';
import type { FileOperation } from '../../types/agent';
import type { ChatMode } from '../../types/chat';
import '../styles/components.css';
import '../styles/streaming-markdown.css';

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
  onStopAgentLoop?: () => void;
  isAgentLooping?: boolean;
  onCopyMessage?: (content: string) => void;
  isStreaming?: boolean;
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
  onStopAgentLoop,
  isAgentLooping = false,
  onCopyMessage,
  isStreaming = false,
}) => {
  const [input, setInput] = useState('');
  const [showToolDetails, setShowToolDetails] = useState(true);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Streaming timer
  useEffect(() => {
    if (!isStreaming) { setElapsedSec(0); return; }
    setElapsedSec(0);
    const interval = setInterval(() => setElapsedSec(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [isStreaming]);

  // Inject keyframes once (moved from module scope to avoid SSR/test issues)
  useEffect(() => {
    if (!document.head.querySelector('style[data-claude-code-chat]')) {
      const sheet = document.createElement('style');
      sheet.setAttribute('data-claude-code-chat', 'true');
      sheet.textContent = '@keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
      document.head.appendChild(sheet);
    }
  }, []);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const lockedToBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);

  // Local message state for Claude Code mode (bubbles without triggering OpenRouter)
  const [localMessages, setLocalMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

  // User scroll detection: any wheel/touch scroll up disables auto-scroll.
  // We listen to wheel events directly, not onScroll, to avoid confusion
  // with programmatic scrollTop changes.
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        // Scrolling UP — user wants to read history
        lockedToBottomRef.current = false;
      } else if (e.deltaY > 0) {
        // Scrolling DOWN — check if at bottom, re-lock
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distFromBottom < 50) {
          lockedToBottomRef.current = true;
        }
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: true });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  // Auto-scroll only when locked to bottom
  useEffect(() => {
    // Always scroll when a NEW message is added (user sent a message)
    const currentCount = messages.length;
    if (currentCount > prevMessageCountRef.current) {
      // New message added — scroll to bottom and re-lock
      lockedToBottomRef.current = true;
    }
    prevMessageCountRef.current = currentCount;

    if (!lockedToBottomRef.current) return;
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Clear local messages when switching away from Claude Code mode
  useEffect(() => {
    if (backend === 'openrouter') {
      setLocalMessages([]);
    }
  }, [backend]);
  // NOTE: Removed auto-focus on mount — it was stealing focus from the terminal.
  // The textarea gains focus naturally when the user clicks in the chat area.

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

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const messageText = input.trim();
      if (messageText) {
        setInput('');
        // Reset textarea height after send
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.overflowY = 'hidden';
        }
        if (backend === 'claude-code' && writeToClaudeCode) {
          clearClaudeCodeStream?.();
          writeToClaudeCode(messageText);
          setLocalMessages(prev => [...prev, { role: 'user', content: messageText }]);
        } else {
          Promise.resolve(onSendMessage(messageText)).catch((err) => {
            console.error('[ClaudeCodeChat] Send error:', err);
          });
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
    setInput(newValue);
    autoResizeTextarea(e.target);
  }

  // Auto-resize textarea to fit content (up to max height, then scroll)
  const autoResizeTextarea = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    const maxH = 120; // ~5 lines
    const scrollH = el.scrollHeight;
    el.style.height = `${Math.min(scrollH, maxH)}px`;
    el.style.overflowY = scrollH > maxH ? 'auto' : 'hidden';
  }

  // Fallback for voice dictation tools (Wispr Flow, macOS Dictation) that inject
  // text via InputEvent/insertText without triggering React's onChange
  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement
    if (target.value !== input) {
      setInput(target.value)
      autoResizeTextarea(target)
    }
  }

  // Backend display names
  const backendNames = {
    'openrouter': 'OpenRouter',
    'claude-code': 'Claude Code'
  }

  const backendColors = {
    'openrouter': 'var(--accent-color, #14b8a6)',
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
            onClick={() => setShowToolDetails(prev => !prev)}
            style={{
              ...styles.closeButton,
              fontSize: '10px',
              opacity: showToolDetails ? 0.7 : 0.3,
            }}
            title={showToolDetails ? 'Hide tool details' : 'Show tool details'}
          >
            {showToolDetails ? '{}' : '{ }'}
          </button>
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
      <div ref={messagesContainerRef} style={styles.messagesContainer}>
        {/* Empty state */}
        {(backend === 'claude-code' ? localMessages : messages).length === 0 && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>{'>'}_</div>
            <div style={styles.emptyTitle}>Ready to assist</div>
            <div style={styles.emptyHint}>
              Ask me to build, fix, or analyze code. I can read files, edit code, and run commands.
            </div>
            <div style={styles.emptyShortcuts}>
              <span>Shift+Tab: cycle mode</span>
              <span>@file: attach context</span>
            </div>
          </div>
        )}
        {(backend === 'claude-code' ? localMessages : messages).map((msg, idx) => {
          // Skip rendering assistant messages that are only tool tags (empty after stripping)
          if (msg.role === 'assistant' && msg.content) {
            const stripped = msg.content
              .replace(/\[(?:RUN|READ|FILE|EDIT|DELETE)(?::[^\]]*)?(?:\]|$)/g, '')
              .replace(/\[\/(?:RUN|READ|FILE|EDIT|DELETE)\]?/g, '')
              .replace(/<tool_call>[^\n]*/g, '')
              .trim()
            if (stripped.length === 0) return null
          }
          return (
          <div
            key={'id' in msg ? (msg as { id: string }).id : `msg-${idx}`}
            style={{
              ...styles.message,
              ...(msg.role === 'assistant' ? styles.messageRight : styles.messageLeft)
            }}
          >
            {msg.role === 'assistant' && (() => {
              // Only show full header (SORA • model) on the first assistant message
              // or when model changes. Subsequent messages get a minimal bullet.
              const allMsgs = backend === 'claude-code' ? localMessages : messages
              const prevMsg = idx > 0 ? allMsgs[idx - 1] : null
              const isFirstOrModelChange = !prevMsg || prevMsg.role === 'user' ||
                (msg as { model?: string }).model !== (prevMsg as { model?: string }).model
              return isFirstOrModelChange
            })() && (
              <div style={styles.messageMeta}>
                <span style={styles.aiName}>{activeIntern ? activeIntern.toUpperCase() : 'MEI'}</span>
                <span style={styles.aiModel}>•</span>
                <span style={styles.aiModel}>{(msg as { model?: string }).model || modelLabel || presetLabel || 'Unknown'}</span>
                {(msg as { tokens?: { total?: number } }).tokens?.total ? (
                  <>
                    <span style={styles.aiModel}>•</span>
                    <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>
                      {(msg as { tokens?: { total?: number } }).tokens!.total!.toLocaleString()}t
                    </span>
                  </>
                ) : null}
                <span style={{ flex: 1 }} />
                {onCopyMessage && (
                  <button
                    onClick={() => onCopyMessage(msg.content)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'rgba(255,255,255,0.2)', fontSize: '10px', padding: '0 2px',
                    }}
                    title="Copy message"
                  >
                    copy
                  </button>
                )}
              </div>
            )}
            <div style={styles.messageBubble}>
              <div style={styles.messageContent}>
                <ChatErrorBoundary>
                {(() => {
                  if (msg.role === 'assistant') {
                    // Parse into typed parts using the new parts system
                    const rawParts = parseIntoParts(msg.content);
                    // Group consecutive context-gathering tools (read/grep/glob)
                    const parts = groupContextParts(rawParts);
                    const hasToolParts = parts.some(p => p.type !== 'text');
                    const isLastMsg = idx === (backend === 'claude-code' ? localMessages : messages).length - 1;

                    return (
                      <>
                        {parts.map((part, pi) => {
                          if (part.type === 'text') {
                            return (
                              <StreamingMarkdown
                                key={pi}
                                content={(part as unknown as { content: string }).content}
                                isStreaming={isLastMsg && isStreaming}
                              />
                            );
                          }
                          if (part.type === 'context-group') {
                            if (!showToolDetails) return null;
                            const group = part as unknown as { tools: readonly { tool: string; path?: string }[]; summary: string };
                            return (
                              <div key={pi} style={{
                                margin: '4px 0',
                                padding: '4px 8px',
                                background: 'rgba(255,255,255,0.03)',
                                borderLeft: '2px solid rgba(56, 189, 248, 0.3)',
                                borderRadius: '0 4px 4px 0',
                                fontSize: '11px',
                                color: 'rgba(255,255,255,0.5)',
                              }}>
                                <ProcessBadge type="read" />
                                <span style={{ marginLeft: '8px' }}>{group.summary}</span>
                              </div>
                            );
                          }
                          if (!showToolDetails && hasToolParts) return null;
                          if (part.type === 'tool') {
                            const toolPart = part as unknown as { tool: string; path?: string; command?: string; status: string; error?: string; output?: string };
                            const label = toolPart.command || toolPart.path || toolPart.tool;
                            const statusIcon = toolPart.status === 'done' ? '✓' : toolPart.status === 'error' ? '✗' : toolPart.status === 'running' ? '◐' : '◌';
                            const statusColor = toolPart.status === 'done' ? '#10b981' : toolPart.status === 'error' ? '#ef4444' : '#f59e0b';
                            return (
                              <div key={pi} style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                margin: '2px 0', padding: '3px 8px',
                                background: 'rgba(255,255,255,0.02)',
                                borderLeft: `2px solid ${statusColor}`,
                                borderRadius: '0 4px 4px 0',
                                fontSize: '12px', fontFamily: 'monospace',
                              }}>
                                <ProcessBadge type={toolPart.tool} />
                                <code style={{ color: 'rgba(255,255,255,0.7)', flex: 1 }}>{label}</code>
                                <span style={{ color: statusColor, fontSize: '11px', fontWeight: 700 }}>{statusIcon}</span>
                              </div>
                            );
                          }
                          if (part.type === 'reasoning') {
                            return (
                              <div key={pi} style={{
                                margin: '4px 0',
                                padding: '6px 10px',
                                background: 'rgba(99, 102, 241, 0.08)',
                                borderLeft: '2px solid rgba(99, 102, 241, 0.3)',
                                borderRadius: '0 4px 4px 0',
                                fontSize: '12px',
                                color: 'rgba(255,255,255,0.45)',
                                fontStyle: 'italic',
                              }}>
                                {(part as unknown as { content: string }).content}
                              </div>
                            );
                          }
                          return null;
                        })}
                      </>
                    );
                  }
                  return (
                    <StreamingMarkdown
                      content={msg.content}
                      isStreaming={false}
                    />
                  );
                })()}
                </ChatErrorBoundary>
              </div>
            </div>
          </div>
        )})}
        {backend === 'claude-code' && claudeCodeStream && (
          <div style={{...styles.message, ...styles.messageRight}}>
            <div style={styles.messageMeta}>
              <span style={styles.aiName}>{activeIntern ? activeIntern.toUpperCase() : 'MEI'}</span>
              <span style={styles.aiModel}>•</span>
              <span style={styles.aiModel}>{presetLabel || modelLabel || 'Unknown'}</span>
            </div>
            <div style={styles.messageBubble}>
              <div style={styles.messageContent}>
                <StreamingMarkdown
                  content={claudeCodeStream}
                  isStreaming={true}
                />
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

      {/* Status line — fixed height, never causes layout shift */}
      <div style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        height: '28px',
        padding: '0 14px',
        borderTop: '1px solid rgba(255, 255, 255, 0.04)',
        fontSize: '12px',
      }}>
        {isStreaming && (
          <>
            <TextShimmer text="Thinking..." active={true} />
            <span style={{ fontFamily: 'monospace', fontSize: '10px', opacity: 0.3 }}>
              {elapsedSec}s
            </span>
          </>
        )}
      </div>

      {/* Input Area — OpenCode / Cursor style */}
      <div style={styles.inputOuter}>
        <div style={styles.inputCard}>
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={getPlaceholder()}
            disabled={isWaitingForPermissions}
            style={{
              ...styles.textarea,
              ...(isWaitingForPermissions ? { opacity: 0.5, cursor: 'wait' } : {})
            }}
          />
          {/* Controls row inside card */}
          <div style={styles.inputControls}>
            <div style={styles.inputControlsLeft}>
              {chatMode !== 'normal' ? (
                <button
                  onClick={onCycleChatMode}
                  style={{
                    ...modeIndicatorStyles.base,
                    ...(chatMode === 'plan' ? modeIndicatorStyles.plan : modeIndicatorStyles.autocode),
                  }}
                  title="Shift+Tab to cycle modes"
                >
                  {chatMode === 'plan' ? '⊞ Plan' : '⚡ YOLO'}
                </button>
              ) : (
                <button
                  onClick={onCycleChatMode}
                  style={modeIndicatorStyles.normal}
                  title="Shift+Tab to cycle modes"
                >
                  Normal
                </button>
              )}
              <span style={styles.inputModelLabel}>
                {modelLabel || presetLabel || 'Auto'}
              </span>
              {isWaitingForPermissions && (
                <span style={styles.permissionsLabel}>Accepting permissions...</span>
              )}
            </div>
            <div style={styles.inputControlsRight}>
              {isAgentLooping && onStopAgentLoop && (
                <button
                  onClick={onStopAgentLoop}
                  style={styles.stopButton}
                  title="Stop agent loop"
                >
                  ■
                </button>
              )}
              <button
                onClick={() => {
                  const msg = input.trim();
                  if (!msg) return;
                  setInput('');
                  if (textareaRef.current) {
                    textareaRef.current.style.height = 'auto';
                    textareaRef.current.style.overflowY = 'hidden';
                  }
                  if (backend === 'claude-code' && writeToClaudeCode) {
                    clearClaudeCodeStream?.();
                    writeToClaudeCode(msg);
                    setLocalMessages(prev => [...prev, { role: 'user', content: msg }]);
                  } else {
                    Promise.resolve(onSendMessage(msg)).catch(console.error);
                  }
                }}
                style={styles.sendButton}
                title="Send (Enter)"
                disabled={!input.trim()}
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Mode indicator styles
const modeIndicatorStyles: Record<string, React.CSSProperties> = {
  base: {
    padding: '3px 10px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.02em',
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
    lineHeight: '18px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  },
  normal: {
    padding: '3px 10px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
    lineHeight: '18px',
    background: 'rgba(255, 255, 255, 0.06)',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  plan: {
    background: 'rgba(107, 157, 255, 0.15)',
    color: '#6b9dff',
    border: '1px solid rgba(107, 157, 255, 0.25)',
  },
  autocode: {
    background: 'rgba(255, 149, 0, 0.15)',
    color: '#ff9500',
    border: '1px solid rgba(255, 149, 0, 0.25)',
  },
};

// Styles
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
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
    color: 'var(--accent-color, #14b8a6)',
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
    alignItems: 'flex-start',
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
    color: 'var(--accent-color, #14b8a6)',
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
    width: '100%',
    overflow: 'hidden',
    minWidth: 0,
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
    minWidth: 0,
    overflow: 'hidden',
    fontSize: '14px',
    lineHeight: '1.5',
  },

  markdownWrapper: {
    width: '100%',
    overflow: 'hidden',
    wordBreak: 'break-word' as const,
  },

  markdownParagraph: {
    margin: '0 0 8px 0',
    lineHeight: '1.5',
  },

  markdownCodeBlock: {
    display: 'block' as const,
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: '12px',
    borderRadius: '6px',
    fontFamily: 'monospace',
    fontSize: '12px',
    lineHeight: '1.4',
    overflow: 'auto',
    maxHeight: '300px',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
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

  inputOuter: {
    padding: '12px 16px 14px',
    backgroundColor: 'rgba(20, 22, 30, 0.95)',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    flexShrink: 0,
  },

  inputCard: {
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '10px',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    overflow: 'hidden',
    transition: 'border-color 0.15s ease',
  },

  inputControls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px 8px',
  },

  inputControlsLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },

  inputControlsRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },

  inputModelLabel: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.3)',
    fontWeight: 500,
  },

  stopButton: {
    width: '26px',
    height: '26px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '6px',
    border: '1px solid rgba(255, 50, 50, 0.4)',
    background: 'rgba(255, 50, 50, 0.12)',
    color: '#ff5555',
    fontSize: '12px',
    cursor: 'pointer',
    flexShrink: 0,
  },

  sendButton: {
    width: '26px',
    height: '26px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    background: 'rgba(255, 255, 255, 0.06)',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '14px',
    fontWeight: 700 as const,
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  },

  permissionsLabel: {
    fontSize: '10px',
    color: '#ff6b6b',
    opacity: 0.7,
  },

  textarea: {
    width: '100%',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#e0e0e0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Mono", "Monaco", "Inconsolata", "Fira Code", monospace',
    fontSize: '13px',
    lineHeight: '1.5',
    resize: 'none' as const,
    overflow: 'hidden' as const,
    padding: '12px 12px 4px',
    minHeight: '36px',
    maxHeight: '120px',
    boxSizing: 'border-box' as const,
  },

  cursor: {
    animation: 'blink 1s step-end infinite',
    fontWeight: 'bold',
    userSelect: 'none' as const,
    minWidth: '10px',
  },

  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    minHeight: '200px',
    gap: '8px',
    opacity: 0.5,
  },
  emptyIcon: {
    fontSize: '24px',
    fontFamily: 'monospace',
    fontWeight: 700,
    color: 'rgba(99, 102, 241, 0.6)',
  },
  emptyTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.6)',
  },
  emptyHint: {
    fontSize: '12px',
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center' as const,
    maxWidth: '280px',
    lineHeight: '1.4',
  },
  emptyShortcuts: {
    display: 'flex',
    gap: '12px',
    fontSize: '10px',
    color: 'rgba(255,255,255,0.2)',
    fontFamily: 'monospace',
    marginTop: '8px',
  },
};

// Keyframe injection moved into component useEffect to avoid module-level DOM mutation

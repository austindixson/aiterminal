/**
 * useChat — React hook managing chat sidebar state.
 *
 * Manages messages, file attachments, @mention detection,
 * sidebar width, and AI interaction via electronAPI.
 * All state updates are immutable.
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
import { MODELS } from '@/ai/models'
import type { ChatMessage, ChatState, FileAttachment } from '@/types/chat'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_WIDTH = 420
const MIN_WIDTH = 280
const MAX_WIDTH = 640
const MAX_MESSAGES = 50

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let messageCounter = 0

function generateMessageId(): string {
  messageCounter += 1
  return `chat-msg-${Date.now()}-${messageCounter}`
}

function createUserMessage(
  content: string,
  attachments: ReadonlyArray<FileAttachment>,
): ChatMessage {
  return {
    id: generateMessageId(),
    role: 'user',
    content,
    timestamp: Date.now(),
    attachments: attachments.length > 0 ? attachments : undefined,
  }
}

function createAssistantMessage(
  content: string,
  model?: string,
): ChatMessage {
  return {
    id: generateMessageId(),
    role: 'assistant',
    content,
    timestamp: Date.now(),
    model,
  }
}

function clampWidth(width: number): number {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width))
}

// ---------------------------------------------------------------------------
// @mention regex
// ---------------------------------------------------------------------------

const MENTION_REGEX = /@([\w./-]+)/g

function extractMentionsFromText(text: string): readonly string[] {
  return Array.from(text.matchAll(MENTION_REGEX)).map((m) => m[1])
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseChatReturn {
  readonly state: ChatState
  readonly open: () => void
  readonly close: () => void
  readonly toggle: () => void
  readonly setWidth: (width: number) => void
  readonly sendMessage: (content: string) => Promise<void>
  readonly clearMessages: () => void
  readonly addAttachment: (file: FileAttachment) => void
  readonly removeAttachment: (path: string) => void
  readonly setInputValue: (value: string) => void
  readonly extractMentions: (text: string) => readonly string[]
  readonly injectFromTerminal: (userInput: string) => Promise<void>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChat(): UseChatReturn {
  const [isOpen, setIsOpen] = useState(false)
  const [width, setWidthState] = useState(DEFAULT_WIDTH)
  const [messages, setMessages] = useState<ReadonlyArray<ChatMessage>>([])
  const [inputValue, setInputValueState] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<ReadonlyArray<FileAttachment>>([])
  const [activeModelLabel, setActiveModelLabel] = useState<string | undefined>(undefined)
  const [activeModelId, setActiveModelId] = useState<string | undefined>(undefined)
  const [activePresetLabel, setActivePresetLabel] = useState<string | undefined>(undefined)

  const refreshActiveAiModel = useCallback(async () => {
    const api = window.electronAPI
    if (!api?.getActiveAiModel) return
    try {
      const info = await api.getActiveAiModel('general')
      if (info.displayName) {
        setActiveModelLabel(info.displayName)
        setActiveModelId(info.id || undefined)
        setActivePresetLabel(info.presetName || undefined)
      }
    } catch {
      /* ignore */
    }
  }, [])

  // -------------------------------------------------------------------------
  // Sidebar controls
  // -------------------------------------------------------------------------

  const open = useCallback(() => {
    setIsOpen(true)
    void refreshActiveAiModel()
  }, [refreshActiveAiModel])

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev
      if (next) void refreshActiveAiModel()
      return next
    })
  }, [refreshActiveAiModel])

  const setWidth = useCallback((w: number) => {
    setWidthState(clampWidth(w))
  }, [])

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  const setInputValue = useCallback((value: string) => {
    setInputValueState(value)
  }, [])

  // -------------------------------------------------------------------------
  // Attachments
  // -------------------------------------------------------------------------

  const addAttachment = useCallback((file: FileAttachment) => {
    setAttachedFiles((prev) => [...prev, file])
  }, [])

  const removeAttachment = useCallback((path: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.path !== path))
  }, [])

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------

  const clearMessages = useCallback(() => {
    setMessages([])
    setAttachedFiles([])
  }, [])

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim()
      if (trimmed.length === 0) return

      // Create user message with current attachments
      const userMsg = createUserMessage(trimmed, attachedFiles)
      setMessages((prev) => [...prev, userMsg].slice(-MAX_MESSAGES))

      // Build context from attached files for the AI prompt
      const fileContext = attachedFiles
        .filter((f) => f.content)
        .map((f) => `[File: ${f.name}]\n${f.content}`)
        .join('\n\n')

      const fullPrompt = fileContext
        ? `${fileContext}\n\n${trimmed}`
        : trimmed

      // Clear attachments after sending
      setAttachedFiles([])
      setIsStreaming(true)

      try {
        const api = window.electronAPI
        const hasElectronAPI =
          typeof window !== 'undefined' && 'electronAPI' in window && api?.aiQuery

        if (hasElectronAPI) {
          const context = messages.slice(-10).map((msg) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          }))

          const applyRunTags = (raw: string): string => {
            let text = raw
            const runMatch = text.match(/\[RUN\](.*?)\[\/RUN\]/s)
            if (runMatch) {
              const command = runMatch[1].trim()
              // SECURITY: Never auto-execute commands. Show for user approval only.
              // This prevents prompt injection from executing arbitrary code.
              text = text.replace(/\[RUN\].*?\[\/RUN\]/s, '').trim()
              text = text
                ? `💡 Suggested command:\n\`\`\`\n${command}\n\`\`\`\nCopy & run manually if intended.\n\n${text}`
                : `💡 Suggested command:\n\`\`\`\n${command}\n\`\`\`\nCopy & run manually if intended.`
            }
            return text
          }

          if (api.aiQueryStream) {
            const placeholderId = generateMessageId()
            setMessages((prev) =>
              [
                ...prev,
                {
                  id: placeholderId,
                  role: 'assistant' as const,
                  content: '',
                  timestamp: Date.now(),
                },
              ].slice(-MAX_MESSAGES),
            )

            let accumulated = ''
            await api.aiQueryStream(
              { prompt: fullPrompt, taskType: 'general', context },
              (payload) => {
                if (payload.chunk) {
                  accumulated += payload.chunk
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === placeholderId ? { ...m, content: accumulated } : m,
                    ),
                  )
                }
                if (payload.error) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === placeholderId
                        ? { ...m, content: `Error: ${payload.error}` }
                        : m,
                    ),
                  )
                }
                if (payload.done && payload.modelLabel) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === placeholderId ? { ...m, model: payload.modelLabel } : m,
                    ),
                  )
                }
              },
            )

            const finalContent = applyRunTags(accumulated)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === placeholderId ? { ...m, content: finalContent } : m,
              ),
            )
          } else {
            const response = await api.aiQuery({
              prompt: fullPrompt,
              taskType: 'general',
              context,
            })

            const content = applyRunTags(response.content ?? '')
            const mid = response.model ?? ''
            const model =
              mid.length > 0 ? (MODELS.get(mid)?.name ?? mid) : ''
            const assistantMsg = createAssistantMessage(content, model)
            setMessages((prev) => [...prev, assistantMsg].slice(-MAX_MESSAGES))
          }
        }
      } catch {
        const errorMsg = createAssistantMessage(
          'Failed to get AI response. Please try again.',
        )
        setMessages((prev) => [...prev, errorMsg].slice(-MAX_MESSAGES))
      } finally {
        setIsStreaming(false)
      }
    },
    [attachedFiles, messages],
  )

  // -------------------------------------------------------------------------
  // @mention extraction
  // -------------------------------------------------------------------------

  const extractMentions = useCallback((text: string): readonly string[] => {
    return extractMentionsFromText(text)
  }, [])

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const state: ChatState = useMemo(
    () => ({
      isOpen,
      width,
      messages,
      inputValue,
      isStreaming,
      attachedFiles,
      activeModelLabel,
      activeModelId,
      activePresetLabel,
    }),
    [
      isOpen,
      width,
      messages,
      inputValue,
      isStreaming,
      attachedFiles,
      activeModelLabel,
      activeModelId,
      activePresetLabel,
    ],
  )

  // -------------------------------------------------------------------------
  // Inject from terminal — auto-opens chat and sends a message
  // Used when terminal detects natural language or errors
  // -------------------------------------------------------------------------

  const injectFromTerminal = useCallback(
    async (userInput: string) => {
      if (isStreaming) return // prevent concurrent AI calls
      setIsOpen(true) // auto-open sidebar
      void refreshActiveAiModel()
      await sendMessage(userInput)
    },
    [sendMessage, isStreaming, refreshActiveAiModel],
  )

  useEffect(() => {
    void refreshActiveAiModel()
    // Run once on mount to initialize AI model
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // lossless-recall: mirror chat into SQLite when AITERMINAL_LOSSLESS_ROOT is set
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.losslessSync) return
    const roleMsgs = messages.filter(
      (m) => m.role === 'user' || m.role === 'assistant',
    )
    if (roleMsgs.length === 0) return
    void api.losslessSync({
      sessionId: 'aiterminal-chat',
      messages: roleMsgs.map((m) => ({ role: m.role, content: m.content })),
    })
  }, [messages])

  return {
    state,
    open,
    close,
    toggle,
    setWidth,
    sendMessage,
    clearMessages,
    addAttachment,
    removeAttachment,
    setInputValue,
    extractMentions,
    injectFromTerminal,
  }
}

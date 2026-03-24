/**
 * useChat — React hook managing chat sidebar state.
 *
 * Manages messages, file attachments, @mention detection,
 * sidebar width, and AI interaction via electronAPI.
 * All state updates are immutable.
 */

import { useState, useCallback, useMemo } from 'react'
import type { ChatMessage, ChatState, FileAttachment } from '@/types/chat'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_WIDTH = 380
const MIN_WIDTH = 280
const MAX_WIDTH = 600
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
  const matches: string[] = []
  let match: RegExpExecArray | null = null
  const regex = new RegExp(MENTION_REGEX.source, MENTION_REGEX.flags)
  while ((match = regex.exec(text)) !== null) {
    matches.push(match[1])
  }
  return matches
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

  // -------------------------------------------------------------------------
  // Sidebar controls
  // -------------------------------------------------------------------------

  const open = useCallback(() => {
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

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
        const hasElectronAPI =
          typeof window !== 'undefined' &&
          'electronAPI' in window &&
          window.electronAPI?.aiQuery

        if (hasElectronAPI) {
          // Build conversation context from recent messages
          const context = messages.slice(-10).map((msg) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          }))

          const response = await window.electronAPI.aiQuery({
            prompt: fullPrompt,
            taskType: 'general',
            context,
          })

          let content = response.content ?? ''
          const model = response.model ?? ''

          // Parse [RUN]command[/RUN] tags — auto-execute (with safety check)
          const runMatch = content.match(/\[RUN\](.*?)\[\/RUN\]/s)
          if (runMatch) {
            const command = runMatch[1].trim()
            const DESTRUCTIVE = /\b(rm\s|rmdir|kill\s|pkill|killall|drop\s|truncate|format|sudo\s|chmod\s777|>\s*\/|dd\s)/i
            if (DESTRUCTIVE.test(command)) {
              content = content.replace(/\[RUN\].*?\[\/RUN\]/s, '').trim()
              content = `Blocked dangerous command: \`${command}\`\n\nRun it manually if intended.\n\n${content}`
            } else {
              window.electronAPI.writeToPty(command + '\r')
              content = content.replace(/\[RUN\].*?\[\/RUN\]/s, '').trim()
              content = content ? `Ran \`${command}\`\n\n${content}` : `Ran \`${command}\``
            }
          }

          const assistantMsg = createAssistantMessage(content, model)
          setMessages((prev) => [...prev, assistantMsg].slice(-MAX_MESSAGES))
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
    }),
    [isOpen, width, messages, inputValue, isStreaming, attachedFiles],
  )

  // -------------------------------------------------------------------------
  // Inject from terminal — auto-opens chat and sends a message
  // Used when terminal detects natural language or errors
  // -------------------------------------------------------------------------

  const injectFromTerminal = useCallback(
    async (userInput: string) => {
      if (isStreaming) return // prevent concurrent AI calls
      setIsOpen(true)  // auto-open sidebar
      await sendMessage(userInput)
    },
    [sendMessage, isStreaming],
  )

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

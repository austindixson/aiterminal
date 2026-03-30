/**
 * useTroubleshoot — React hook managing troubleshoot panel state.
 *
 * Manages messages array (immutable updates), active tab, loading state,
 * and session context from the ContextCollector.
 */

import { useState, useCallback, useMemo } from 'react'
import type { ContextCollector } from '@/troubleshoot/context-collector'
import type {
  TroubleshootMessage,
  TroubleshootState,
  SessionContext,
} from '@/types/troubleshoot'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let messageCounter = 0

function generateMessageId(): string {
  messageCounter += 1
  return `msg-${Date.now()}-${messageCounter}`
}

function createUserMessage(content: string): TroubleshootMessage {
  return {
    id: generateMessageId(),
    role: 'user',
    content,
    timestamp: Date.now(),
  }
}

function createAssistantMessage(
  content: string,
  model?: string,
): TroubleshootMessage {
  return {
    id: generateMessageId(),
    role: 'assistant',
    content,
    timestamp: Date.now(),
    model,
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseTroubleshootReturn {
  readonly state: TroubleshootState
  readonly sendMessage: (content: string) => Promise<void>
  readonly switchTab: (tab: 'chat' | 'console' | 'context') => void
  readonly open: (initialResponse?: string) => void
  readonly close: () => void
}

export function useTroubleshoot(
  contextCollector: ContextCollector,
): UseTroubleshootReturn {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ReadonlyArray<TroubleshootMessage>>(
    [],
  )
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'chat' | 'console' | 'context'>(
    'chat',
  )

  // Build session context from collector — use current cwd/shell or defaults
  const sessionContext: SessionContext = useMemo(
    () =>
      contextCollector.getSessionContext(
        process.env.PWD ?? process.cwd?.() ?? '/',
        process.env.SHELL ?? (process.platform === 'win32' ? (process.env.COMSPEC || 'cmd.exe') : '/bin/zsh'),
      ),
    [contextCollector],
  )

  const open = useCallback(
    (initialResponse?: string) => {
      setIsOpen(true)
      if (initialResponse) {
        setMessages((prev) => [
          ...prev,
          createAssistantMessage(initialResponse),
        ])
      }
    },
    [],
  )

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  const switchTab = useCallback(
    (tab: 'chat' | 'console' | 'context') => {
      setActiveTab(tab)
    },
    [],
  )

  const sendMessage = useCallback(
    async (content: string) => {
      const userMsg = createUserMessage(content)
      setMessages((prev) => [...prev, userMsg])
      setIsLoading(true)

      try {
        // In the future, this will call the AI client with the full
        // session context via ContextCollector.buildSystemPrompt().
        // For now, we just add the user message — the AI integration
        // will be wired in when the IPC handler is connected.
        // Simulate a brief pause for the loading indicator.
        await Promise.resolve()
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  const state: TroubleshootState = useMemo(
    () => ({
      isOpen,
      messages,
      sessionContext,
      isLoading,
      activeTab,
    }),
    [isOpen, messages, sessionContext, isLoading, activeTab],
  )

  return {
    state,
    sendMessage,
    switchTab,
    open,
    close,
  }
}

/**
 * useSoraCompanion — Sora as a real-time terminal companion.
 *
 * Watches terminal output, answers questions about the session,
 * relays commands to Claude Code when the user intends it,
 * and auto-generates status updates when Claude finishes a task.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import type { ChatMessage } from '@/types/chat'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseSoraCompanionReturn {
  readonly messages: ReadonlyArray<ChatMessage>
  readonly isStreaming: boolean
  readonly sendMessage: (text: string) => Promise<void>
  readonly generateStatus: () => Promise<void>
  readonly clearMessages: () => void
}

export interface UseSoraCompanionOptions {
  readonly getActiveSessionId: () => string | null
  readonly onSpeak?: (text: string) => void
  readonly onBubble?: (text: string) => void
  /** Called at strategic moments with a compact context snapshot (for voice agent). */
  readonly onContextSnapshot?: (context: string) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BUFFER = 2000
const MAX_MESSAGES = 30
const AUTO_STATUS_COOLDOWN_MS = 60_000
const IDLE_THRESHOLD_MS = 5_000
const ACTIVITY_CHAR_THRESHOLD = 500
const CONTEXT_SNAPSHOT_COOLDOWN_MS = 15_000

// High-signal patterns worth pushing context for
const ERROR_PATTERNS = [
  /\berror\b/i, /\bfailed\b/i, /\bfailure\b/i, /\bpanic\b/i,
  /command not found/i, /permission denied/i, /not recognized/i,
  /FAIL/,
]
const COMPLETION_PATTERNS = [
  /\bpassed\b/i, /\bcomplete[d]?\b/i, /\bsuccess\b/i, /\bdone\b/i,
  /\bfinished\b/i, /tests? (?:passed|ok)\b/i, /build succeeded/i,
  /✓/, /✅/,
]

const SORA_SYSTEM_PROMPT = `You are Sora, a friendly AI companion sitting next to the user's terminal. You can see their recent terminal output.

RECENT TERMINAL OUTPUT:
---
{TERMINAL_BUFFER}
---

You can:
1. Answer questions about what's happening in the terminal or the project
2. Chat casually about anything — architecture, ideas, opinions
3. Relay commands to Claude Code or the terminal — wrap EXACTLY what should be typed in [RELAY]command here[/RELAY] tags

Only use [RELAY] when the user clearly wants something executed or sent to the terminal/Claude. For questions, opinions, status updates — just answer directly.

Keep responses to 1-3 sentences. Be natural and conversational.`

const STATUS_PROMPT = `Based on the recent terminal output below, give a brief 1-2 sentence status update on what just happened.

TERMINAL OUTPUT:
---
{TERMINAL_BUFFER}
---

Be specific — mention file names, test results, errors, or commands that ran. If nothing significant happened, say so.`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let msgCounter = 0

function createMsg(role: 'user' | 'assistant', content: string): ChatMessage {
  msgCounter += 1
  return {
    id: `sora-${Date.now()}-${msgCounter}`,
    role,
    content,
    timestamp: Date.now(),
  }
}

function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, '')
    .replace(/\r/g, '')
}

function extractRelay(text: string): { relay: string | null; display: string } {
  const match = text.match(/\[RELAY\]([\s\S]*?)\[\/RELAY\]/)
  if (!match) return { relay: null, display: text }

  const relay = match[1].trim()
  const display = text.replace(/\[RELAY\][\s\S]*?\[\/RELAY\]/, '').trim()
  return { relay, display: display || `Sending to terminal: \`${relay}\`` }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSoraCompanion(options: UseSoraCompanionOptions): UseSoraCompanionReturn {
  const { getActiveSessionId, onSpeak, onBubble, onContextSnapshot } = options

  const [messages, setMessages] = useState<ReadonlyArray<ChatMessage>>([])
  const [isStreaming, setIsStreaming] = useState(false)

  // Terminal buffer (rolling, ANSI-stripped)
  const bufferRef = useRef('')
  const lastOutputTimeRef = useRef(0)
  const charsSinceStatusRef = useRef(0)
  const lastAutoStatusRef = useRef(0)
  const lastContextSnapshotRef = useRef(0)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onContextSnapshotRef = useRef(onContextSnapshot)
  onContextSnapshotRef.current = onContextSnapshot

  /**
   * Build a compact context snapshot (~200 chars) for the voice agent.
   * Only includes the tail of the buffer + a signal label.
   */
  const emitContextSnapshot = useCallback((signal: string) => {
    const now = Date.now()
    if (now - lastContextSnapshotRef.current < CONTEXT_SNAPSHOT_COOLDOWN_MS) return
    lastContextSnapshotRef.current = now

    // Take last 500 chars of buffer — compact, enough for the agent to understand
    const tail = bufferRef.current.slice(-500).trim()
    if (!tail) return

    const snapshot = `[${signal}] Recent terminal:\n${tail}`
    onContextSnapshotRef.current?.(snapshot)
  }, [])

  // Subscribe to all PTY output
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.onAnySessionData) return

    const unsub = api.onAnySessionData((_sessionId, data) => {
      const clean = stripAnsi(data)
      bufferRef.current = (bufferRef.current + clean).slice(-MAX_BUFFER)
      lastOutputTimeRef.current = Date.now()
      charsSinceStatusRef.current += clean.length

      // Emit context on high-signal events (errors, completions)
      if (ERROR_PATTERNS.some(p => p.test(clean))) {
        emitContextSnapshot('error detected')
      } else if (COMPLETION_PATTERNS.some(p => p.test(clean))) {
        emitContextSnapshot('task completed')
      }

      // Reset idle timer
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(() => {
        checkAutoStatus()
        emitContextSnapshot('idle after activity')
      }, IDLE_THRESHOLD_MS)
    })

    return () => {
      unsub?.()
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-status when Claude goes idle after activity
  const checkAutoStatus = useCallback(() => {
    const now = Date.now()
    const cooldownOk = now - lastAutoStatusRef.current > AUTO_STATUS_COOLDOWN_MS
    const enoughActivity = charsSinceStatusRef.current > ACTIVITY_CHAR_THRESHOLD
    const buffer = bufferRef.current.trim()

    if (!cooldownOk || !enoughActivity || buffer.length < 100) return

    lastAutoStatusRef.current = now
    charsSinceStatusRef.current = 0

    // Fire and forget — generate status in background
    generateStatusInternal()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // AI query helper
  // ---------------------------------------------------------------------------

  const queryAI = useCallback(async (
    systemPrompt: string,
    userText: string,
    context: ReadonlyArray<{ role: string; content: string }>,
  ): Promise<string> => {
    const api = window.electronAPI
    if (!api?.aiQueryStream) return '(AI not available)'

    const prompt = systemPrompt.replace('{TERMINAL_BUFFER}', bufferRef.current)

    return new Promise<string>((resolve) => {
      let accumulated = ''

      api.aiQueryStream(
        {
          prompt: `${prompt}\n\nUser: ${userText}`,
          taskType: 'general',
          context: context.slice(-10).map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        },
        (payload) => {
          if (payload.chunk) accumulated += payload.chunk
          if (payload.done) resolve(accumulated.trim())
          if (payload.error) resolve(`Sorry, I hit an error: ${payload.error}`)
        },
      )
    })
  }, [])

  // ---------------------------------------------------------------------------
  // Send message
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return

    // Add user message
    const userMsg = createMsg('user', trimmed)
    setMessages(prev => [...prev, userMsg].slice(-MAX_MESSAGES))
    setIsStreaming(true)

    try {
      const context = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
      const response = await queryAI(SORA_SYSTEM_PROMPT, trimmed, context)

      const { relay, display } = extractRelay(response)

      // If Sora decided to relay, write to terminal
      if (relay) {
        const sessionId = getActiveSessionId()
        if (sessionId && window.electronAPI?.writeToSession) {
          window.electronAPI.writeToSession(sessionId, relay + '\n')
        }
      }

      const assistantMsg = createMsg('assistant', display)
      setMessages(prev => [...prev, assistantMsg].slice(-MAX_MESSAGES))

      // TTS + speech bubble
      onSpeak?.(display)
      onBubble?.(display)
    } catch {
      const errMsg = createMsg('assistant', 'Sorry, something went wrong.')
      setMessages(prev => [...prev, errMsg].slice(-MAX_MESSAGES))
    } finally {
      setIsStreaming(false)
    }
  }, [isStreaming, messages, queryAI, getActiveSessionId, onSpeak, onBubble])

  // ---------------------------------------------------------------------------
  // Generate status
  // ---------------------------------------------------------------------------

  const generateStatusInternal = useCallback(async () => {
    if (isStreaming) return

    setIsStreaming(true)
    try {
      const response = await queryAI(STATUS_PROMPT, '', [])
      const statusMsg = createMsg('assistant', response)
      setMessages(prev => [...prev, statusMsg].slice(-MAX_MESSAGES))
      onSpeak?.(response)
      onBubble?.(response)
    } catch {
      // Silent fail for auto-status
    } finally {
      setIsStreaming(false)
    }
  }, [isStreaming, queryAI, onSpeak, onBubble])

  const generateStatus = useCallback(async () => {
    charsSinceStatusRef.current = 0
    lastAutoStatusRef.current = Date.now()
    await generateStatusInternal()
  }, [generateStatusInternal])

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return {
    messages,
    isStreaming,
    sendMessage,
    generateStatus,
    clearMessages,
  }
}

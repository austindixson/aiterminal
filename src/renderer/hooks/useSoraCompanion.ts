/**
 * useSoraCompanion — Sora wake/sleep cycle for Claude Code sessions.
 *
 * SLEEP: Sora monitors terminal output silently.
 * WAKE:  When Claude finishes a task (idle after activity), Sora:
 *        1. Summarizes what Claude just did
 *        2. Asks "What do you want to do next?"
 *        3. Waits for user response (text or voice)
 *        4. Relays the response to Claude Code via terminal
 *        5. Goes back to sleep
 *
 * Also supports manual text input and status requests at any time.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import type { ChatMessage } from '@/types/chat'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SoraState = 'sleeping' | 'summarizing' | 'listening' | 'relaying'

export interface UseSoraCompanionReturn {
  readonly messages: ReadonlyArray<ChatMessage>
  readonly isStreaming: boolean
  readonly soraState: SoraState
  readonly sendMessage: (text: string) => Promise<void>
  readonly generateStatus: () => Promise<void>
  readonly clearMessages: () => void
}

export interface UseSoraCompanionOptions {
  readonly getActiveSessionId: () => string | null
  readonly onSpeak?: (text: string) => void
  readonly onBubble?: (text: string) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BUFFER = 2000
const MAX_MESSAGES = 30
const AUTO_STATUS_COOLDOWN_MS = 30_000
const IDLE_THRESHOLD_MS = 5_000
const ACTIVITY_CHAR_THRESHOLD = 500

const STATUS_AND_PROMPT = `Based on the recent terminal output below, do TWO things:
1. Summarize what just happened in 1-2 sentences (be specific — file names, test results, errors)
2. End with: "What would you like to do next?"

TERMINAL OUTPUT:
---
{TERMINAL_BUFFER}
---`

const SORA_SYSTEM_PROMPT = `You are Sora, a friendly AI companion watching the user's terminal.

RECENT TERMINAL OUTPUT:
---
{TERMINAL_BUFFER}
---

You can:
1. Answer questions about what's happening in the terminal or the project
2. Chat casually — architecture, ideas, opinions
3. Relay commands to Claude Code — wrap what should be typed in [RELAY]command[/RELAY]

Only use [RELAY] when the user clearly wants Claude to do something. For questions and chat, just answer.
Keep responses to 1-3 sentences.`

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
  return { relay, display: display || `Sent to Claude: "${relay}"` }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSoraCompanion(options: UseSoraCompanionOptions): UseSoraCompanionReturn {
  const { getActiveSessionId, onSpeak, onBubble } = options

  const [messages, setMessages] = useState<ReadonlyArray<ChatMessage>>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [soraState, setSoraState] = useState<SoraState>('sleeping')

  // Terminal buffer (rolling, ANSI-stripped)
  const bufferRef = useRef('')
  const lastOutputTimeRef = useRef(0)
  const charsSinceWakeRef = useRef(0)
  const lastWakeTimeRef = useRef(0)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const soraStateRef = useRef<SoraState>('sleeping')
  soraStateRef.current = soraState

  // Stable refs for callbacks (avoid stale closures)
  const onSpeakRef = useRef(onSpeak)
  onSpeakRef.current = onSpeak
  const onBubbleRef = useRef(onBubble)
  onBubbleRef.current = onBubble

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

    const prompt = systemPrompt.replace('{TERMINAL_BUFFER}', bufferRef.current.slice(-1500))

    return new Promise<string>((resolve) => {
      let accumulated = ''

      api.aiQueryStream(
        {
          prompt: userText ? `${prompt}\n\nUser: ${userText}` : prompt,
          taskType: 'general',
          context: context.slice(-6).map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        },
        (payload) => {
          if (payload.chunk) accumulated += payload.chunk
          if (payload.done) resolve(accumulated.trim())
          if (payload.error) resolve(`Sorry, something went wrong.`)
        },
      )
    })
  }, [])

  // ---------------------------------------------------------------------------
  // Wake cycle: summarize → listen → relay → sleep
  // ---------------------------------------------------------------------------

  const wake = useCallback(async () => {
    if (soraStateRef.current !== 'sleeping') return
    if (isStreaming) return

    const now = Date.now()
    if (now - lastWakeTimeRef.current < AUTO_STATUS_COOLDOWN_MS) return
    lastWakeTimeRef.current = now

    setSoraState('summarizing')
    setIsStreaming(true)

    try {
      const response = await queryAI(STATUS_AND_PROMPT, '', [])
      const statusMsg = createMsg('assistant', response)
      setMessages(prev => [...prev, statusMsg].slice(-MAX_MESSAGES))
      onSpeakRef.current?.(response)
      onBubbleRef.current?.(response)

      // Now listening for user response
      setSoraState('listening')
    } catch {
      setSoraState('sleeping')
    } finally {
      setIsStreaming(false)
    }

    charsSinceWakeRef.current = 0
  }, [isStreaming, queryAI])

  // ---------------------------------------------------------------------------
  // Subscribe to PTY output
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.onAnySessionData) return

    const unsub = api.onAnySessionData((_sessionId, data) => {
      const clean = stripAnsi(data)
      bufferRef.current = (bufferRef.current + clean).slice(-MAX_BUFFER)
      lastOutputTimeRef.current = Date.now()
      charsSinceWakeRef.current += clean.length

      // Only track idle when sleeping (don't wake during user interaction)
      if (soraStateRef.current !== 'sleeping') return

      // Reset idle timer
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(() => {
        // Wake if enough activity happened since last wake
        if (charsSinceWakeRef.current > ACTIVITY_CHAR_THRESHOLD) {
          wake()
        }
      }, IDLE_THRESHOLD_MS)
    })

    return () => {
      unsub?.()
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, [wake])

  // ---------------------------------------------------------------------------
  // Send message (user response or manual input)
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return

    const userMsg = createMsg('user', trimmed)
    setMessages(prev => [...prev, userMsg].slice(-MAX_MESSAGES))
    setIsStreaming(true)

    // If Sora was listening (wake cycle), this is the user's next task
    const wasListening = soraStateRef.current === 'listening'
    if (wasListening) {
      setSoraState('relaying')
    }

    try {
      const context = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
      const response = await queryAI(SORA_SYSTEM_PROMPT, trimmed, context)

      const { relay, display } = extractRelay(response)

      if (relay) {
        const sessionId = getActiveSessionId()
        if (sessionId && window.electronAPI?.writeToSession) {
          window.electronAPI.writeToSession(sessionId, relay + '\n')
        }
      }

      const assistantMsg = createMsg('assistant', display)
      setMessages(prev => [...prev, assistantMsg].slice(-MAX_MESSAGES))
      onSpeakRef.current?.(display)
      onBubbleRef.current?.(display)

      // After relaying, go back to sleep
      if (relay || wasListening) {
        setSoraState('sleeping')
      }
    } catch {
      const errMsg = createMsg('assistant', 'Sorry, something went wrong.')
      setMessages(prev => [...prev, errMsg].slice(-MAX_MESSAGES))
      setSoraState('sleeping')
    } finally {
      setIsStreaming(false)
    }
  }, [isStreaming, messages, queryAI, getActiveSessionId])

  // ---------------------------------------------------------------------------
  // Manual status (always available)
  // ---------------------------------------------------------------------------

  const generateStatus = useCallback(async () => {
    lastWakeTimeRef.current = Date.now()
    charsSinceWakeRef.current = 0

    setSoraState('summarizing')
    setIsStreaming(true)
    try {
      const response = await queryAI(STATUS_AND_PROMPT, '', [])
      const statusMsg = createMsg('assistant', response)
      setMessages(prev => [...prev, statusMsg].slice(-MAX_MESSAGES))
      onSpeakRef.current?.(response)
      onBubbleRef.current?.(response)
      setSoraState('listening')
    } catch {
      setSoraState('sleeping')
    } finally {
      setIsStreaming(false)
    }
  }, [queryAI])

  const clearMessages = useCallback(() => {
    setMessages([])
    setSoraState('sleeping')
  }, [])

  return {
    messages,
    isStreaming,
    soraState,
    sendMessage,
    generateStatus,
    clearMessages,
  }
}

/**
 * useChat — React hook managing chat sidebar state.
 *
 * Manages messages, file attachments, @mention detection,
 * sidebar width, and AI interaction via electronAPI.
 * All state updates are immutable.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { MODELS } from '@/ai/models'
import type { ChatMessage, ChatMode, ChatState, FileAttachment } from '@/types/chat'
import type { FileOperation } from '@/types/agent'
import { parseAgentResponse, applyOperation } from '@/agent/agent-service'
import { DEFAULT_INTERN_ID } from '@/intern-config'
import { useSessionHistory } from './useSessionHistory'
import { getAgentLoopState } from '@/types/agent-loop-state'

// ---------------------------------------------------------------------------
// Shared tag stripping — single source of truth for streaming + post-stream
// ---------------------------------------------------------------------------

/**
 * Strip ALL tool tags from AI output for display. Used during streaming
 * (progressive) and after streaming (final). Handles every model format.
 */
function stripAllToolTags(text: string): string {
  return text
    // RUN tags: hybrid [RUN:label]body[/RUN] first (requires closing tag)
    .replace(/\[RUN:[^\]]*\][\s\S]*?\[\/(?:RUN\]?)?/g, '')
    // RUN tags: wrapper [RUN]body[/RUN] or [RUN]body (to end)
    .replace(/\[RUN\][\s\S]*?(?:\[\/(?:RUN\]?)?|$)/gs, '')
    // RUN tags: standalone colon [RUN:cmd]
    .replace(/\[RUN:[^\]]*\]/g, '')
    // File operation tags
    .replace(/\[FILE:[^\]]*?\][\s\S]*?(?:\[\/FILE\]|$)/g, '')
    .replace(/\[EDIT:[^\]]*?\][\s\S]*?(?:\[\/EDIT\]|$)/g, '')
    .replace(/\[DELETE:[^\]]*?\]?/g, '')
    .replace(/\[MEMORY:\w+\][\s\S]*?(?:\[\/MEMORY\]|$)/g, '')
    .replace(/\[USER:\w+\][\s\S]*?(?:\[\/USER\]|$)/g, '')
    .replace(/\[READ:[^\]\n]+\]?/g, '')
    // Budget model junk: leftover "filename]" fragments from multi-file [READ:a] b] c]
    .replace(/\s+[\w./-]+\]/g, (match) => {
      // Only strip if it looks like a file path fragment (has extension or slash)
      return /[./]/.test(match) ? '' : match
    })
    // Orphaned closing tags
    .replace(/\[\/(?:RUN|READ|FILE|EDIT|DELETE)\]?/g, '')
    // Partial tags mid-stream
    .replace(/\[(?:RUN|READ|FILE|EDIT|DELETE)(?::[^\]]*)?$/g, '')
    .replace(/\[\//g, '')
    // Non-standard tag variants (budget model hallucinations)
    .replace(/\{(?:READ|exec|RUN|EDIT|FILE):[^}]*\}?/gi, '')
    .replace(/\(voice\)\s*"[^"]*"/g, '')
    .replace(/<tool_call>[\s\S]*?(?:<\/tool_call>|$)/g, '')
    .replace(/<tool_call>[^\n]*/g, '')
    .replace(/<function[\s\S]*?(?:<\/function>|$)/g, '')
    .replace(/<parameter[\s\S]*?(?:<\/parameter>|$)/g, '')
    .replace(/CAUTION\s*\([^)]*\)/gi, '')
    // Strip bare [filename.ext] patterns (budget model outputs [README.md] instead of [READ:README.md])
    .replace(/\[[\w./-]+\.\w{1,6}\]/g, '')
    // Strip filler characters from budget model output (arrows, repeated dots/commas)
    .replace(/[→←↑↓]{2,}/g, '')
    .replace(/\s*[→←]\s*/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_WIDTH = 420
const MIN_WIDTH = 280
const MAX_WIDTH = 640
const MAX_MESSAGES = 50

// Avatar section resize constraints
const DEFAULT_AVATAR_HEIGHT = 240
const MIN_AVATAR_HEIGHT = 180
const MAX_AVATAR_HEIGHT = 400

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

function clampAvatarHeight(height: number): number {
  return Math.max(MIN_AVATAR_HEIGHT, Math.min(MAX_AVATAR_HEIGHT, height))
}

// ---------------------------------------------------------------------------
// File operation tag parsing
// ---------------------------------------------------------------------------

function extractFileOps(raw: string): { text: string; operations: ReadonlyArray<FileOperation> } {
  const operations = parseAgentResponse(raw)
  if (operations.length === 0) return { text: raw, operations: [] }

  // Strip raw tags from display text
  let text = raw
    .replace(/\[FILE:[^\]]+\][\s\S]*?\[\/FILE\]/g, '')
    .replace(/\[EDIT:[^\]]+\][\s\S]*?\[\/EDIT\]/g, '')
    .replace(/\[DELETE:[^\]]+\]/g, '')
    .replace(/\[READ:[^\]]+\]/g, '')
    .trim()

  // Add operation summary
  const writeOps = operations.filter(op => op.type !== 'read')
  if (writeOps.length > 0) {
    const summary = writeOps.map(op => `\`${op.type}\` ${op.filePath}`).join(', ')
    text = text ? `${text}\n\n**Proposed:** ${summary}` : `**Proposed:** ${summary}`
  }

  return { text, operations }
}

// ---------------------------------------------------------------------------
// Memory tag processing (Hermes-style self-learning)
// ---------------------------------------------------------------------------

/**
 * Process [MEMORY:action]content[/MEMORY] and [USER:action]content[/USER] tags.
 * Calls the main process memory-tool IPC handler.
 */
function processMemoryTags(text: string): void {
  const api = window.electronAPI
  if (!api?.memoryTool) return

  // [MEMORY:add]content[/MEMORY]
  const memoryRegex = /\[MEMORY:(add|replace|remove)\]([\s\S]*?)(?:\[\/MEMORY\]|$)/g
  let match: RegExpExecArray | null
  while ((match = memoryRegex.exec(text)) !== null) {
    const action = match[1]
    const content = match[2].trim()
    if (content) {
      api.memoryTool({ action, file: 'MEMORY.md', content }).catch(() => {})
    }
  }

  // [USER:add]content[/USER]
  const userRegex = /\[USER:(add|replace|remove)\]([\s\S]*?)(?:\[\/USER\]|$)/g
  while ((match = userRegex.exec(text)) !== null) {
    const action = match[1]
    const content = match[2].trim()
    if (content) {
      api.memoryTool({ action, file: 'USER.md', content }).catch(() => {})
    }
  }
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
  readonly setAvatarHeight: (height: number) => void
  readonly sendMessage: (content: string, modelOverride?: string) => Promise<void>
  readonly clearMessages: () => void
  readonly addAttachment: (file: FileAttachment) => void
  readonly removeAttachment: (path: string) => void
  readonly setInputValue: (value: string) => void
  readonly extractMentions: (text: string) => readonly string[]
  readonly injectFromTerminal: (userInput: string) => Promise<void>
  readonly pendingFileOps: ReadonlyArray<FileOperation>
  readonly approveFileOps: () => Promise<void>
  readonly rejectFileOps: () => void
  readonly cycleChatMode: () => void
  readonly stopAgentLoop: () => void
  readonly isAgentLooping: boolean
  readonly revertToSnapshot: (snapshotId: string) => void
  readonly canRevert: boolean
  readonly sessionSnapshots: ReadonlyArray<{ id: string; label?: string; timestamp: number }>
}

// ---------------------------------------------------------------------------
// PTY output capture — listens for terminal output after a command
// ---------------------------------------------------------------------------

// Prompt patterns that indicate the shell is idle and ready for input
const SHELL_PROMPT_RE = /(?:[$%>#])\s*$/m

function capturePtyOutput(sessionId: string, _cmd: string, _durationMs: number): Promise<string> {
  const MAX_MS = 15000
  const DEBOUNCE_MS = 200
  const MIN_OUTPUT_LEN = 10

  return new Promise((resolve) => {
    let output = ''
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let maxTimer: ReturnType<typeof setTimeout> | null = null
    let settled = false

    const api = window.electronAPI
    if (!api?.onSessionData) {
      resolve('')
      return
    }

    function finish() {
      if (settled) return
      settled = true
      if (debounceTimer !== null) clearTimeout(debounceTimer)
      if (maxTimer !== null) clearTimeout(maxTimer)
      unsub()
      const clean = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\r/g, '')
      resolve(clean)
    }

    const unsub = api.onSessionData(sessionId, (data: string) => {
      output += data

      // After a prompt is detected and we have meaningful output, debounce-resolve
      const stripped = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\r/g, '')
      if (stripped.length > MIN_OUTPUT_LEN && SHELL_PROMPT_RE.test(stripped)) {
        if (debounceTimer !== null) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(finish, DEBOUNCE_MS)
      }
    })

    // Hard cap fallback
    maxTimer = setTimeout(finish, MAX_MS)
  })
}

// ---------------------------------------------------------------------------
// Extract important lines from command output (errors, warnings, summaries)
// ---------------------------------------------------------------------------

function extractImportantOutput(raw: string, cmd: string): string {
  // Strip ANSI remnants and carriage returns
  const clean = raw
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, '')
    .replace(/\r/g, '')

  const lines = clean.split('\n')
  const important: string[] = []
  const isTest = /test|spec|check|lint|build|compile/i.test(cmd)

  for (const line of lines) {
    const l = line.trim()
    if (l.length === 0) continue

    // SKIP: progress bars, build progress, verbose compilation noise
    if (/^\s*Building \[/.test(l)) continue
    if (/^\s*Checking \w/.test(l)) continue
    if (/^\s*Compiling \w/.test(l) && !(/error|warning/i.test(l))) continue
    if (/^\s*Downloading\b/.test(l)) continue
    if (/^\s*Downloaded\b/.test(l)) continue
    if (/^\s*Fetching\b/.test(l)) continue
    if (/^\s*Unpacking\b/.test(l)) continue
    if (/^\s*Fresh\b/.test(l)) continue
    if (l.length > 200) continue // skip very long lines (binary output, JSON dumps)

    // Keep: errors, failures, panics
    if (/\berror\b|\bfail\b|\bpanic\b/i.test(l)) {
      important.push(l)
      continue
    }
    // Keep: warnings (but not "warning: build failed, waiting" duplicates)
    if (/\bwarning\b/i.test(l) && !/build failed, waiting/i.test(l)) {
      important.push(l)
      continue
    }
    // Keep: test results
    if (isTest && /(?:test result|tests? (?:passed|failed|ok)|running \d|PASSED|FAILED|ok \(|failures:)/i.test(l)) {
      important.push(l)
      continue
    }
    // Keep: final status lines
    if (/^Finished\b/i.test(l)) {
      important.push(l)
      continue
    }
    // Keep: exit codes
    if (/(?:exit code|exited with|\d+ passed|\d+ failed)/i.test(l)) {
      important.push(l)
      continue
    }
  }

  // Deduplicate and limit to 30 lines
  const unique = [...new Set(important)]
  if (unique.length > 30) {
    return unique.slice(0, 15).join('\n') + '\n... (' + (unique.length - 15) + ' more)\n' + unique.slice(-5).join('\n')
  }
  if (unique.length === 0) {
    // No important lines found — return last 5 lines as fallback
    const lastLines = lines.filter(l => l.trim().length > 0).slice(-5)
    return lastLines.join('\n') || '(no output captured)'
  }
  return unique.join('\n')
}

// ---------------------------------------------------------------------------
// Summarize AI response for TTS — strips tool tags, code, markdown
// ---------------------------------------------------------------------------

function summarizeForTTS(accumulated: string): string {
  let clean = accumulated
    // Strip all tool tags (forgiving patterns)
    .replace(/\[RUN\].*?(?:\[\/(?:RUN\]?)?|$)/gs, '')
    .replace(/\[FILE:[^\]]*?\][\s\S]*?(?:\[\/FILE\]|$)/g, '')
    .replace(/\[EDIT:[^\]]*?\][\s\S]*?(?:\[\/EDIT\]|$)/g, '')
    .replace(/\[DELETE:[^\]]*?\]?/g, '')
    .replace(/\[MEMORY:\w+\][\s\S]*?(?:\[\/MEMORY\]|$)/g, '')
    .replace(/\[USER:\w+\][\s\S]*?(?:\[\/USER\]|$)/g, '')
    .replace(/\[READ:[^\]\n]+\]?/g, '')
    .replace(/\[(?:RUN|READ|FILE|EDIT|DELETE)(?::[^\]]*)?$/g, '')
    .replace(/\[\/[A-Z]*\]?/g, '')
    .replace(/\{(?:READ|exec|RUN|EDIT|FILE):[^}]*\}?/gi, '')
    // Strip code blocks and inline code
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]+`/g, '')
    // Strip markdown formatting
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/[-*]\s/g, '')
    // Strip file paths and extensions
    .replace(/\S+\.\w{1,5}\]/g, '')
    .replace(/\/\S+\.\w{1,5}/g, '')
    .replace(/\w+\.\w{2,4}(?:\s|$)/g, ' ')
    // Strip tool output markers
    .replace(/⚡ Executed:[^\n]*/g, '')
    .replace(/📄 Read[^\n]*/g, '')
    .replace(/✅[^\n]*/g, '')
    .replace(/❌[^\n]*/g, '')
    .replace(/\(voice\)\s*"[^"]*"/g, '')
    .replace(/Output from[^\n]*/g, '')
    .replace(/Analyze the results[^\n]*/g, '')
    .replace(/Continue —[^\n]*/g, '')
    .replace(/CAUTION\s*\([^)]*\)/gi, '')
    .replace(/Key Components:[^\n]*/g, '')
    .replace(/Configuration Details:[^\n]*/g, '')
    .replace(/Dependencies:[^\n]*/g, '')
    .replace(/Available CLI[^\n]*/g, '')
    .replace(/How to Customize:[^\n]*/g, '')
    .replace(/<tool_call>[\s\S]*?(?:<\/tool_call>|$)/g, '')
    .replace(/<tool_call>[^\n]*/g, '')
    .replace(/<function[\s\S]*?(?:<\/function>|$)/g, '')
    .replace(/<parameter[\s\S]*?(?:<\/parameter>|$)/g, '')
    // Strip lines that look like code/config/output
    .split('\n')
    .filter(line => {
      const l = line.trim()
      if (l.length === 0) return false
      if (/^[{}\[\]()=<>|&;:,]/.test(l)) return false
      if (/^\s*(import|from|def |class |const |let |var |function )/.test(l)) return false
      if (/^\s*[A-Z_]{2,}\s*[:=]/.test(l)) return false
      if (/^\d+[-:]/.test(l)) return false
      if (l.split(/[{}()\[\]"':;,=]/).length > l.split(/\s/).length) return false
      return true
    })
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  if (clean.length === 0) return ''

  // Take first sentence only, capped at 80 chars for short spoken output
  const sentences = clean.match(/[^.!?]+[.!?]+/g)
  if (sentences && sentences.length > 0) {
    const first = sentences[0].trim()
    if (first.length > 10) {
      return first.length > 80 ? first.slice(0, 77).trim() + '...' : first
    }
  }

  // Fallback: first 60 chars
  if (clean.length > 10 && /[a-z]/.test(clean)) {
    return clean.length > 60 ? clean.slice(0, 57).trim() + '...' : clean
  }

  return ''
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChat(): UseChatReturn {
  const [isOpen, setIsOpen] = useState(false)
  const [width, setWidthState] = useState(DEFAULT_WIDTH)
  const [avatarHeight, setAvatarHeightState] = useState(DEFAULT_AVATAR_HEIGHT)
  const [messages, setMessages] = useState<ReadonlyArray<ChatMessage>>([])
  const [inputValue, setInputValueState] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<ReadonlyArray<FileAttachment>>([])
  const [activeModelLabel, setActiveModelLabel] = useState<string | undefined>(undefined)
  const [activeModelId, setActiveModelId] = useState<string | undefined>(undefined)
  const [activePresetLabel, setActivePresetLabel] = useState<string | undefined>(undefined)
  const [pendingFileOps, setPendingFileOps] = useState<ReadonlyArray<FileOperation>>([])
  const [chatMode, setChatMode] = useState<ChatMode>('normal')
  const pendingSendRef = useRef<((msg: string) => Promise<void>) | null>(null)
  // Persistent file context — survives message window eviction
  const fileContextRef = useRef<Map<string, string>>(new Map())
  const sessionHistory = useSessionHistory()
  const agentLoopActiveRef = useRef(false)
  const agentLoopIterationsRef = useRef(0)
  const activeStreamIdRef = useRef<string | null>(null)
  const MAX_AGENT_ITERATIONS = 10

  const cycleChatMode = useCallback(() => {
    setChatMode(prev => {
      const modes: ChatMode[] = ['normal', 'plan', 'autocode']
      const idx = modes.indexOf(prev)
      return modes[(idx + 1) % modes.length]
    })
  }, [])

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

  const setAvatarHeight = useCallback((h: number) => {
    setAvatarHeightState(clampAvatarHeight(h))
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

  // Internal send that skips user message bubble (for agent loop continuations)
  // Optional modelOverride forces a specific model (used for escalation)
  const sendMessageInternal = async (content: string, modelOverride?: string) => {
    await sendMessage(content, modelOverride, true)
  }

  const sendMessage = useCallback(
    async (content: string, modelOverride?: string, _hidden = false) => {
      const trimmed = content.trim()
      if (trimmed.length === 0) return

      // Start agent loop in autocode mode
      if (chatMode === 'autocode') {
        agentLoopActiveRef.current = true
        // Reset iterations only on genuine user-initiated messages (not nudges/continuations)
        if (!_hidden) {
          agentLoopIterationsRef.current = 0
        }
      }

      // Update system prompt with active intern + CWD before sending
      const api = window.electronAPI
      if (api?.updateInternSystemPrompt) {
        const agentState = getAgentLoopState()
        const activeIntern = agentState?.activeIntern || DEFAULT_INTERN_ID
        const cwd = agentState?.cwd as string | undefined
        // System prompt update — no hot-path logging
        await api.updateInternSystemPrompt({ intern: activeIntern, cwd })
      }

      // Create user message with current attachments (skip for hidden continuations)
      if (!_hidden) {
        // Auto-snapshot before user sends (enables revert)
        if (messages.length > 0) {
          sessionHistory.snapshot(messages, `Before: ${trimmed.slice(0, 30)}`)
        }
        const userMsg = createUserMessage(trimmed, attachedFiles)
        setMessages((prev) => [...prev, userMsg].slice(-MAX_MESSAGES))
      }

      // Build context from attached files for the AI prompt
      const fileContext = attachedFiles
        .filter((f) => f.content)
        .map((f) => `[File: ${f.name}]\n${f.content}`)
        .join('\n\n')

      // Persistent file context — keep only last 3 files to avoid blowing up prompt on small models
      const fileEntries = Array.from(fileContextRef.current.entries())
      const recentFiles = fileEntries.slice(-3)
      const persistentFiles = recentFiles
        .map(([path, content]) => `[Previously read: ${path}]\n${content.slice(0, 2000)}`)
        .join('\n\n')

      // Apply mode prefix
      const modePrefix = chatMode === 'plan'
        ? '[PLAN MODE] Describe what changes you would make and why, but do NOT use [FILE], [EDIT], or [DELETE] tags. Only analyze and explain your plan.\n\n'
        : chatMode === 'autocode'
        ? '[AUTOCODE MODE] You have full autonomy. ALWAYS start your response with a brief one-line statement of what you are about to do, THEN use tool tags. Example: "Running the test suite." followed by [RUN:cargo test]. Use [READ:path] to read files, [EDIT:path] to fix code, [RUN:command] to execute commands. Act immediately without asking permission. Never say "you should" — just do it.\n\n'
        : 'ALWAYS start with a brief statement of what you are doing, THEN use tool tags. Read files with [READ:path], run commands with [RUN:command] (e.g. [RUN:ls], [RUN:npm test]), edit files with [EDIT:path]. Act proactively.\n\n'

      const allContext = [persistentFiles, fileContext].filter(Boolean).join('\n\n')
      const fullPrompt = modePrefix + (allContext
        ? `${allContext}\n\n${trimmed}`
        : trimmed)

      // Clear attachments after sending
      setAttachedFiles([])
      setIsStreaming(true)

      try {
        const api = window.electronAPI
        const hasElectronAPI =
          typeof window !== 'undefined' && 'electronAPI' in window && api?.aiQuery

        if (hasElectronAPI) {
          const context = messages.slice(-20).map((msg) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          }))

          const applyRunTags = (raw: string): string => {
            let text = raw
            const commands: string[] = []
            const seen = new Set<string>()
            let match: RegExpExecArray | null

            const addCmd = (cmd: string) => {
              const c = cmd.trim()
              if (c && !seen.has(c)) { seen.add(c); commands.push(c) }
            }

            // Format A: [RUN:label]actual command[/RUN] — hybrid (budget model confusion)
            // The label is junk like "command" or "shell", the body is the real command
            const hybridRegex = /\[RUN:[^\]]*\]([\s\S]*?)\[\/(?:RUN\]?)?/g
            while ((match = hybridRegex.exec(text)) !== null) {
              const body = match[1].trim()
              // Only accept if body looks like an actual command (has a program name)
              if (body && /^[\w.\/~$-]/.test(body)) addCmd(body)
            }

            // Format B: [RUN]command[/RUN] (canonical wrapper format)
            const wrapperRegex = /\[RUN\](.*?)(?:\[\/(?:RUN\]?)?|$)/gs
            while ((match = wrapperRegex.exec(text)) !== null) {
              addCmd(match[1])
            }

            // Format C: [RUN:command] (pure colon format — budget models)
            const colonRegex = /\[RUN:([^\]]+)\]/g
            while ((match = colonRegex.exec(text)) !== null) {
              const cmd = match[1].trim()
              // Skip generic labels like "command", "shell", "terminal"
              if (cmd && !/^(?:command|shell|terminal|run|exec|execute)$/i.test(cmd)) {
                addCmd(cmd)
              }
            }

            // Format D: ```bash\ncommand\n``` (code block fallback, autocode only)
            if (commands.length === 0 && chatMode === 'autocode') {
              const bashBlockRegex = /```(?:bash|sh|shell|zsh)\n([\s\S]*?)```/g
              while ((match = bashBlockRegex.exec(text)) !== null) {
                const lines = match[1].trim().split('\n')
                for (const line of lines) {
                  const cmd = line.trim()
                  if (cmd && !cmd.startsWith('#')) addCmd(cmd)
                }
              }
            }

            if (commands.length === 0) return text

            // Strip all tag variants from display using shared function
            text = stripAllToolTags(text)

            if (chatMode === 'autocode') {
              // AUTOCODE: execute commands in the active terminal and capture output
              const sessionId = getAgentLoopState().activeSessionId
              for (const cmd of commands) {
                if (sessionId && window.electronAPI?.writeToSession) {
                  window.electronAPI.writeToSession(sessionId, cmd + '\r')

                  // Capture PTY output and feed back to AI for analysis
                  capturePtyOutput(sessionId, cmd, 8000).then(output => {
                    if (output.trim().length > 0) {
                      // Extract only important lines: errors, warnings, test results, summaries
                      const important = extractImportantOutput(output, cmd)
                      if (important.length > 0) {
                        const followUp = `Output from \`${cmd}\`:\n\`\`\`\n${important}\n\`\`\`\nBriefly note the result (pass/fail), then continue with the next step. Do NOT stop here — keep going until the full task is complete.`
                        pendingSendRef.current?.(followUp)
                      }
                    }
                  })
                }
                text = text
                  ? `⚡ Executed: \`${cmd}\`\n\n${text}`
                  : `⚡ Executed: \`${cmd}\``
              }
            } else {
              // NORMAL/PLAN: show as suggested commands
              const cmdBlock = commands
                .map(cmd => `\`\`\`\n${cmd}\n\`\`\``)
                .join('\n')
              text = text
                ? `💡 Suggested command:\n${cmdBlock}\n\n${text}`
                : `💡 Suggested command:\n${cmdBlock}`
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
            let repetitionCount = 0
            let lastChunkPattern = ''
            let earlyTTSFired = false

            await api.aiQueryStream(
              { prompt: fullPrompt, taskType: 'general', context, modelOverride },
              (payload) => {
                // Capture requestId for cancellation
                if (!activeStreamIdRef.current && payload.requestId) {
                  activeStreamIdRef.current = payload.requestId
                }
                if (payload.chunk) {
                  accumulated += payload.chunk

                  // Detect repetition loops (budget models get stuck generating [/ [/ [/ ...)
                  const last50 = accumulated.slice(-50)
                  const pattern = last50.match(/(\[\/?\w*\]?\s*){5,}/)?.[0] || ''
                  if (pattern.length > 10 && pattern === lastChunkPattern) {
                    repetitionCount++
                    if (repetitionCount > 3) {
                      // Cancel the stream — model is stuck
                      console.warn('[useChat] Repetition loop detected, cancelling stream')
                      if (activeStreamIdRef.current && api.cancelAIStream) {
                        api.cancelAIStream(activeStreamIdRef.current)
                      }
                      // Truncate accumulated to remove the junk
                      const cleanEnd = accumulated.search(/(\[\/?\s*){10,}/)
                      if (cleanEnd > 0) accumulated = accumulated.slice(0, cleanEnd)
                      return
                    }
                  } else {
                    repetitionCount = 0
                    lastChunkPattern = pattern
                  }

                  const displayText = stripAllToolTags(accumulated)

                  // Early TTS: speak the first sentence as soon as it's complete
                  if (!earlyTTSFired && !_hidden && displayText.length > 10) {
                    const firstSentence = displayText.match(/^[^.!?]+[.!?]/)
                    if (firstSentence) {
                      earlyTTSFired = true
                      const speech = firstSentence[0].trim()
                      if (speech.length > 5 && speech.length < 100) {
                        window.dispatchEvent(new CustomEvent('ai-tts-summary', { detail: speech }))
                      }
                    }
                  }

                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === placeholderId ? { ...m, content: displayText } : m,
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
                if (payload.done && (payload.modelLabel || payload.usage)) {
                  // Update the active model label so the input area reflects what was used
                  if (payload.modelLabel) {
                    setActiveModelLabel(payload.modelLabel)
                  }
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === placeholderId ? {
                        ...m,
                        model: payload.modelLabel || m.model,
                        tokens: payload.usage ? {
                          prompt: payload.usage.prompt_tokens,
                          completion: payload.usage.completion_tokens,
                          total: payload.usage.total_tokens,
                        } : undefined,
                      } : m,
                    ),
                  )
                }
              },
            )

            // Dispatch summarized TTS only if early TTS didn't already speak
            if (!_hidden && !earlyTTSFired) {
              const ttsSummary = summarizeForTTS(accumulated)
              if (ttsSummary.length > 0) {
                window.dispatchEvent(new CustomEvent('ai-tts-summary', { detail: ttsSummary }))
              }
            }

            const afterRunTags = applyRunTags(accumulated)

            // Process memory tags: [MEMORY:add]content[/MEMORY] and [USER:add]content[/USER]
            processMemoryTags(afterRunTags)

            const { text: finalContent, operations } = extractFileOps(afterRunTags)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === placeholderId ? { ...m, content: finalContent } : m,
              ),
            )

            // Handle file operations
            if (operations.length > 0) {
              // Auto-handle [READ:] tags — fetch file and inject into context
              const readOps = operations.filter(op => op.type === 'read')
              const writeOps = operations.filter(op => op.type !== 'read')

              for (const readOp of readOps) {
                try {
                  const result = await window.electronAPI.readFile(readOp.filePath)
                  if (result.content) {
                    // Store in persistent file context (survives message window eviction)
                    fileContextRef.current.set(readOp.filePath, result.content.slice(0, 5000))
                    const lines = result.content.split('\n').length
                    const size = result.content.length
                    const fileMsg = createAssistantMessage(
                      `📄 Read **${readOp.filePath}** — ${lines} lines, ${Math.round(size / 1024)}KB`,
                    )
                    setMessages((prev) => [...prev, fileMsg].slice(-MAX_MESSAGES))
                  }
                } catch {
                  /* ignore read errors */
                }
              }

              // Autocode mode: apply immediately. Normal mode: store for approval.
              if (writeOps.length > 0) {
                if (chatMode === 'autocode') {
                  const results: string[] = []
                  for (const op of writeOps) {
                    const result = await applyOperation(op)
                    if (result.success) {
                      if (op.searchText != null) {
                        results.push(`✅ **${op.filePath}**\n\`\`\`diff\n${op.searchText.split('\n').map(l => '- ' + l).join('\n')}\n${(op.replaceText || '').split('\n').map(l => '+ ' + l).join('\n')}\n\`\`\``)
                      } else {
                        results.push(`✅ ${op.type} ${op.filePath}`)
                      }
                    } else {
                      results.push(`❌ ${op.type} ${op.filePath}: ${result.error}`)
                    }
                  }
                  const summaryMsg = createAssistantMessage(results.join('\n\n'))
                  setMessages((prev) => [...prev, summaryMsg].slice(-MAX_MESSAGES))
                } else {
                  setPendingFileOps(writeOps)
                }
              }

              // Stop agent loop conditions
              if (chatMode === 'autocode') {
                const strippedContent = accumulated.replace(/\[.*?\]/g, '').replace(/\[\/?\w*\]?/g, '').replace(/[→←↑↓•·,\s.\[\]\/]+/g, '').trim()
                const hasTagFragments = /\[/.test(accumulated)
                const hasCompleteTags = operations.length > 0 || accumulated.includes('[RUN]') || accumulated.includes('[RUN:')
                const isDone = /(?:task|everything|all\s+\w+\s+is)\s+(?:complete|done|finished)|^complete\.?$/im.test(accumulated)

                console.log('[AgentLoop] Post-stream analysis:', {
                  iteration: agentLoopIterationsRef.current,
                  loopActive: agentLoopActiveRef.current,
                  accumulatedLen: accumulated.length,
                  strippedLen: strippedContent.length,
                  hasTagFragments,
                  hasCompleteTags,
                  isDone,
                  opsCount: operations.length,
                  first80: accumulated.slice(0, 80),
                })

                if (isDone && !hasCompleteTags) {
                  console.log('[AgentLoop] STOPPING — AI signaled completion')
                  agentLoopActiveRef.current = false
                }

                if (strippedContent.length === 0 && !hasTagFragments) {
                  console.log('[AgentLoop] STOPPING — truly empty response (no text, no tags)')
                  agentLoopActiveRef.current = false
                }

                // Nudge or escalate: if no complete tool tags were used
                if (!hasCompleteTags && agentLoopActiveRef.current && !isDone) {
                  agentLoopIterationsRef.current++
                  const iter = agentLoopIterationsRef.current
                  const needsEscalation = iter >= 2

                  console.log(`[AgentLoop] NUDGE #${iter} — no complete tags.${needsEscalation ? ' ESCALATING model.' : ''}`)

                  if (iter < MAX_AGENT_ITERATIONS) {
                    setTimeout(() => {
                      if (!agentLoopActiveRef.current) {
                        console.log('[AgentLoop] Nudge cancelled — loop no longer active')
                        return
                      }
                      if (needsEscalation) {
                        const escalationModels: Record<string, string> = {
                          budget: 'qwen/qwen3-coder-next',
                          balanced: 'z-ai/glm-5',
                          speed: 'qwen/qwen3-coder-next',
                          performance: 'anthropic/claude-sonnet-4-20250514',
                        }
                        const api = window.electronAPI
                        api?.getActiveAiModel?.('general').then((info: { presetName?: string }) => {
                          const model = escalationModels[info?.presetName || 'budget'] || 'qwen/qwen3-coder-next'
                          console.log(`[AgentLoop] Escalating to ${model}`)
                          sendMessageInternal(
                            'The previous model could not use tool tags. You MUST use tags to act:\n- [RUN:command] to execute (e.g. [RUN:pytest])\n- [READ:path] to read files\n- [EDIT:path]content[/EDIT] to edit\nACT NOW.',
                            model,
                          )
                        }).catch(() => {
                          sendMessageInternal('ACT NOW with [RUN:command] or [READ:path] tags.')
                        })
                      } else {
                        sendMessageInternal('STOP describing. ACT NOW. Use these exact tags:\n- [RUN:pytest] to run commands\n- [READ:main.py] to read files\nDo NOT explain. Just do it.')
                      }
                    }, 300)
                  } else {
                    console.log(`[AgentLoop] Max iterations (${MAX_AGENT_ITERATIONS}) reached — stopping`)
                    agentLoopActiveRef.current = false
                  }
                }
              }

              // Autocode agent loop: continue if ANY operations were performed (read, write, or run)
              const hasAnyOps = operations.length > 0
              const hasRunOps = accumulated.includes('[RUN]') || accumulated.includes('[RUN:')
              const hasPartialTag = /\[(?:READ|EDIT|RUN|FILE)(?::|\s*$)/m.test(accumulated)

              console.log('[AgentLoop] Continuation check:', {
                chatMode,
                loopActive: agentLoopActiveRef.current,
                hasAnyOps,
                hasRunOps,
                hasPartialTag,
                willContinue: chatMode === 'autocode' && agentLoopActiveRef.current && (hasAnyOps || hasRunOps || hasPartialTag),
              })

              if (chatMode === 'autocode' && agentLoopActiveRef.current && (hasAnyOps || hasRunOps || hasPartialTag)) {
                agentLoopIterationsRef.current++
                if (agentLoopIterationsRef.current < MAX_AGENT_ITERATIONS) {
                  // Brief delay then continue
                  setTimeout(() => {
                    if (agentLoopActiveRef.current) {
                      const readFiles = readOps.map(op => op.filePath).join(', ')
                      const editFiles = writeOps.map(op => op.filePath).join(', ')
                      const parts = [
                        readFiles ? `Read: ${readFiles}` : '',
                        editFiles ? `Applied edits to: ${editFiles}` : '',
                      ].filter(Boolean).join('. ')
                      let context = parts || 'Previous step processed'

                      // If the response ended with a partial tag, extract what the AI was trying to do
                      const partialMatch = accumulated.match(/\[(READ|EDIT|RUN|FILE):?([^\]\n]*)$/)
                      if (partialMatch) {
                        const tag = partialMatch[1]
                        const arg = partialMatch[2]?.trim()
                        if (arg) {
                          context += `. You were about to [${tag}:${arg}] — complete that action now`
                        } else {
                          context += `. Your response was cut off mid-tag — continue from where you left off`
                        }
                      }

                      // Send as hidden continuation (no user message bubble)
                      sendMessageInternal(`${context}. Continue — what's the next step? Use [RUN:command] [READ:path] [EDIT:path] tags. If done, say "Complete."`)
                    }
                  }, 500)
                }
              }
            }
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

            // Auto-speak summarized response via TTS
            try {
              const summary = summarizeForTTS(content)
              if (summary.length > 0) {
                window.dispatchEvent(new CustomEvent('ai-tts-summary', { detail: summary }))
              }
            } catch (e) {
              console.error('[useChat] TTS error:', e)
            }
          }
        }
      } catch {
        const errorMsg = createAssistantMessage(
          'Failed to get AI response. Please try again.',
        )
        setMessages((prev) => [...prev, errorMsg].slice(-MAX_MESSAGES))
      } finally {
        setIsStreaming(false)
        activeStreamIdRef.current = null
      }
    },
    [attachedFiles, messages, chatMode],
  )

  // Keep ref in sync so PTY capture callback can call sendMessage
  pendingSendRef.current = sendMessage

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
      avatarHeight,
      messages,
      inputValue,
      isStreaming,
      attachedFiles,
      activeModelLabel,
      activeModelId,
      activePresetLabel,
      chatMode,
    }),
    [
      isOpen,
      width,
      avatarHeight,
      messages,
      inputValue,
      isStreaming,
      attachedFiles,
      activeModelLabel,
      activeModelId,
      activePresetLabel,
      chatMode,
    ],
  )

  // -------------------------------------------------------------------------
  // File operation approval
  // -------------------------------------------------------------------------

  const approveFileOps = useCallback(async () => {
    const ops = pendingFileOps
    setPendingFileOps([])
    const results: string[] = []
    for (const op of ops) {
      const result = await applyOperation(op)
      results.push(result.success
        ? `✅ ${op.type} ${op.filePath}`
        : `❌ ${op.type} ${op.filePath}: ${result.error}`)
    }
    const summaryMsg = createAssistantMessage(results.join('\n'))
    setMessages((prev) => [...prev, summaryMsg].slice(-MAX_MESSAGES))
  }, [pendingFileOps])

  const rejectFileOps = useCallback(() => {
    setPendingFileOps([])
    const msg = createAssistantMessage('File operations dismissed.')
    setMessages((prev) => [...prev, msg].slice(-MAX_MESSAGES))
  }, [])

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

  // Update system prompt when chat opens
  useEffect(() => {
    if (isOpen) {
      const api = window.electronAPI
      if (api?.updateInternSystemPrompt) {
        const agentState = getAgentLoopState()
        const activeIntern = agentState?.activeIntern || DEFAULT_INTERN_ID
        api.updateInternSystemPrompt(activeIntern).catch((err) => {
          console.error('[useChat] Failed to update system prompt:', err)
        })
      }
    }
  }, [isOpen])

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
    setAvatarHeight,
    sendMessage,
    clearMessages,
    addAttachment,
    removeAttachment,
    setInputValue,
    extractMentions,
    injectFromTerminal,
    pendingFileOps,
    approveFileOps,
    rejectFileOps,
    cycleChatMode,
    stopAgentLoop: useCallback(() => {
      agentLoopActiveRef.current = false
      agentLoopIterationsRef.current = 0
      // Cancel the active streaming request if any
      if (activeStreamIdRef.current) {
        window.electronAPI?.cancelAIStream?.(activeStreamIdRef.current)
        activeStreamIdRef.current = null
      }
    }, []),
    isAgentLooping: isStreaming && agentLoopActiveRef.current,
    revertToSnapshot: useCallback((snapshotId: string) => {
      const restored = sessionHistory.revert(snapshotId)
      if (restored) {
        setMessages(restored)
      }
    }, [sessionHistory]),
    canRevert: sessionHistory.canRevert,
    sessionSnapshots: sessionHistory.snapshots.map(s => ({ id: s.id, label: s.label, timestamp: s.timestamp })),
  }
}

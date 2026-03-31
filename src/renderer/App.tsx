/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/App.tsx
 * Module: renderer
 * Purpose: Main app component - orchestrates terminal, chat, file tree, and all UI panels
 * Dependencies: react, @/ai/types, @/types/*, @/renderer/hooks/*, @/renderer/components/*, @/shell/shell-service
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/main.tsx, /Users/ghost/Desktop/aiterminal/src/renderer/hooks/useChat.ts
 * Keywords: main-app, terminal, chat, file-tree, nl-routing, tui-mode, keyboard-shortcuts
 * Last Updated: 2026-03-24
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import type { FC } from 'react'
import type { AIResponse } from '@/ai/types'
import type { FilePickerResult } from '@/types/file-context'
import type { ChatMessage } from '@/types/chat'
import { sanitizeInput, detectPromptInjection } from '@/renderer/utils/sanitizeInput'
import { useVoiceIO } from '@/renderer/hooks/useVoiceIO'

import { DEFAULT_INTERN_ID } from '@/intern-config'
// Hooks
import { useTheme } from '@/renderer/hooks/useTheme'
import { useCmdK } from '@/renderer/hooks/useCmdK'
import { useChat } from '@/renderer/hooks/useChat'
import { useAutocomplete } from '@/renderer/hooks/useAutocomplete'
import { useFilePreview } from '@/renderer/hooks/useFilePreview'
import { useFilePicker } from '@/renderer/hooks/useFilePicker'
import { useDiffView } from '@/renderer/hooks/useDiffView'
import { useFileTree } from '@/renderer/hooks/useFileTree'
import { useTerminalTabs } from '@/renderer/hooks/useTerminalTabs'
import { useTerminalLocation } from '@/renderer/hooks/useTerminalLocation'
import { useResizablePanels } from '@/renderer/hooks/useResizablePanels'
import { useBackendSelector } from '@/renderer/hooks/useBackendSelector'

// Components
import { TerminalView } from '@/renderer/components/TerminalView'
import type { TerminalViewRef } from '@/renderer/components/TerminalView'
import { FileTabView } from '@/renderer/components/FileTabView'
import { CmdKBar } from '@/renderer/components/CmdKBar'
import { PresetSwitcher } from '@/renderer/components/PresetSwitcher'
import { ThemeSelector } from '@/renderer/components/ThemeSelector'
import { ClaudeCodeChat } from '@/renderer/components/ClaudeCodeChat'
import { AutocompleteDropdown } from '@/renderer/components/AutocompleteDropdown'
import { FilePreview } from '@/renderer/components/FilePreview'
import { FilePicker } from '@/renderer/components/FilePicker'
import { InternAvatar } from '@/renderer/components/InternAvatar'
import { SplitSidebar } from '@/renderer/components/SplitSidebar'
import { GatewayVoiceStrip } from '@/renderer/components/GatewayVoiceStrip'
import { ResizeHandle } from '@/renderer/components/ResizeHandle'
import { SpeechBubbles, useSpeechBubbles } from '@/renderer/components/SpeechBubbles'
import { VirtualAssistantChat } from '@/renderer/components/VirtualAssistantChat'
import { useAgentLoop } from '@/renderer/hooks/useAgentLoop'
import { useClaudeCodeComments } from '@/renderer/hooks/useClaudeCodeComments'
import { useElevenLabsAgent } from '@/renderer/hooks/useElevenLabsAgent'
import { useSoraCompanion } from '@/renderer/hooks/useSoraCompanion'
import { preloadVRMModels } from '@/renderer/vrm-preloader'
import { AVAILABLE_VRM_MODELS } from '@/renderer/vrm-models'

// Shell helpers
import {
  isTuiCliInvocation,
  shouldAutoEnableTuiFromPtyOutput,
} from '@/shell/shell-service'

// Icons + accent
import { IconSidebarLeft, IconChat, IconPalette, IconPanel } from '@/renderer/components/icons/VSCodeIcons'
import { BottomPanel } from '@/renderer/components/BottomPanel'
import { useBottomPanel } from '@/renderer/hooks/useBottomPanel'
import {
  ACCENT_PRESETS,
  getStoredAccentId,
  storeAccentId,
  getAccentPreset,
  applyAccentPreset,
} from '@/renderer/utils/accent-presets'

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

// Note: Auto-run helpers (mapIpcResponse, parseAutoRun) removed - currently unused
// They can be restored when AI auto-run functionality is re-implemented

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export const App: FC = () => {
  // -------------------------------------------------------------------------
  // Hooks
  // -------------------------------------------------------------------------

  const { activeTheme } = useTheme()

  // Accent color preset — switchable UI accent independent of terminal theme
  const [accentId, setAccentId] = useState(getStoredAccentId)
  useEffect(() => {
    applyAccentPreset(getAccentPreset(accentId))
  }, [accentId])
  const cycleAccent = useCallback(() => {
    setAccentId(prev => {
      const idx = ACCENT_PRESETS.findIndex(p => p.id === prev)
      const next = ACCENT_PRESETS[(idx + 1) % ACCENT_PRESETS.length]
      storeAccentId(next.id)
      return next.id
    })
  }, [])

  const cmdK = useCmdK()
  const chat = useChat()
  const autocomplete = useAutocomplete()
  const filePreview = useFilePreview()
  const diffView = useDiffView()
  const agentLoop = useAgentLoop({ enabled: false })  // Start disabled
  const terminalTabs = useTerminalTabs()
  const terminalLocation = useTerminalLocation()
  const bottomPanel = useBottomPanel()
  const backendSelector = useBackendSelector()
  const resizablePanels = useResizablePanels({
    storageKey: 'aiterminal-layout',
    defaultSizes: {
      leftSidebar: 280,
      terminalArea: 400,
      rightSidebar: 400,
    },
    minSizes: {
      leftSidebar: 200,
      terminalArea: 200,
      rightSidebar: 300,
    },
    maxSizes: {
      leftSidebar: 600,
      terminalArea: 800,
      rightSidebar: 800,
    },
  })

  // Voice I/O for TTS (Amica-style voice chat)
  const voice = useVoiceIO(undefined, agentLoop.activeIntern || DEFAULT_INTERN_ID)

  // Speech bubbles for VRM avatar
  const speechBubbles = useSpeechBubbles()

  // Claude Code comments - contextual voice feedback during Claude Code sessions

  // Listen for AI response events to auto-speak (use ref to avoid re-registering on every render)
  const voiceSpeakRef = useRef(voice.speak)
  voiceSpeakRef.current = voice.speak

  useEffect(() => {
    let lastTTSTime = 0
    const TTS_COOLDOWN_MS = 15_000

    const handleTTSSummary = (event: any) => {
      const summary = event.detail as string
      if (!summary) return

      const now = Date.now()
      if (now - lastTTSTime < TTS_COOLDOWN_MS) return
      lastTTSTime = now

      // Speak the summary via TTS
      if (ttsEnabledRef.current) {
        voiceSpeakRef.current(summary).catch(() => {})
      }
      // Show as VRM speech bubble
      speechBubbles.addBubble(summary)
    }
    window.addEventListener('ai-tts-summary', handleTTSSummary)
    return () => window.removeEventListener('ai-tts-summary', handleTTSSummary)
  }, [])

  // Auto-open chat when Claude Code is detected
  useEffect(() => {
    if (backendSelector.activeBackend === 'claude-code' && !chat.state.isOpen) {
      console.log('[App] Claude Code detected, opening chat')
      chat.open()
    }
  }, [backendSelector.activeBackend, chat.state.isOpen])

  // NL routing toast

  // Terminal visibility when in Claude Code mode
  const [terminalVisibleInClaudeCode, setTerminalVisibleInClaudeCode] = useState(false)

  // 3D model chat visibility - hidden by default to show avatar more clearly
  const [showVrmChat, setShowVrmChat] = useState(false)

  // RP Mode: fullscreen VRM with ElevenLabs conversational agent
  const [rpMode, setRpMode] = useState(false)
  const [voiceActive, setVoiceActive] = useState(false)
  const elevenAgent = useElevenLabsAgent()

  // TTS toggle: mute/unmute text-to-speech
  const [ttsEnabled, setTtsEnabled] = useState(true)

  // TUI Mode: disable natural language interception for CLI tools
  const [tuiMode, setTuiMode] = useState(false)
  /** Same as `tuiMode` but updated synchronously — NL routing must not wait for re-render. */
  const tuiModeRef = useRef(false)

  useEffect(() => {
    tuiModeRef.current = tuiMode
  }, [tuiMode])

  // Reset TUI mode when Claude Code exits
  useEffect(() => {
    if (backendSelector.activeBackend === 'openrouter' && tuiMode) {
      tuiModeRef.current = false
      setTuiMode(false)
    }
  }, [backendSelector.activeBackend, tuiMode])

  // Sora companion — terminal-aware conversational AI
  const soraCompanion = useSoraCompanion({
    getActiveSessionId: () => terminalTabs.getActiveSessionId(),
    onSpeak: (text) => { voice.speak(text).catch(() => {}) },
    onBubble: (text) => { speechBubbles.addBubble(text) },
  })

  // Active terminal session cwd (file tree + picker); derived from active tab
  const activeTabCwd = useMemo(() => {
    const activeTab = terminalTabs.state.tabs.find(t => t.isActive)
    return (activeTab && activeTab.type === 'terminal' ? activeTab.cwd : '') || ''
  }, [terminalTabs.state.tabs])

  // TTS gating ref (used in event listener closures)
  const ttsEnabledRef = useRef(ttsEnabled)
  ttsEnabledRef.current = ttsEnabled

  // Expose active intern + CWD globally for chat to access
  useEffect(() => {
    (window as any).agentLoopState = {
      activeIntern: agentLoop.activeIntern || DEFAULT_INTERN_ID,
      enabled: agentLoop.enabled,
      cwd: activeTabCwd,
      activeSessionId: terminalTabs.getActiveSessionId(),
    }
  }, [agentLoop.activeIntern, agentLoop.enabled, activeTabCwd, terminalTabs.state.activeTabId])

  // Refresh cwd when switching tabs (probes real shell cwd from PTY pid)
  useEffect(() => {
    const activeTabId = terminalTabs.state.activeTabId
    if (!activeTabId) return

    const sessionId = terminalTabs.getActiveSessionId()
    if (!sessionId) return

    const hasElectronAPI =
      typeof window !== 'undefined' &&
      'electronAPI' in window &&
      window.electronAPI?.getSessionCwd

    if (!hasElectronAPI) return

    let cancelled = false
    window.electronAPI.getSessionCwd(sessionId).then((result) => {
      if (cancelled) return
      if (result.success && result.cwd) {
        // Update session cwd in main process (will trigger session-cwd-changed event)
        window.electronAPI.updateSessionCwd?.(sessionId, result.cwd)
      }
    }).catch(() => {
      /* keep previous cwd */
    })
    return () => {
      cancelled = true
    }
  }, [terminalTabs.state.activeTabId, terminalTabs])

  // Claude Code comments - contextual voice feedback during Claude Code sessions
  const claudeCodeComments = useClaudeCodeComments({
    minCommentInterval: 180000, // 3 minutes between comments
    cwd: activeTabCwd,
    onComment: (comment) => {
      // Speak the comment via TTS (if enabled)
      if (ttsEnabledRef.current) {
        voice.speak(comment).catch((err) => {
          console.error('[App] Failed to speak Claude Code comment:', err)
        })
      }
      // Also add as speech bubble
      speechBubbles.addBubble(comment)
    },
  })

  // Activate/deactivate Claude Code comments based on backend
  // eslint-disable-next-line react-hooks/exhaustive-deps — claudeCodeComments is a new object each render
  useEffect(() => {
    if (backendSelector.activeBackend === 'claude-code') {
      claudeCodeComments.activate()
    } else {
      claudeCodeComments.deactivate()
    }
  }, [backendSelector.activeBackend])

  // Feed live Claude Code PTY stream into the comment analyzer
  useEffect(() => {
    if (backendSelector.activeBackend === 'claude-code' && backendSelector.claudeCodeStream) {
      claudeCodeComments.feedStream(backendSelector.claudeCodeStream)
    }
  }, [backendSelector.claudeCodeStream, backendSelector.activeBackend, claudeCodeComments])

  // Update AI system prompt with project context when CWD changes
  useEffect(() => {
    if (chat.state.isOpen && activeTabCwd) {
      const api = window.electronAPI
      if (api?.updateInternSystemPrompt) {
        const agentState = (window as any).agentLoopState
        const activeIntern = agentState?.activeIntern || 'sora'
        api.updateInternSystemPrompt({ intern: activeIntern, cwd: activeTabCwd }).catch(() => {})
      }
    }
  }, [activeTabCwd, chat.state.isOpen])

  const fileTree = useFileTree(activeTabCwd)
  const filePicker = useFilePicker(activeTabCwd)

  // -------------------------------------------------------------------------
  // AI response state (existing)
  // -------------------------------------------------------------------------

  const [aiResponse] = useState<AIResponse | null>(null)
  const [isLoading] = useState(false) // Loading state for future AI responses
  const lastCommandRef = useRef<string>('')

  // Toggle TUI mode (disable NL interception)
  const toggleTuiMode = useCallback(() => {
    setTuiMode((prev) => {
      const next = !prev
      tuiModeRef.current = next
      return next
    })
  }, [])

  // Terminal refs for copy functionality
  // Use plain refs (not hooks) - stored as mutable objects
  const terminalRefs = useRef<Record<string, { current: TerminalViewRef | null }>>({})

  // Initialize refs for all terminal tabs
  useEffect(() => {
    // Create refs for any tabs that don't have one yet
    terminalTabs.state.tabs.forEach((tab) => {
      if (!terminalRefs.current[tab.id]) {
        terminalRefs.current[tab.id] = { current: null }
      }
    })
  }, [terminalTabs.state.tabs])

  // Copy console output helper
  const handleCopyConsole = useCallback(() => {
    // Get active terminal ID
    const activeTabId = terminalTabs.state.activeTabId
    if (!activeTabId) return

    // Get terminal ref for active tab
    const terminalRef = terminalRefs.current[activeTabId]
    if (!terminalRef || !terminalRef.current || !terminalRef.current.terminal) {
      // Fallback to toast if terminal not ready
      const toast = document.createElement('div')
      toast.textContent = '💡 Terminal not ready - try again in a moment'
      toast.style.cssText = `
        position: fixed;
        bottom: 40px;
        right: 20px;
        background: rgba(30, 32, 44, 0.95);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        padding: 12px 16px;
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 13px;
        z-index: 10000;
        animation: fadeInOut 4s ease forwards;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      `
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 4000)
      return
    }

    // Select all text in terminal
    terminalRef.current.selectAll()

    // Copy to clipboard using xterm's selection API
    const terminal = terminalRef.current.terminal

    // Get terminal text content using xterm API
    let text = ''
    for (let line = 0; line < terminal.rows; line++) {
      const lineText = terminal.buffer.active.getLine(line)?.translateToString(true)
      if (lineText) {
        text += lineText + '\n'
      }
    }

    // Copy to clipboard
    navigator.clipboard.writeText(text).then(() => {
      // Show success toast
      const toast = document.createElement('div')
      toast.textContent = '✅ Copied all terminal output'
      toast.style.cssText = `
        position: fixed;
        bottom: 40px;
        right: 20px;
        background: rgba(40, 167, 69, 0.95);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        padding: 12px 16px;
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 13px;
        z-index: 10000;
        animation: fadeInOut 2s ease forwards;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      `
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 2000)
    }).catch(() => {
      // Fallback to instructions if copy fails
      const toast = document.createElement('div')
      toast.textContent = '💡 Select text in terminal, then press Cmd+C to copy'
      toast.style.cssText = `
        position: fixed;
        bottom: 40px;
        right: 20px;
        background: rgba(30, 32, 44, 0.95);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        padding: 12px 16px;
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 13px;
        z-index: 10000;
        animation: fadeInOut 4s ease forwards;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      `
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 4000)
    })
  }, [terminalTabs.state.activeTabId])

  const handleCommand = useCallback((input: string): boolean => {
    const trimmed = input.trim()
    if (trimmed.length === 0) return false

    // SECURITY: Sanitize input to prevent prompt injection and control char abuse
    const { sanitized, error: sanitizeError } = sanitizeInput(trimmed, {
      maxLength: 10_000,
      stripAnsiCodes: true,
    })

    if (sanitizeError) {
      console.warn('[App] Input sanitization warning:', sanitizeError)
    }

    // Check for potential prompt injection attacks
    if (detectPromptInjection(sanitized)) {
      console.warn('[App] Potential prompt injection detected, blocking')
      // Still send to PTY (it's a shell command), don't route to AI
      lastCommandRef.current = sanitized
      return false
    }

    // Claude Code / similar TUIs — set ref synchronously so the *next* Enter in the same
    // turn can't hit NL routing before React re-renders (TUI badge on but chat still steals).
    if (isTuiCliInvocation(sanitized)) {
      tuiModeRef.current = true
      setTuiMode(true)
      // Pre-activate greeting so it fires as soon as Claude Code starts
      // (don't wait for the PTY escape sequence detection)
      claudeCodeComments.activate()
    }

    // All input goes directly to PTY — save for error/cd detection
    lastCommandRef.current = sanitized
    return false
  }, [])

  // Monitor PTY output for cd commands to update file tree
  const handlePtyOutput = useCallback((data: string) => {
    if (!tuiModeRef.current && shouldAutoEnableTuiFromPtyOutput(data)) {
      tuiModeRef.current = true
      setTuiMode(true)
    }

    // Skip error routing and cd detection when TUI mode is active —
    // a TUI app (Claude Code, vim, etc.) handles its own errors and cwd
    if (tuiModeRef.current) return

    const cmd = lastCommandRef.current
    if (cmd) {
      // Detect successful cd — refresh cwd from PTY (not Electron process.cwd)
      const trimmedCmd = cmd.trim()
      const isCd = trimmedCmd === 'cd' || trimmedCmd.startsWith('cd ')
      if (isCd) {
        lastCommandRef.current = ''

        const sessionId = terminalTabs.getActiveSessionId()
        if (!sessionId) return

        const hasElectronAPI =
          typeof window !== 'undefined' &&
          'electronAPI' in window &&
          window.electronAPI?.getSessionCwd

        if (hasElectronAPI) {
          setTimeout(() => {
            window.electronAPI.getSessionCwd(sessionId).then((result) => {
              if (result.success && result.cwd) {
                // Update session manager and trigger tab update
                window.electronAPI.updateSessionCwd(sessionId, result.cwd);
              }
            }).catch(() => {
              /* ignore */
            })
          }, 100)
        }
      }
    }
  }, [terminalTabs])

  // -------------------------------------------------------------------------
  // Keyboard shortcuts
  // -------------------------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey

      // Cmd+K — toggle Cmd+K bar
      if (isMeta && e.key === 'k') {
        e.preventDefault()
        cmdK.toggle()
        return
      }

      // Cmd+B — toggle Chat (opens CLAUDE tab in bottom panel)
      if (isMeta && e.key === 'b') {
        e.preventDefault()
        bottomPanel.toggleTab('claude')
        return
      }

      // Cmd+Shift+F — toggle File tree
      if (isMeta && e.shiftKey && e.key === 'f') {
        e.preventDefault()
        fileTree.toggleVisible()
        return
      }

      // Cmd+J — Toggle bottom panel (VS Code standard)
      if (isMeta && e.key === 'j') {
        e.preventDefault()
        bottomPanel.toggleTab('terminal')
        return
      }

      // Cmd+Opt+T — Toggle terminal location (legacy)
      if (isMeta && e.altKey && e.key === 't') {
        e.preventDefault()
        bottomPanel.toggleTab('terminal')
        return
      }

      // Cmd+Shift+T — Toggle TUI mode (disable NL interception)
      if (isMeta && e.shiftKey && e.key === 't') {
        e.preventDefault()
        toggleTuiMode()
        return
      }

      // Cmd+P — toggle File picker
      if (isMeta && e.key === 'p') {
        e.preventDefault()
        if (filePicker.state.isOpen) {
          filePicker.dismiss()
        } else {
          filePicker.open('')
        }
        return
      }

      // Escape — close active overlay (priority: CmdK > FilePicker > FilePreview > DiffView)
      if (e.key === 'Escape') {
        if (cmdK.state.isOpen) {
          cmdK.close()
          return
        }
        if (filePicker.state.isOpen) {
          filePicker.dismiss()
          return
        }
        if (filePreview.state.isOpen) {
          filePreview.close()
          return
        }
        if (diffView.state.isOpen) {
          diffView.close()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    cmdK.toggle, cmdK.close, cmdK.state.isOpen,
    chat.toggle,
    fileTree.toggleVisible,
    filePicker.state.isOpen, filePicker.open, filePicker.dismiss,
    filePreview.state.isOpen, filePreview.close,
    diffView.state.isOpen, diffView.close,
    terminalLocation.toggle,
    toggleTuiMode,
  ])

  // -------------------------------------------------------------------------
  // File tree -> file preview connection
  // -------------------------------------------------------------------------

  const handleFileTreeSelect = useCallback(async (path: string) => {
    // Open file as a tab in the terminal area
    try {
      const result = await window.electronAPI.readFile(path)
      if (result.content != null) {
        const ext = path.split('.').pop() || ''
        const langMap: Record<string, string> = {
          ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
          rs: 'rust', py: 'python', go: 'go', rb: 'ruby',
          css: 'css', html: 'html', json: 'json', toml: 'toml',
          yaml: 'yaml', yml: 'yaml', md: 'markdown', sh: 'shell',
          sql: 'sql', c: 'c', cpp: 'cpp', h: 'c', java: 'java',
        }
        terminalTabs.openFileTab(path, result.content, langMap[ext] || null)
      }
    } catch {
      // Fallback to preview if read fails
      filePreview.openFile(path)
    }
  }, [terminalTabs.openFileTab, filePreview.openFile])

  const handleFileTreeSelectDirectory = useCallback((path: string) => {
    // Send cd command to active terminal
    const cdCommand = `cd "${path}"\r`
    terminalTabs.writeToActive(cdCommand)
  }, [terminalTabs.writeToActive])

  const handleFileTreeGoToParent = useCallback(() => {
    terminalTabs.writeToActive('cd ..\r')
    const sessionId = terminalTabs.getActiveSessionId()
    if (!sessionId) return
    const hasElectronAPI =
      typeof window !== 'undefined' &&
      'electronAPI' in window &&
      window.electronAPI?.getSessionCwd
    if (!hasElectronAPI) return
    setTimeout(() => {
      window.electronAPI.getSessionCwd(sessionId).then((result) => {
        if (result.success && result.cwd) {
          // Update session cwd in main process (will trigger session-cwd-changed event)
          window.electronAPI.updateSessionCwd?.(sessionId, result.cwd)
        }
      }).catch(() => {
        /* ignore */
      })
    }, 120)
  }, [terminalTabs])

  // -------------------------------------------------------------------------
  // Auto-detect cd commands and update cwd for tabs and 3D model
  // -------------------------------------------------------------------------
  useEffect(() => {
    const hasElectronAPI =
      typeof window !== 'undefined' &&
      'electronAPI' in window &&
      window.electronAPI?.onAnySessionData

    if (!hasElectronAPI) return

    // Track last command per session to avoid duplicate probes
    const lastCommandRef = new Map<string, string>()
    const probeTimeoutRef = new Map<string, ReturnType<typeof setTimeout>>()

    const unsubscribe = window.electronAPI.onAnySessionData?.((sessionId, data) => {
      // Detect cd commands in terminal output
      // Look for command patterns like "cd path", "cd ~/path", "cd ..", "cd /path"
      // Strip ANSI escape codes first so prompt formatting doesn't interfere
      const clean = data
        .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
        .replace(/\x1b\][^\x07]*\x07/g, '')
        .replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, '')
        .replace(/\r/g, '')
      const lines = clean.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()

        // Skip empty lines and non-command lines
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('echo')) {
          continue
        }

        // Match cd command anywhere in the line (after prompt chars like $, %, >, #)
        // Handles: "$ cd src", "user@host:~$ cd path", "PS C:\> cd path", "cd path"
        const cdMatch = trimmed.match(/(?:^|[$%>#]\s*)(cd\s+)([^\s;&|]+)/)

        if (cdMatch) {
          const cdCommand = trimmed

          // Avoid probing the same command multiple times
          if (lastCommandRef.get(sessionId) === cdCommand) {
            continue
          }
          lastCommandRef.set(sessionId, cdCommand)

          // Clear any pending probe for this session
          const existingTimeout = probeTimeoutRef.get(sessionId)
          if (existingTimeout) {
            clearTimeout(existingTimeout)
          }

          // Debounce slightly to let the cd complete before probing
          const timeoutId = setTimeout(() => {
            console.log(`[App] Detected cd command in session ${sessionId}, probing new cwd`)

            // Probe the new cwd from PTY pid
            window.electronAPI.getSessionCwd?.(sessionId).then((result) => {
              if (result.success && result.cwd) {
                console.log(`[App] Updated cwd for session ${sessionId}: ${result.cwd}`)

                // Update the session's cwd in main process
                // This will trigger session-cwd-changed event which updates tabs
                // and activeTabCwd is derived from tabs, so it will update automatically
                window.electronAPI.updateSessionCwd?.(sessionId, result.cwd)
              }
            }).catch(() => {
              /* ignore probe failures */
            })
          }, 150) // 150ms debounce to let cd complete

          probeTimeoutRef.set(sessionId, timeoutId)
          break // Only process first cd match per data chunk
        }
      }
    })

    return () => {
      unsubscribe?.()
      // Clear all pending timeouts
      for (const timeoutId of probeTimeoutRef.values()) {
        clearTimeout(timeoutId)
      }
    }
  }, [terminalTabs])

  // -------------------------------------------------------------------------
  // Chat @mention -> file picker connection
  // -------------------------------------------------------------------------

  const handleFilePickerSelect = useCallback(async (result: FilePickerResult) => {
    // Insert the file reference into chat input
    const currentInput = chat.state.inputValue
    // Replace trailing @ with @filename
    const updatedInput = currentInput.endsWith('@')
      ? currentInput.slice(0, -1) + `@${result.name} `
      : currentInput + `@${result.name} `

    chat.setInputValue(updatedInput)

    // Load file content for AI context
    try {
      const file = await window.electronAPI.readFile(result.path)
      chat.addAttachment({
        name: result.name,
        path: result.path,
        content: file.content,
      })
    } catch {
      // Still attach without content if read fails
      chat.addAttachment({
        name: result.name,
        path: result.path,
        content: undefined,
      })
    }

    filePicker.dismiss()
  }, [chat.state.inputValue, chat.setInputValue, chat.addAttachment, filePicker.dismiss])

  // -------------------------------------------------------------------------
  // Chat send handler
  // -------------------------------------------------------------------------


  // -------------------------------------------------------------------------
  // Chat resize handler
  // -------------------------------------------------------------------------

  // Note: Resize handlers removed for simplified ClaudeCodeChat component
  // Can be re-added later if resizable chat panel is needed

  // -------------------------------------------------------------------------
  // Autocomplete position (bottom-left of terminal area)
  // -------------------------------------------------------------------------

  const [autocompletePos] = useState({ x: 80, y: 40 })

  const handleAutocompleteAccept = useCallback((text: string) => {
    const hasElectronAPI = typeof window !== 'undefined' && 'electronAPI' in window
    if (hasElectronAPI) {
      window.electronAPI.writeToPty(text)
    }
    autocomplete.dismiss()
  }, [autocomplete.dismiss])

  // -------------------------------------------------------------------------
  // VRM Preloading — background load on app mount for instant avatar display
  // -------------------------------------------------------------------------

  useEffect(() => {
    // Skip VRM preload entirely if there are issues
    // This prevents crashes from VRM loading errors
    const preloadTimeout = setTimeout(() => {
      try {
        if (typeof document === 'undefined' || !document.body) {
          console.warn('[App] Document not ready, skipping VRM preload')
          return
        }

        // Only preload if we have models available
        const modelEntries = Object.entries(AVAILABLE_VRM_MODELS)
        if (modelEntries.length === 0) {
          console.log('[App] No VRM models configured, skipping preload')
          return
        }

        const models = modelEntries.map(([id, config]) => ({ id, url: config.url }))
        console.log('[App] Starting VRM preload for', models.length, 'models')

        preloadVRMModels(models, (progress) => {
          console.log(`[App] VRM preload ${progress.modelId}: ${progress.status} (${progress.progress}%)`)
        }).then(() => {
          console.log('[App] VRM preload complete')
        }).catch(err => {
          // Don't crash on VRM load failure - just log it
          console.warn('[App] VRM preload failed (non-critical):', err)
        })
      } catch (error) {
        console.warn('[App] VRM preload error (non-critical):', error)
      }
    }, 2000)

    return () => clearTimeout(preloadTimeout)
  }, [])

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const isAIActive = aiResponse !== null || isLoading

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="app-layout">
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/*  Titlebar                                                         */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="titlebar">
        <span className="titlebar__title">AITerminal</span>
        <GatewayVoiceStrip />

        {/* VS Code-style toggles (top-right) */}
        <div className="titlebar__toggles">
          <button
            type="button"
            className={`titlebar__toggle ${fileTree.isVisible ? 'titlebar__toggle--active' : ''}`}
            onClick={fileTree.toggleVisible}
            title={fileTree.isVisible ? "Hide Sidebar (Cmd+Shift+F)" : "Show Sidebar (Cmd+Shift+F)"}
            aria-label="Toggle sidebar"
          >
            <IconSidebarLeft size={16} />
          </button>
          <button
            type="button"
            className={`titlebar__toggle ${chat.state.isOpen ? 'titlebar__toggle--active' : ''}`}
            onClick={chat.toggle}
            title={chat.state.isOpen ? "Hide Chat (Cmd+B)" : "Show Chat (Cmd+B)"}
            aria-label="Toggle chat"
          >
            <IconChat size={16} />
          </button>
          <button
            type="button"
            className={`titlebar__toggle ${bottomPanel.state.isOpen ? 'titlebar__toggle--active' : ''}`}
            onClick={() => bottomPanel.toggleTab('terminal')}
            title="Toggle bottom panel (Cmd+J)"
            aria-label="Toggle bottom panel"
          >
            <IconPanel size={16} />
          </button>
          <button
            type="button"
            className="titlebar__toggle"
            onClick={cycleAccent}
            title={`Accent: ${getAccentPreset(accentId).name} (click to cycle)`}
            aria-label="Cycle accent color"
            style={{ color: getAccentPreset(accentId).color }}
          >
            <IconPalette size={16} />
          </button>
          <ThemeSelector />
        </div>
      </div>

      {/* Theme selector removed from here, now in titlebar */}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/*  Main content: file tree | terminal area | chat sidebar           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className={`app-main app-main--terminal-${terminalLocation.state.location}`}>
        {/* ── Split Sidebar (left panel: file tree + terminal tabs) ── */}
        {fileTree.isVisible && (
          <>
            <div className="split-sidebar-wrapper" style={{ width: resizablePanels.sizes.leftSidebar }}>
              <SplitSidebar
                tabs={terminalTabs.state.tabs}
                activeTabId={terminalTabs.state.activeTabId}
                onTabClick={terminalTabs.switchTab}
                onTabClose={terminalTabs.closeTab}
                onNewTab={() => terminalTabs.createTab()}
                fileTreeCwd={activeTabCwd}
                fileTreeEntries={fileTree.entries}
                fileTreeVisible={fileTree.isVisible}
                onFileTreeToggle={fileTree.toggleVisible}
                onFileTreeSelectFile={handleFileTreeSelect}
                onFileTreeSelectDirectory={handleFileTreeSelectDirectory}
                onFileTreeGoToParent={handleFileTreeGoToParent}
              />
            </div>
            <ResizeHandle
              direction="horizontal"
              onDrag={(delta) => resizablePanels.updateSize('leftSidebar', delta)}
            />
          </>
        )}

        {/* ── Terminal area (center: terminals + chat panels stacked) ── */}
        <div className="terminal-area" style={{ flex: 1 }}>
          {/* Terminal panel (top) - hide when Claude Code TUI is active unless explicitly shown */}
          {(backendSelector.activeBackend !== 'claude-code' || terminalVisibleInClaudeCode) && (
            <div className="terminal-panel" style={{
              // When chat is closed, terminal fills remaining space via flex: 1
              // When chat is open, terminal uses fixed resizable height
              ...((!chat.state.isOpen && backendSelector.activeBackend !== 'claude-code')
                ? { flex: 1 }
                : {
                    height: backendSelector.activeBackend === 'claude-code' && terminalVisibleInClaudeCode
                      ? resizablePanels.sizes.terminalArea * 0.5
                      : backendSelector.activeBackend === 'claude-code' ? 0 : resizablePanels.sizes.terminalArea,
                    minHeight: backendSelector.activeBackend === 'claude-code' ? 0 : undefined,
                  }),
            }}>
              <div className="terminal-stack">
                {terminalTabs.state.tabs.map((tab) => {
                  return (
                    <div
                      key={tab.id}
                      className={
                        tab.isActive
                          ? 'terminal-stack__layer'
                          : 'terminal-stack__layer terminal-stack__layer--inactive'
                      }
                    >
                      {tab.type === 'file' ? (
                        <FileTabView
                          filePath={tab.filePath}
                          content={tab.content}
                          language={tab.language}
                          isActive={tab.isActive}
                          onSave={async (path, newContent) => {
                            try {
                              await window.electronAPI.writeFile(path, newContent)
                            } catch (err) {
                              console.error('[App] Failed to save file:', err)
                            }
                          }}
                        />
                      ) : (
                        <TerminalView
                          ref={terminalRefs.current[tab.id]}
                          onCommand={handleCommand}
                          onPtyOutput={handlePtyOutput}
                          theme={activeTheme}
                          sessionId={tab.sessionId}
                          isActive={tab.isActive}
                          tuiMode={tuiMode}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Resize handle between terminal and chat - show whenever both terminal and chat are visible */}
          {(backendSelector.activeBackend !== 'claude-code' || terminalVisibleInClaudeCode) && (chat.state.isOpen || backendSelector.activeBackend === 'claude-code') && (
            <ResizeHandle
              direction="vertical"
              onDrag={(delta) => resizablePanels.updateSize('terminalArea', delta)}
              className="chat-resize-handle"
            />
          )}

          {/* Chat panel - full screen when Claude Code TUI is active, otherwise bottom panel */}
          {(chat.state.isOpen || backendSelector.activeBackend === 'claude-code') && (
            <div
              className="chat-panel"
              style={{
                flex: 1,
                minHeight: 200,
                overflow: 'hidden'
              }}
            >
              <ClaudeCodeChat
                messages={chat.state.messages.map(m => ({
                  role: m.role as 'user' | 'assistant',
                  content: m.content
                }))}
                pendingFileOps={chat.pendingFileOps}
                onApproveFileOps={chat.approveFileOps}
                onRejectFileOps={chat.rejectFileOps}
                chatMode={chat.state.chatMode}
                onCycleChatMode={chat.cycleChatMode}
                onStopAgentLoop={chat.stopAgentLoop}
                isAgentLooping={chat.isAgentLooping}
                isStreaming={chat.state.isStreaming}
                onCopyMessage={(content) => navigator.clipboard.writeText(content)}
                onSendMessage={async (text) => {
                  await chat.sendMessage(text)
                }}
                backend={backendSelector.activeBackend}
                claudeCodeStream={backendSelector.claudeCodeStream}
                activeIntern={agentLoop.activeIntern || DEFAULT_INTERN_ID}
                modelLabel={chat.state.activeModelLabel}
                presetLabel={chat.state.activePresetLabel}
                writeToClaudeCode={backendSelector.writeToClaudeCode}
                clearClaudeCodeStream={backendSelector.clearClaudeCodeStream}
                onToggleTerminal={() => setTerminalVisibleInClaudeCode(prev => !prev)}
                terminalVisible={terminalVisibleInClaudeCode}
                isWaitingForPermissions={backendSelector.isWaitingForPermissions}
                placeholder={backendSelector.activeBackend === 'claude-code' ? 'Type a command to Claude Code...' : 'Type a message or use @ for file context...'}
                onClose={() => {
                  chat.close()
                  // Also kill Claude Code process when closing chat in Claude Code mode
                  if (backendSelector.activeBackend === 'claude-code') {
                    backendSelector.killClaudeCode()
                    setTerminalVisibleInClaudeCode(false)
                  }
                }}
              />
            </div>
          )}
          {/* ── VS Code Bottom Panel (TERMINAL | CLAUDE | OUTPUT) ── */}
          {bottomPanel.state.isOpen && (
          <>
            <ResizeHandle
              direction="vertical"
              onDrag={(delta) => bottomPanel.setHeight(bottomPanel.state.height - delta)}
            />
            <BottomPanel
              isOpen={bottomPanel.state.isOpen}
              activeTab={bottomPanel.state.activeTab}
              height={bottomPanel.state.height}
              onTabChange={(tab) => bottomPanel.openTab(tab)}
              onClose={bottomPanel.closePanel}
              terminalContent={
                <div style={{ position: 'absolute', inset: 0 }}>
                  {terminalTabs.state.tabs.filter(t => t.type === 'terminal').map((tab) => (
                    <div
                      key={tab.id}
                      style={{
                        position: 'absolute', inset: 0,
                        visibility: tab.isActive ? 'visible' : 'hidden',
                        pointerEvents: tab.isActive ? 'auto' : 'none',
                      }}
                    >
                      <TerminalView
                        ref={terminalRefs.current[tab.id]}
                        onCommand={handleCommand}
                        onPtyOutput={handlePtyOutput}
                        theme={activeTheme}
                        sessionId={tab.sessionId}
                        isActive={tab.isActive && bottomPanel.state.activeTab === 'terminal'}
                        tuiMode={tuiMode}
                      />
                    </div>
                  ))}
                </div>
              }
              claudeContent={
                <ClaudeCodeChat
                  messages={chat.state.messages.map(m => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content
                  }))}
                  pendingFileOps={chat.pendingFileOps}
                  onApproveFileOps={chat.approveFileOps}
                  onRejectFileOps={chat.rejectFileOps}
                  chatMode={chat.state.chatMode}
                  onCycleChatMode={chat.cycleChatMode}
                  onStopAgentLoop={chat.stopAgentLoop}
                  isAgentLooping={chat.isAgentLooping}
                  isStreaming={chat.state.isStreaming}
                  onCopyMessage={(content) => navigator.clipboard.writeText(content)}
                  onSendMessage={async (text) => { await chat.sendMessage(text) }}
                  backend={backendSelector.activeBackend}
                  claudeCodeStream={backendSelector.claudeCodeStream}
                  activeIntern={agentLoop.activeIntern || DEFAULT_INTERN_ID}
                  modelLabel={chat.state.activeModelLabel}
                  presetLabel={chat.state.activePresetLabel}
                  writeToClaudeCode={backendSelector.writeToClaudeCode}
                  clearClaudeCodeStream={backendSelector.clearClaudeCodeStream}
                  placeholder="Type a message or use @ for file context..."
                />
              }
            />
          </>
        )}
        </div>

        {/* ── Right Sidebar (VRM avatar + chat overlay) ── */}
        {/* Avatar sidebar — always visible */}
        <>
          {!rpMode && (
            <ResizeHandle
              direction="horizontal"
              onDrag={(delta) => resizablePanels.updateSize('rightSidebar', -delta)}
            />
          )}
            <div
              className={`right-sidebar ${rpMode ? 'right-sidebar--rp' : ''}`}
              style={rpMode ? undefined : { width: resizablePanels.sizes.rightSidebar }}
            >
              {/* VRM Avatar - full height */}
              <div className="right-sidebar__avatar">
                <InternAvatar
                  intern={agentLoop.activeIntern || DEFAULT_INTERN_ID}
                  isRunning={agentLoop.isRunning}
                  events={agentLoop.events}
                  onInternSelect={rpMode ? undefined : agentLoop.setActiveIntern}
                  isStreaming={chat.state.isOpen}
                  hasInput={false}
                  activeSessionCwd={activeTabCwd}
                  activeSessionId={terminalTabs.state.activeTabId ?? undefined}
                  showVrmChat={showVrmChat || rpMode}
                  onToggleVrmChat={rpMode ? undefined : () => setShowVrmChat(prev => !prev)}
                  rpMode={rpMode}
                  onToggleRpMode={async () => {
                    if (!rpMode) {
                      // Entering RP mode — start ElevenLabs agent
                      setShowVrmChat(true)
                      setRpMode(true)
                      await elevenAgent.start()
                    } else {
                      // Exiting RP mode — stop agent
                      setRpMode(false)
                      await elevenAgent.stop()
                    }
                  }}
                  ttsEnabled={ttsEnabled}
                  onToggleTts={() => setTtsEnabled(prev => !prev)}
                  activeModel={rpMode
                    ? `ElevenLabs Agent ${elevenAgent.status === 'connected' ? '(live)' : `(${elevenAgent.status})`}`
                    : (chat.state.activeModelLabel || undefined)
                  }
                />

                {/* Speech Bubbles - floating overlay */}
                <SpeechBubbles
                  messages={speechBubbles.bubbles}
                  onRemove={speechBubbles.removeBubble}
                />

                {/* Virtual Assistant Chat - transparent overlay inside avatar container */}
                <VirtualAssistantChat
                  messages={(rpMode || voiceActive)
                    ? elevenAgent.messages.map((m, i) => ({
                        id: `agent-${i}`,
                        role: m.role === 'agent' ? 'assistant' as const : 'user' as const,
                        content: m.text,
                        timestamp: m.timestamp,
                      }))
                    : soraCompanion.messages as ChatMessage[]
                  }
                  onSendMessage={(rpMode || voiceActive)
                    ? (msg) => elevenAgent.sendText(msg)
                    : (msg) => soraCompanion.sendMessage(msg)
                  }
                  isStreaming={(rpMode || voiceActive) ? elevenAgent.isSpeaking : soraCompanion.isStreaming}
                  onEndRp={rpMode ? async () => {
                    setRpMode(false);
                    await elevenAgent.stop();
                  } : undefined}
                  compact={!rpMode}
                  onRequestStatus={(rpMode || voiceActive) ? undefined : () => soraCompanion.generateStatus()}
                  voiceActive={voiceActive}
                  onToggleVoice={rpMode ? undefined : async () => {
                    if (voiceActive) {
                      setVoiceActive(false)
                      await elevenAgent.stop()
                    } else {
                      setVoiceActive(true)
                      await elevenAgent.start()
                    }
                  }}
                />
              </div>
            </div>
          </>

        {/* ── File Preview (overlay, replaces chat area when open) ── */}
        {filePreview.state.isOpen && (
          <div className="file-preview-panel">
            <FilePreview
              state={filePreview.state}
              onClose={filePreview.close}
              onScroll={filePreview.setScrollPosition}
            />
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/*  Overlays (z-index above everything)                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {/* Cmd+K bar (centered, floating) */}
      <CmdKBar
        state={cmdK.state}
        onClose={cmdK.close}
        onSubmit={cmdK.submit}
        onQueryChange={cmdK.setQuery}
        onNavigateHistory={cmdK.navigateHistory}
      />

      {/* File picker (centered, floating) */}
      <FilePicker
        state={filePicker.state}
        onSelect={handleFilePickerSelect}
        onDismiss={filePicker.dismiss}
        onQueryChange={filePicker.setQuery}
      />

      {/* Autocomplete dropdown (positioned near terminal cursor) */}
      <AutocompleteDropdown
        state={autocomplete.state}
        onAccept={handleAutocompleteAccept}
        onDismiss={autocomplete.dismiss}
        position={autocompletePos}
      />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/*  Status bar                                                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="statusbar">
        <div className="statusbar__item">
          <span className="statusbar__dot" />
          <span>zsh</span>
        </div>
        <div className="statusbar__separator" />
        <div className="statusbar__item">
          <span>{activeTheme.displayName}</span>
        </div>
        <div className="statusbar__separator" />
        <div className="statusbar__item">
          <PresetSwitcher />
        </div>
        <div className="statusbar__separator" />
        <div className="statusbar__item">
          <span
            className={`statusbar__dot${isAIActive ? ' statusbar__dot--ai' : ''}`}
            style={{
              background: isAIActive ? undefined : 'transparent',
              boxShadow: isAIActive ? undefined : 'none',
            }}
          />
          <span>{isAIActive ? 'AI Active' : 'AI Ready'}</span>
        </div>
        {tuiMode && (
          <>
            <div className="statusbar__separator" />
            <div className="statusbar__item">
              <span style={{ color: 'var(--ansi-cyan)', fontWeight: 600 }}>TUI MODE</span>
            </div>
          </>
        )}
        <div style={{ flex: 1 }} />
        <div className="statusbar__shortcuts">
          <kbd className="statusbar__kbd" title="Command palette">&#x2318;K</kbd>
          <kbd className="statusbar__kbd" title="Toggle chat">&#x2318;B</kbd>
          <kbd className="statusbar__kbd" title="Toggle TUI mode">&#x2318;⇧T</kbd>
          <kbd className="statusbar__kbd" title="File picker">&#x2318;P</kbd>
          <kbd className="statusbar__kbd" title="DevTools with terminal">&#x2318;&#x2325;I</kbd>
          <button
            className="statusbar__copy-console"
            onClick={handleCopyConsole}
            title="Copy all terminal output (or select text and press Cmd+C)"
            aria-label="Copy console output"
          >
            📋
          </button>
        </div>
        <div className="statusbar__separator" />
        <div className="statusbar__item">
          <span style={{ opacity: 0.6 }}>v0.1.0</span>
        </div>
      </div>

    </div>
  )
}

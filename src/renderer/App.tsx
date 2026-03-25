/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/App.tsx
 * Module: renderer
 * Purpose: Main app component - orchestrates terminal, chat, file tree, and all UI panels
 * Dependencies: react, @/ai/types, @/types/*, @/renderer/hooks/*, @/renderer/components/*, @/shell/shell-service
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/main.tsx, /Users/ghost/Desktop/aiterminal/src/renderer/hooks/useChat.ts
 * Keywords: main-app, terminal, chat, file-tree, nl-routing, tui-mode, keyboard-shortcuts
 * Last Updated: 2026-03-24
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import type { FC } from 'react'
import type { AIResponse } from '@/ai/types'
import type { FilePickerResult } from '@/types/file-context'
import { sanitizeInput, detectPromptInjection } from '@/renderer/utils/sanitizeInput'

// Hooks
import { useTheme } from '@/renderer/hooks/useTheme'
import { useCmdK } from '@/renderer/hooks/useCmdK'
import { useChat } from '@/renderer/hooks/useChat'
import { useAutocomplete } from '@/renderer/hooks/useAutocomplete'
import { useFilePreview } from '@/renderer/hooks/useFilePreview'
import { useFilePicker } from '@/renderer/hooks/useFilePicker'
import { useDiffView } from '@/renderer/hooks/useDiffView'
import { useAgent } from '@/renderer/hooks/useAgent'
import { useFileTree } from '@/renderer/hooks/useFileTree'
import { useTerminalTabs } from '@/renderer/hooks/useTerminalTabs'
import { useTerminalLocation } from '@/renderer/hooks/useTerminalLocation'

// Components
import { TerminalView } from '@/renderer/components/TerminalView'
import { AIResponsePanel } from '@/renderer/components/AIResponsePanel'
import { CmdKBar } from '@/renderer/components/CmdKBar'
import { ThemeSelector } from '@/renderer/components/ThemeSelector'
import { ChatSidebar } from '@/renderer/components/ChatSidebar'
import { AutocompleteDropdown } from '@/renderer/components/AutocompleteDropdown'
import { FilePreview } from '@/renderer/components/FilePreview'
import { FilePicker } from '@/renderer/components/FilePicker'
import { DiffView } from '@/renderer/components/DiffView'
import { AgentApprovalPanel } from '@/renderer/components/AgentApprovalPanel'
import { AgentMode } from '@/renderer/components/AgentMode'
import { InternAvatar } from '@/renderer/components/InternAvatar'
import { SplitSidebar } from '@/renderer/components/SplitSidebar'
import { GatewayVoiceStrip } from '@/renderer/components/GatewayVoiceStrip'
import { useAgentLoop } from '@/renderer/hooks/useAgentLoop'
import { preloadVRMModels } from '@/renderer/vrm-preloader'
import { AVAILABLE_VRM_MODELS } from '@/renderer/vrm-models'

// Shell helpers
import {
  isNaturalLanguage,
  isTuiCliInvocation,
  shouldAutoEnableTuiFromPtyOutput,
} from '@/shell/shell-service'

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
  const cmdK = useCmdK()
  const chat = useChat()
  const autocomplete = useAutocomplete()
  const filePreview = useFilePreview()
  const diffView = useDiffView()
  const agent = useAgent()
  const agentLoop = useAgentLoop({ enabled: false })  // Start disabled
  const terminalTabs = useTerminalTabs()
  const terminalLocation = useTerminalLocation()

  // NL routing toast
  const [nlToast, setNlToast] = useState<string | null>(null)

  // TUI Mode: disable natural language interception for CLI tools
  const [tuiMode, setTuiMode] = useState(false)
  /** Same as `tuiMode` but updated synchronously — NL routing must not wait for re-render. */
  const tuiModeRef = useRef(false)

  useEffect(() => {
    tuiModeRef.current = tuiMode
  }, [tuiMode])

  // Active terminal session cwd (file tree + picker); synced from PTY via main process
  const [activeTabCwd, setActiveTabCwd] = useState('')

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
        setActiveTabCwd(result.cwd)
      }
    }).catch(() => {
      /* keep previous cwd */
    })
    return () => {
      cancelled = true
    }
  }, [terminalTabs.state.activeTabId, terminalTabs])

  const fileTree = useFileTree(activeTabCwd)
  const filePicker = useFilePicker(activeTabCwd)

  // -------------------------------------------------------------------------
  // AI response state (existing)
  // -------------------------------------------------------------------------

  const [aiResponse, setAIResponse] = useState<AIResponse | null>(null)
  const [isLoading] = useState(false) // Loading state for future AI responses
  const lastCommandRef = useRef<string>('')

  const handleDismiss = useCallback(() => {
    setAIResponse(null)
  }, [])

  // Toggle TUI mode (disable NL interception)
  const toggleTuiMode = useCallback(() => {
    setTuiMode((prev) => {
      const next = !prev
      tuiModeRef.current = next
      return next
    })
  }, [])

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
    }

    // Skip natural language detection when in TUI mode (read ref, not stale state)
    if (!tuiModeRef.current && isNaturalLanguage(sanitized)) {
      // Show brief toast so the user knows their input was routed
      setNlToast(sanitized)
      setTimeout(() => setNlToast(null), 2500)

      // Route to chat sidebar — auto-opens and sends as a chat message
      chat.injectFromTerminal(sanitized) // fire-and-forget (async)
      return true // signal TerminalView to NOT send Enter to PTY
    }

    // Shell commands go directly through PTY — save for error detection
    lastCommandRef.current = sanitized
    return false
  }, [chat.injectFromTerminal])

  // Monitor PTY output for error patterns → route to chat sidebar
  // Also detect successful cd commands to update file tree
  const handlePtyOutput = useCallback((data: string) => {
    if (!tuiModeRef.current && shouldAutoEnableTuiFromPtyOutput(data)) {
      tuiModeRef.current = true
      setTuiMode(true)
    }

    const errorPatterns = [
      /command not found/i,
      /No such file or directory/i,
      /Permission denied/i,
      /not recognized as/i,
    ]

    const cmd = lastCommandRef.current
    if (cmd) {
      // Check for errors first
      if (errorPatterns.some(p => p.test(data))) {
        const capturedCmd = cmd
        lastCommandRef.current = ''
        // Send error context to chat sidebar
        chat.injectFromTerminal(`Command \`${capturedCmd}\` failed: ${data.trim()}`)
        return
      }

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
                setActiveTabCwd(result.cwd)
              }
            }).catch(() => {
              /* ignore */
            })
          }, 100)
        }
      }
    }
  }, [chat.injectFromTerminal, terminalTabs])

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

      // Cmd+B — toggle Chat sidebar
      if (isMeta && e.key === 'b') {
        e.preventDefault()
        chat.toggle()
        return
      }

      // Cmd+Shift+F — toggle File tree
      if (isMeta && e.shiftKey && e.key === 'f') {
        e.preventDefault()
        fileTree.toggleVisible()
        return
      }

      // Cmd+Opt+T — Toggle terminal location
      if (isMeta && e.altKey && e.key === 't') {
        e.preventDefault()
        terminalLocation.toggle()
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

  const handleFileTreeSelect = useCallback((path: string) => {
    filePreview.openFile(path)
  }, [filePreview.openFile])

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
          setActiveTabCwd(result.cwd)
        }
      }).catch(() => {
        /* ignore */
      })
    }, 120)
  }, [terminalTabs])

  // -------------------------------------------------------------------------
  // Chat @mention -> file picker connection
  // -------------------------------------------------------------------------

  const handleMentionTrigger = useCallback(() => {
    filePicker.open('')
  }, [filePicker.open])

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

  const handleChatSend = useCallback(() => {
    const msg = chat.state.inputValue.trim()
    if (msg.length === 0) return
    chat.sendMessage(msg)
    chat.setInputValue('')
  }, [chat.state.inputValue, chat.sendMessage, chat.setInputValue])

  // -------------------------------------------------------------------------
  // Chat resize handler
  // -------------------------------------------------------------------------

  const handleChatResizeStart = useCallback((e: MouseEvent) => {
    const startX = e.clientX
    const startWidth = chat.state.width

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX
      chat.setWidth(startWidth + delta)
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [chat.state.width, chat.setWidth])

  const handleAvatarResizeStart = useCallback((e: MouseEvent) => {
    const startY = e.clientY
    const startHeight = chat.state.avatarHeight || 240

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - startY
      chat.setAvatarHeight(startHeight + delta)
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [chat.state.avatarHeight, chat.setAvatarHeight])

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
    // Start preloading all VRM models in background on app mount
    const models = Object.entries(AVAILABLE_VRM_MODELS).map(([id, config]) => ({
      id,
      url: config.url
    }))

    console.log('[App] Starting VRM preload for', models.length, 'models')

    preloadVRMModels(models, (progress) => {
      console.log(`[App] VRM preload ${progress.modelId}: ${progress.status} (${progress.progress}%)`)
    }).then(() => {
      console.log('[App] VRM preload complete')
    }).catch(err => {
      console.error('[App] VRM preload failed:', err)
    })

    // Cleanup on unmount
    return () => {
      // Keep cached VRMs in memory for the session
      // Only clear if app is shutting down
    }
  }, [])

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const isAIActive = aiResponse !== null || isLoading
  const isAgentActive = agent.state.isActive && agent.state.currentPlan !== null
  const hasBottomPanel = isAIActive || isAgentActive || diffView.state.isOpen

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
          <AgentMode
            enabled={agentLoop.enabled}
            onToggle={agentLoop.setEnabled}
            activeIntern={agentLoop.activeIntern}
            isRunning={agentLoop.isRunning}
            status={agentLoop.isRunning ? 'running' : 'idle'}
          />
          <button
            type="button"
            className="titlebar__toggle"
            onClick={fileTree.toggleVisible}
            title={fileTree.isVisible ? "Hide Sidebar (Cmd+Shift+F)" : "Show Sidebar (Cmd+Shift+F)"}
            aria-label="Toggle sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 3h5v1H1V3zm6 0h5v1H7V3zm1 2h3v1H8V5zm-7 2h5v1H1V7zm6 0h5v1H7V7zm1 2h3v1H8V9zm-7 2h5v1H1v-1zm6 0h5v1H7v-1zm1 2h3v1H8v-1z"/>
            </svg>
          </button>
          <button
            type="button"
            className="titlebar__toggle"
            onClick={chat.toggle}
            title={chat.state.isOpen ? "Hide Chat (Cmd+B)" : "Show Chat (Cmd+B)"}
            aria-label="Toggle chat"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 3h14v1H1V3zm0 3h14v1H1V6zm0 3h10v1H1V9zm0 3h10v1H1v-1z"/>
            </svg>
          </button>
          <button
            type="button"
            className="titlebar__toggle"
            onClick={terminalLocation.toggle}
            title={terminalLocation.state.location === 'center' ? "Move terminal to bottom" : "Move terminal to center"}
            aria-label="Toggle terminal location"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 3h14v1H1V3zm0 3h14v1H1V6zm0 3h14v1H1V9zm0 3h10v1H1v-1z"/>
            </svg>
          </button>
          <ThemeSelector />
        </div>
      </div>

      {/* Theme selector removed from here, now in titlebar */}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/*  Main content: file tree | terminal area | chat sidebar           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className={`app-main app-main--terminal-${terminalLocation.state.location}`}>
        {/* ── Split Sidebar (left panel: terminal tabs + file tree) ── */}
        {fileTree.isVisible && (
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
        )}

        {/* ── Terminal area (center) ── */}
        <div className="terminal-area">
          {/* Terminal */}
          <div className={`terminal-section${hasBottomPanel ? ' terminal-section--with-ai' : ''}`}>
            <div className="terminal-stack">
              {terminalTabs.state.tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={
                    tab.isActive
                      ? 'terminal-stack__layer'
                      : 'terminal-stack__layer terminal-stack__layer--inactive'
                  }
                >
                  <TerminalView
                    onCommand={handleCommand}
                    onPtyOutput={handlePtyOutput}
                    theme={activeTheme}
                    sessionId={tab.sessionId}
                    isActive={tab.isActive}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Bottom panels: AI Response / Agent / Diff */}
          {isAIActive && (
            <div className="ai-section">
              <AIResponsePanel
                response={aiResponse}
                isLoading={isLoading}
                onDismiss={handleDismiss}
              />
            </div>
          )}

          {isAgentActive && !isAIActive && (
            <div className="ai-section">
              <AgentApprovalPanel
                plan={agent.state.currentPlan}
                onApproveAll={agent.approveAll}
                onRejectAll={agent.rejectAll}
                onApproveOperation={agent.approveOperation}
                onRejectOperation={agent.rejectOperation}
                onExecute={agent.execute}
                onCancel={agent.cancel}
                isExecuting={agent.state.currentPlan?.status === 'executing'}
              />
            </div>
          )}

          {diffView.state.isOpen && !isAIActive && !isAgentActive && (
            <div className="ai-section">
              <DiffView
                state={diffView.state}
                onAccept={diffView.accept}
                onReject={diffView.reject}
                onSelectFile={diffView.selectFile}
                onClose={diffView.close}
              />
            </div>
          )}
        </div>

        {/* ── Chat Sidebar (right panel) ── */}
        {chat.state.isOpen && (
          <div className="chat-panel" style={{ width: `${chat.state.width}px` }}>
            <ChatSidebar
              state={chat.state}
              onSendMessage={handleChatSend}
              onClose={chat.close}
              onNewChat={chat.clearMessages}
              onResizeStart={handleChatResizeStart}
              onAvatarResizeStart={handleAvatarResizeStart}
              onInputChange={chat.setInputValue}
              onRemoveAttachment={chat.removeAttachment}
              onMentionTrigger={handleMentionTrigger}
              avatarSection={
                agentLoop.enabled && (
                  <InternAvatar
                    intern={agentLoop.activeIntern || 'mei'}
                    isRunning={agentLoop.isRunning}
                    events={agentLoop.events}
                    showModelSelector={true}
                    isStreaming={chat.state.isStreaming}
                    hasInput={chat.state.inputValue.length > 0}
                  />
                )
              }
            />
          </div>
        )}

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
        {chat.state.activeModelLabel && (
          <>
            <div className="statusbar__separator" />
            <div
              className="statusbar__item"
              title={
                chat.state.activeModelId
                  ? `Model: ${chat.state.activeModelId}`
                  : undefined
              }
            >
              <span style={{ opacity: 0.9 }}>{chat.state.activeModelLabel}</span>
            </div>
          </>
        )}
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
        </div>
        <div className="statusbar__separator" />
        <div className="statusbar__item">
          <span style={{ opacity: 0.6 }}>v0.1.0</span>
        </div>
      </div>

      {/* NL routing toast */}
      {nlToast && (
        <div className="nl-toast">
          <span className="nl-toast__icon">&rarr;</span>
          <span className="nl-toast__text">
            Sent to AI: {nlToast.length > 40 ? nlToast.slice(0, 40) + '\u2026' : nlToast}
          </span>
        </div>
      )}
    </div>
  )
}

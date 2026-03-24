import { useState, useCallback, useEffect, useRef } from 'react'
import type { FC } from 'react'
import type { AIResponse } from '@/ai/types'
import type { AIQueryRequest } from '@/types/index'
import type { FilePickerResult } from '@/types/file-context'

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
import { FileTree } from '@/renderer/components/FileTree'

// Shell helpers
import { isNaturalLanguage, buildAIPrompt } from '@/shell/shell-service'

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function classifyNaturalLanguage(input: string): 'code_explain' | 'general' {
  const codePhrases = /\b(code|function|class|module|import|export|variable|error|bug|syntax)\b/i
  return codePhrases.test(input) ? 'code_explain' : 'general'
}

function mapIpcResponse(ipcResponse: any): AIResponse {
  return {
    content: ipcResponse.content ?? '',
    model: ipcResponse.model ?? '',
    inputTokens: ipcResponse.inputTokens ?? 0,
    outputTokens: ipcResponse.outputTokens ?? ipcResponse.tokens ?? 0,
    latencyMs: ipcResponse.latencyMs ?? ipcResponse.latency ?? 0,
    cost: ipcResponse.cost ?? 0,
  }
}

function createErrorAIResponse(message: string): AIResponse {
  return {
    content: message,
    model: 'error',
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    cost: 0,
  }
}

/**
 * Parse [RUN]command[/RUN] tags from AI response.
 * Returns { command, cleanContent } or null if no RUN tag.
 */
function parseAutoRun(content: string): { command: string; cleanContent: string } | null {
  const match = content.match(/\[RUN\](.*?)\[\/RUN\]/s)
  if (!match) return null
  const command = match[1].trim()
  const cleanContent = content.replace(/\[RUN\].*?\[\/RUN\]/s, '').trim()
  return { command, cleanContent }
}

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

  // CWD state — fetched from electron or defaults to home
  const [cwd, setCwd] = useState('')

  useEffect(() => {
    const hasElectronAPI =
      typeof window !== 'undefined' &&
      'electronAPI' in window &&
      window.electronAPI?.getAutocompleteContext

    if (hasElectronAPI) {
      window.electronAPI.getAutocompleteContext().then((ctx) => {
        setCwd(ctx.cwd)
      }).catch(() => {
        // fallback — no-op
      })
    }
  }, [])

  const fileTree = useFileTree(cwd)
  const filePicker = useFilePicker(cwd)

  // -------------------------------------------------------------------------
  // AI response state (existing)
  // -------------------------------------------------------------------------

  const [aiResponse, setAIResponse] = useState<AIResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const lastCommandRef = useRef<string>('')

  const handleDismiss = useCallback(() => {
    setAIResponse(null)
  }, [])

  // Handle AI response — auto-execute [RUN] commands
  const processAIResponse = useCallback((response: any) => {
    const mapped = mapIpcResponse(response)
    const autoRun = parseAutoRun(mapped.content)

    if (autoRun && autoRun.command) {
      const hasElectronAPI = typeof window !== 'undefined' && 'electronAPI' in window
      if (hasElectronAPI) {
        window.electronAPI.writeToPty(autoRun.command + '\r')
      }

      if (autoRun.cleanContent) {
        setAIResponse({ ...mapped, content: `Ran: \`${autoRun.command}\`\n\n${autoRun.cleanContent}` })
      } else {
        setAIResponse({ ...mapped, content: `Ran: \`${autoRun.command}\`` })
      }
      setTimeout(() => setAIResponse(null), 3000)
    } else {
      setAIResponse(mapped)
    }
  }, [])

  const handleCommand = useCallback(async (input: string) => {
    const trimmed = input.trim()
    if (trimmed.length === 0) return

    if (isNaturalLanguage(trimmed)) {
      setIsLoading(true)
      try {
        const taskType = classifyNaturalLanguage(trimmed)
        const prompt = buildAIPrompt(trimmed, null, taskType)
        const request: AIQueryRequest = { prompt, taskType }
        const response = await window.electronAPI.aiQuery(request)
        processAIResponse(response)
      } catch {
        setAIResponse(createErrorAIResponse('Failed to get AI response.'))
      } finally {
        setIsLoading(false)
      }
      return
    }
    // Shell commands go directly through PTY — save for error detection
    lastCommandRef.current = trimmed
  }, [processAIResponse])

  // Monitor PTY output for error patterns and trigger AI
  const handlePtyOutput = useCallback((data: string) => {
    const errorPatterns = [
      /command not found/i,
      /No such file or directory/i,
      /Permission denied/i,
      /not recognized as/i,
    ]

    const cmd = lastCommandRef.current
    if (cmd && errorPatterns.some(p => p.test(data))) {
      const capturedCmd = cmd
      lastCommandRef.current = ''

      setIsLoading(true)
      const prompt = buildAIPrompt(capturedCmd, {
        exitCode: 127,
        stdout: '',
        stderr: data.trim(),
        isAITriggered: true,
      }, 'command_help')

      window.electronAPI.aiQuery({ prompt, taskType: 'command_help' })
        .then((response: any) => {
          processAIResponse(response)
        })
        .catch(() => {
          setAIResponse(createErrorAIResponse('Failed to get AI help.'))
        })
        .finally(() => {
          setIsLoading(false)
        })
    }
  }, [processAIResponse])

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
  ])

  // -------------------------------------------------------------------------
  // File tree -> file preview connection
  // -------------------------------------------------------------------------

  const handleFileTreeSelect = useCallback((path: string) => {
    filePreview.openFile(path)
  }, [filePreview.openFile])

  // -------------------------------------------------------------------------
  // Chat @mention -> file picker connection
  // -------------------------------------------------------------------------

  const handleMentionTrigger = useCallback(() => {
    filePicker.open('')
  }, [filePicker.open])

  const handleFilePickerSelect = useCallback((result: FilePickerResult) => {
    // Insert the file reference into chat input
    const currentInput = chat.state.inputValue
    // Replace trailing @ with @filename
    const updatedInput = currentInput.endsWith('@')
      ? currentInput.slice(0, -1) + `@${result.name} `
      : currentInput + `@${result.name} `

    chat.setInputValue(updatedInput)

    // Also add as attachment if we can read the file content
    chat.addAttachment({
      name: result.name,
      path: result.path,
      content: undefined,
    })

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
      </div>

      {/* Theme selector (top-right, fixed) */}
      <ThemeSelector />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/*  Main content: file tree | terminal area | chat sidebar           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="app-main">
        {/* ── File Tree (left panel) ── */}
        {fileTree.isVisible && (
          <div className="file-tree-container">
            <FileTree
              cwd={cwd}
              entries={fileTree.entries}
              isVisible={fileTree.isVisible}
              onToggle={fileTree.toggleVisible}
              onFileSelect={handleFileTreeSelect}
            />
          </div>
        )}

        {/* ── Terminal area (center) ── */}
        <div className="terminal-area">
          {/* Terminal */}
          <div className={`terminal-section${hasBottomPanel ? ' terminal-section--with-ai' : ''}`}>
            <TerminalView
              onCommand={handleCommand}
              onPtyOutput={handlePtyOutput}
              theme={activeTheme}
            />
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
          <div className="chat-panel">
            <ChatSidebar
              state={chat.state}
              onSendMessage={handleChatSend}
              onClose={chat.close}
              onNewChat={chat.clearMessages}
              onResizeStart={handleChatResizeStart}
              onInputChange={chat.setInputValue}
              onRemoveAttachment={chat.removeAttachment}
              onMentionTrigger={handleMentionTrigger}
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
        <div style={{ flex: 1 }} />
        <div className="statusbar__shortcuts">
          <kbd className="statusbar__kbd" title="Command palette">&#x2318;K</kbd>
          <kbd className="statusbar__kbd" title="Toggle chat">&#x2318;B</kbd>
          <kbd className="statusbar__kbd" title="File picker">&#x2318;P</kbd>
        </div>
        <div className="statusbar__separator" />
        <div className="statusbar__item">
          <span style={{ opacity: 0.6 }}>v0.1.0</span>
        </div>
      </div>
    </div>
  )
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useChat } from './useChat'

// ---------------------------------------------------------------------------
// Mock: window.electronAPI
// ---------------------------------------------------------------------------

const mockAiQuery = vi.fn().mockResolvedValue({
  content: 'Mock AI response',
  model: 'test-model',
  inputTokens: 10,
  outputTokens: 20,
  latencyMs: 100,
  cost: 0.001,
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // In jsdom, window already exists — attach electronAPI directly
    ;(window as any).electronAPI = {
      aiQuery: mockAiQuery,
      getActiveAiModel: vi.fn().mockResolvedValue({
        id: 'openai/gpt-4o-2024-11-20',
        displayName: 'GPT-4o',
        presetName: 'balanced',
      }),
      readDirectory: vi.fn().mockResolvedValue([]),
      readDirectoryTree: vi.fn().mockResolvedValue([]),
      executeCommand: vi.fn(),
      getThemes: vi.fn(),
      setTheme: vi.fn(),
      getThemeConfig: vi.fn(),
      onPtyData: vi.fn(),
      writeToPty: vi.fn(),
      resizePty: vi.fn(),
    }
  })

  afterEach(() => {
    cleanup()
    delete (window as any).electronAPI
  })

  // -------------------------------------------------------------------------
  // 1. Initial state
  // -------------------------------------------------------------------------

  it('returns initial state: closed, empty messages, default width', () => {
    const { result } = renderHook(() => useChat())

    expect(result.current.state.isOpen).toBe(false)
    expect(result.current.state.messages).toEqual([])
    expect(result.current.state.width).toBe(420)
    expect(result.current.state.inputValue).toBe('')
    expect(result.current.state.isStreaming).toBe(false)
    expect(result.current.state.attachedFiles).toEqual([])
  })

  // -------------------------------------------------------------------------
  // 2. open / close / toggle
  // -------------------------------------------------------------------------

  it('open() sets isOpen to true', () => {
    const { result } = renderHook(() => useChat())

    act(() => {
      result.current.open()
    })

    expect(result.current.state.isOpen).toBe(true)
  })

  it('close() sets isOpen to false', () => {
    const { result } = renderHook(() => useChat())

    act(() => {
      result.current.open()
    })
    expect(result.current.state.isOpen).toBe(true)

    act(() => {
      result.current.close()
    })
    expect(result.current.state.isOpen).toBe(false)
  })

  it('toggle() flips isOpen', () => {
    const { result } = renderHook(() => useChat())

    act(() => {
      result.current.toggle()
    })
    expect(result.current.state.isOpen).toBe(true)

    act(() => {
      result.current.toggle()
    })
    expect(result.current.state.isOpen).toBe(false)
  })

  // -------------------------------------------------------------------------
  // 3. setWidth
  // -------------------------------------------------------------------------

  it('setWidth() updates width within bounds (clamped 280-640)', () => {
    const { result } = renderHook(() => useChat())

    act(() => {
      result.current.setWidth(450)
    })
    expect(result.current.state.width).toBe(450)
  })

  it('setWidth() clamps to minimum of 280', () => {
    const { result } = renderHook(() => useChat())

    act(() => {
      result.current.setWidth(100)
    })
    expect(result.current.state.width).toBe(280)
  })

  it('setWidth() clamps to maximum of 640', () => {
    const { result } = renderHook(() => useChat())

    act(() => {
      result.current.setWidth(900)
    })
    expect(result.current.state.width).toBe(640)
  })

  // -------------------------------------------------------------------------
  // 4. sendMessage — adds user message and triggers AI
  // -------------------------------------------------------------------------

  it('sendMessage() adds a user message and triggers AI response', async () => {
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('Hello AI')
    })

    const userMessages = result.current.state.messages.filter(
      (m) => m.role === 'user',
    )
    expect(userMessages.length).toBe(1)
    expect(userMessages[0].content).toBe('Hello AI')
  })

  it('sendMessage() does not send empty messages', async () => {
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('')
    })

    expect(result.current.state.messages.length).toBe(0)
  })

  it('sendMessage() does not send whitespace-only messages', async () => {
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('   ')
    })

    expect(result.current.state.messages.length).toBe(0)
  })

  // -------------------------------------------------------------------------
  // 5. sendMessage with attachments
  // -------------------------------------------------------------------------

  it('sendMessage() with attachments includes file references in the user message', async () => {
    const { result } = renderHook(() => useChat())

    act(() => {
      result.current.addAttachment({
        path: '/src/main.ts',
        name: 'main.ts',
        content: 'console.log("hello")',
        language: 'typescript',
      })
    })

    await act(async () => {
      await result.current.sendMessage('Explain this file')
    })

    const userMsg = result.current.state.messages.find(
      (m) => m.role === 'user',
    )
    expect(userMsg).toBeDefined()
    expect(userMsg!.attachments).toBeDefined()
    expect(userMsg!.attachments!.length).toBe(1)
    expect(userMsg!.attachments![0].path).toBe('/src/main.ts')
  })

  // -------------------------------------------------------------------------
  // 6. AI response adds assistant message
  // -------------------------------------------------------------------------

  it('AI response adds an assistant message after sendMessage', async () => {
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('What is TypeScript?')
    })

    const assistantMessages = result.current.state.messages.filter(
      (m) => m.role === 'assistant',
    )
    expect(assistantMessages.length).toBe(1)
    expect(assistantMessages[0].content).toBe('Mock AI response')
    expect(assistantMessages[0].model).toBe('test-model')
  })

  // -------------------------------------------------------------------------
  // 7. clearMessages
  // -------------------------------------------------------------------------

  it('clearMessages() resets conversation', async () => {
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('First message')
    })
    expect(result.current.state.messages.length).toBeGreaterThan(0)

    act(() => {
      result.current.clearMessages()
    })
    expect(result.current.state.messages).toEqual([])
  })

  // -------------------------------------------------------------------------
  // 8. addAttachment
  // -------------------------------------------------------------------------

  it('addAttachment() adds a file reference', () => {
    const { result } = renderHook(() => useChat())

    act(() => {
      result.current.addAttachment({
        path: '/src/index.ts',
        name: 'index.ts',
        language: 'typescript',
      })
    })

    expect(result.current.state.attachedFiles.length).toBe(1)
    expect(result.current.state.attachedFiles[0].name).toBe('index.ts')
  })

  // -------------------------------------------------------------------------
  // 9. removeAttachment
  // -------------------------------------------------------------------------

  it('removeAttachment() removes by path', () => {
    const { result } = renderHook(() => useChat())

    act(() => {
      result.current.addAttachment({
        path: '/src/a.ts',
        name: 'a.ts',
      })
      result.current.addAttachment({
        path: '/src/b.ts',
        name: 'b.ts',
      })
    })
    expect(result.current.state.attachedFiles.length).toBe(2)

    act(() => {
      result.current.removeAttachment('/src/a.ts')
    })
    expect(result.current.state.attachedFiles.length).toBe(1)
    expect(result.current.state.attachedFiles[0].path).toBe('/src/b.ts')
  })

  // -------------------------------------------------------------------------
  // 10. @mention detection
  // -------------------------------------------------------------------------

  it('@mention detection extracts file paths from input', () => {
    const { result } = renderHook(() => useChat())

    const mentions = result.current.extractMentions(
      'Look at @src/main.ts and @lib/utils.ts please',
    )

    expect(mentions).toEqual(['src/main.ts', 'lib/utils.ts'])
  })

  it('@mention detection returns empty for no mentions', () => {
    const { result } = renderHook(() => useChat())

    const mentions = result.current.extractMentions('No mentions here')
    expect(mentions).toEqual([])
  })

  // -------------------------------------------------------------------------
  // 11. Immutable updates
  // -------------------------------------------------------------------------

  it('sendMessage uses immutable updates (does not mutate previous messages array)', async () => {
    const { result } = renderHook(() => useChat())

    const messagesBefore = result.current.state.messages

    await act(async () => {
      await result.current.sendMessage('Test message')
    })

    const messagesAfter = result.current.state.messages
    expect(messagesBefore).not.toBe(messagesAfter)
    expect(messagesBefore.length).toBe(0)
  })

  // -------------------------------------------------------------------------
  // 12. setInputValue
  // -------------------------------------------------------------------------

  it('setInputValue() updates input value', () => {
    const { result } = renderHook(() => useChat())

    act(() => {
      result.current.setInputValue('Hello world')
    })

    expect(result.current.state.inputValue).toBe('Hello world')
  })
})

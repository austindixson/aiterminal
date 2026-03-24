import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTroubleshoot } from './useTroubleshoot'
import { ContextCollector } from '@/troubleshoot/context-collector'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTroubleshoot', () => {
  let collector: ContextCollector

  beforeEach(() => {
    vi.clearAllMocks()
    collector = ContextCollector.create()
  })

  it('returns initial state with isOpen false', () => {
    const { result } = renderHook(() => useTroubleshoot(collector))

    expect(result.current.state.isOpen).toBe(false)
    expect(result.current.state.messages).toEqual([])
    expect(result.current.state.isLoading).toBe(false)
    expect(result.current.state.activeTab).toBe('chat')
  })

  it('open() sets isOpen to true', () => {
    const { result } = renderHook(() => useTroubleshoot(collector))

    act(() => {
      result.current.open()
    })

    expect(result.current.state.isOpen).toBe(true)
  })

  it('close() sets isOpen to false', () => {
    const { result } = renderHook(() => useTroubleshoot(collector))

    act(() => {
      result.current.open()
    })
    expect(result.current.state.isOpen).toBe(true)

    act(() => {
      result.current.close()
    })
    expect(result.current.state.isOpen).toBe(false)
  })

  it('switchTab changes active tab', () => {
    const { result } = renderHook(() => useTroubleshoot(collector))

    act(() => {
      result.current.switchTab('console')
    })
    expect(result.current.state.activeTab).toBe('console')

    act(() => {
      result.current.switchTab('context')
    })
    expect(result.current.state.activeTab).toBe('context')

    act(() => {
      result.current.switchTab('chat')
    })
    expect(result.current.state.activeTab).toBe('chat')
  })

  it('sendMessage adds a user message to messages array', async () => {
    const { result } = renderHook(() => useTroubleshoot(collector))

    await act(async () => {
      await result.current.sendMessage('How do I fix this?')
    })

    const userMessages = result.current.state.messages.filter(
      (m) => m.role === 'user',
    )
    expect(userMessages.length).toBe(1)
    expect(userMessages[0].content).toBe('How do I fix this?')
  })

  it('sendMessage uses immutable updates (does not mutate previous messages array)', async () => {
    const { result } = renderHook(() => useTroubleshoot(collector))

    const messagesBefore = result.current.state.messages

    await act(async () => {
      await result.current.sendMessage('Test message')
    })

    const messagesAfter = result.current.state.messages

    // The arrays should be different references
    expect(messagesBefore).not.toBe(messagesAfter)
    // Original should still be empty
    expect(messagesBefore.length).toBe(0)
  })

  it('provides session context from the collector', () => {
    const withCommand = collector.addCommand('npm run build', 1, '', 'Error')
    const { result } = renderHook(() => useTroubleshoot(withCommand))

    expect(result.current.state.sessionContext.recentEntries.length).toBeGreaterThan(0)
  })

  it('open with initial message adds an assistant message', () => {
    const { result } = renderHook(() => useTroubleshoot(collector))

    act(() => {
      result.current.open('Here is the initial AI response.')
    })

    expect(result.current.state.isOpen).toBe(true)
    const assistantMsgs = result.current.state.messages.filter(
      (m) => m.role === 'assistant',
    )
    expect(assistantMsgs.length).toBe(1)
    expect(assistantMsgs[0].content).toBe('Here is the initial AI response.')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChatMessageBubble } from './ChatMessage'
import type { ChatMessage } from '@/types/chat'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createMessage(
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 9)}`,
    role: 'user',
    content: 'Hello world',
    timestamp: Date.now(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatMessageBubble', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders user message content', () => {
    const msg = createMessage({ role: 'user', content: 'User says hello' })
    render(<ChatMessageBubble message={msg} />)

    expect(screen.getByText('User says hello')).toBeInTheDocument()
  })

  it('renders assistant message content', () => {
    const msg = createMessage({
      role: 'assistant',
      content: 'AI says hello',
      model: 'claude-sonnet-4',
    })
    render(<ChatMessageBubble message={msg} />)

    expect(screen.getByText('AI says hello')).toBeInTheDocument()
  })

  it('shows model badge for assistant messages', () => {
    const msg = createMessage({
      role: 'assistant',
      content: 'Response',
      model: 'gpt-4-turbo',
    })
    render(<ChatMessageBubble message={msg} />)

    expect(screen.getByText('gpt-4-turbo')).toBeInTheDocument()
  })

  it('does not show model badge for user messages', () => {
    const msg = createMessage({ role: 'user', content: 'Question' })
    const { container } = render(<ChatMessageBubble message={msg} />)

    expect(container.querySelector('.chat-message__model')).toBeNull()
  })

  it('renders inline code with backticks', () => {
    const msg = createMessage({
      role: 'assistant',
      content: 'Use `console.log` for debugging',
    })
    render(<ChatMessageBubble message={msg} />)

    const codeEl = screen.getByText('console.log')
    expect(codeEl.tagName.toLowerCase()).toBe('code')
  })

  it('renders code blocks with triple backticks', () => {
    const msg = createMessage({
      role: 'assistant',
      content: '```\nconst x = 1;\n```',
    })
    const { container } = render(<ChatMessageBubble message={msg} />)

    expect(
      container.querySelector('.chat-message__code-block'),
    ).toBeInTheDocument()
  })

  it('renders bold text with double asterisks', () => {
    const msg = createMessage({
      role: 'assistant',
      content: 'This is **bold** text',
    })
    render(<ChatMessageBubble message={msg} />)

    const boldEl = screen.getByText('bold')
    expect(boldEl.tagName.toLowerCase()).toBe('strong')
  })

  it('shows relative timestamp', () => {
    const twoMinutesAgo = Date.now() - 120_000
    const msg = createMessage({ timestamp: twoMinutesAgo })
    render(<ChatMessageBubble message={msg} />)

    expect(screen.getByText(/ago/)).toBeInTheDocument()
  })

  it('applies user styling class for user messages', () => {
    const msg = createMessage({ role: 'user' })
    const { container } = render(<ChatMessageBubble message={msg} />)

    expect(
      container.querySelector('.chat-message--user'),
    ).toBeInTheDocument()
  })

  it('applies assistant styling class for assistant messages', () => {
    const msg = createMessage({ role: 'assistant' })
    const { container } = render(<ChatMessageBubble message={msg} />)

    expect(
      container.querySelector('.chat-message--assistant'),
    ).toBeInTheDocument()
  })

  it('shows streaming dots when isStreaming is true', () => {
    const msg = createMessage({
      role: 'assistant',
      content: 'Partial response...',
      isStreaming: true,
    })
    render(<ChatMessageBubble message={msg} />)

    expect(screen.getByTestId('streaming-dots')).toBeInTheDocument()
  })
})

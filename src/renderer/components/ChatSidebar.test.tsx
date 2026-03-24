import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatSidebar } from './ChatSidebar'
import type { ChatState, ChatMessage, FileAttachment } from '@/types/chat'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createMessage(
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 9)}`,
    role: 'user',
    content: 'Hello there',
    timestamp: Date.now(),
    ...overrides,
  }
}

function createAttachment(
  overrides: Partial<FileAttachment> = {},
): FileAttachment {
  return {
    path: '/src/index.ts',
    name: 'index.ts',
    language: 'typescript',
    ...overrides,
  }
}

function createState(
  overrides: Partial<ChatState> = {},
): ChatState {
  return {
    isOpen: true,
    width: 380,
    messages: [],
    inputValue: '',
    isStreaming: false,
    attachedFiles: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Default props factory
// ---------------------------------------------------------------------------

function createProps(overrides: Record<string, unknown> = {}) {
  return {
    state: createState(),
    onSendMessage: vi.fn(),
    onClose: vi.fn(),
    onNewChat: vi.fn(),
    onResizeStart: vi.fn(),
    onInputChange: vi.fn(),
    onRemoveAttachment: vi.fn(),
    onMentionTrigger: vi.fn(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // 1. Not visible when isOpen is false
  // -------------------------------------------------------------------------

  it('is not visible when isOpen is false', () => {
    const props = createProps({
      state: createState({ isOpen: false }),
    })
    const { container } = render(<ChatSidebar {...props} />)

    expect(container.querySelector('.chat-sidebar')).toBeNull()
  })

  // -------------------------------------------------------------------------
  // 2. Visible when isOpen is true with correct width
  // -------------------------------------------------------------------------

  it('is visible when isOpen is true with correct width', () => {
    const props = createProps({
      state: createState({ isOpen: true, width: 420 }),
    })
    render(<ChatSidebar {...props} />)

    const sidebar = screen.getByTestId('chat-sidebar')
    expect(sidebar).toBeInTheDocument()
    expect(sidebar.style.width).toBe('420px')
  })

  // -------------------------------------------------------------------------
  // 3. Shows message list
  // -------------------------------------------------------------------------

  it('shows message list', () => {
    const messages: ChatMessage[] = [
      createMessage({ role: 'user', content: 'Hey' }),
      createMessage({ role: 'assistant', content: 'Hi there!', model: 'gpt-4' }),
    ]
    const props = createProps({
      state: createState({ messages }),
    })
    render(<ChatSidebar {...props} />)

    expect(screen.getByText('Hey')).toBeInTheDocument()
    expect(screen.getByText('Hi there!')).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // 4. User messages have user class
  // -------------------------------------------------------------------------

  it('user messages have user styling class', () => {
    const messages: ChatMessage[] = [
      createMessage({ id: 'u1', role: 'user', content: 'User text' }),
    ]
    const props = createProps({
      state: createState({ messages }),
    })
    const { container } = render(<ChatSidebar {...props} />)

    expect(
      container.querySelector('.chat-message--user'),
    ).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // 5. AI messages have assistant class and model badge
  // -------------------------------------------------------------------------

  it('AI messages have assistant class and model badge', () => {
    const messages: ChatMessage[] = [
      createMessage({
        id: 'a1',
        role: 'assistant',
        content: 'AI response',
        model: 'claude-sonnet-4',
      }),
    ]
    const props = createProps({
      state: createState({ messages }),
    })
    const { container } = render(<ChatSidebar {...props} />)

    expect(
      container.querySelector('.chat-message--assistant'),
    ).toBeInTheDocument()
    expect(screen.getByText('claude-sonnet-4')).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // 6. Input field at bottom with send button
  // -------------------------------------------------------------------------

  it('has input field and send button', () => {
    const props = createProps()
    render(<ChatSidebar {...props} />)

    expect(screen.getByPlaceholderText(/message/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /send/i }),
    ).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // 7. Send button disabled when input empty
  // -------------------------------------------------------------------------

  it('send button is disabled when input is empty', () => {
    const props = createProps({
      state: createState({ inputValue: '' }),
    })
    render(<ChatSidebar {...props} />)

    const sendBtn = screen.getByRole('button', { name: /send/i })
    expect(sendBtn).toBeDisabled()
  })

  it('send button is enabled when input has content', () => {
    const props = createProps({
      state: createState({ inputValue: 'Hello' }),
    })
    render(<ChatSidebar {...props} />)

    const sendBtn = screen.getByRole('button', { name: /send/i })
    expect(sendBtn).not.toBeDisabled()
  })

  // -------------------------------------------------------------------------
  // 8. Submit on Enter (not Shift+Enter)
  // -------------------------------------------------------------------------

  it('submits on Enter key press', async () => {
    const user = userEvent.setup()
    const onSendMessage = vi.fn()
    const props = createProps({
      state: createState({ inputValue: 'Hello AI' }),
      onSendMessage,
    })
    render(<ChatSidebar {...props} />)

    const textarea = screen.getByPlaceholderText(/message/i)
    await user.click(textarea)
    await user.keyboard('{Enter}')

    expect(onSendMessage).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // 9. Shift+Enter does NOT submit
  // -------------------------------------------------------------------------

  it('Shift+Enter does not submit', async () => {
    const user = userEvent.setup()
    const onSendMessage = vi.fn()
    const props = createProps({
      state: createState({ inputValue: 'Hello AI' }),
      onSendMessage,
    })
    render(<ChatSidebar {...props} />)

    const textarea = screen.getByPlaceholderText(/message/i)
    await user.click(textarea)
    await user.keyboard('{Shift>}{Enter}{/Shift}')

    expect(onSendMessage).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 10. Shows streaming indicator when AI responding
  // -------------------------------------------------------------------------

  it('shows streaming indicator when isStreaming is true', () => {
    const props = createProps({
      state: createState({ isStreaming: true }),
    })
    render(<ChatSidebar {...props} />)

    expect(screen.getByTestId('chat-streaming-indicator')).toBeInTheDocument()
  })

  it('does not show streaming indicator when isStreaming is false', () => {
    const props = createProps({
      state: createState({ isStreaming: false }),
    })
    render(<ChatSidebar {...props} />)

    expect(screen.queryByTestId('chat-streaming-indicator')).toBeNull()
  })

  // -------------------------------------------------------------------------
  // 11. Auto-scrolls (verify messages container exists)
  // -------------------------------------------------------------------------

  it('has a scrollable messages container for auto-scroll', () => {
    const messages: ChatMessage[] = Array.from({ length: 20 }, (_, i) =>
      createMessage({
        id: `msg-${i}`,
        content: `Message ${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
      }),
    )
    const props = createProps({
      state: createState({ messages }),
    })
    const { container } = render(<ChatSidebar {...props} />)

    const messageList = container.querySelector('.chat-messages')
    expect(messageList).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // 12. Shows attached file chips above input
  // -------------------------------------------------------------------------

  it('shows attached file chips above input', () => {
    const attachedFiles: FileAttachment[] = [
      createAttachment({ path: '/src/a.ts', name: 'a.ts' }),
      createAttachment({ path: '/src/b.ts', name: 'b.ts' }),
    ]
    const props = createProps({
      state: createState({ attachedFiles }),
    })
    render(<ChatSidebar {...props} />)

    expect(screen.getByText('a.ts')).toBeInTheDocument()
    expect(screen.getByText('b.ts')).toBeInTheDocument()
  })

  it('file chips have remove buttons', () => {
    const attachedFiles: FileAttachment[] = [
      createAttachment({ path: '/src/a.ts', name: 'a.ts' }),
    ]
    const onRemoveAttachment = vi.fn()
    const props = createProps({
      state: createState({ attachedFiles }),
      onRemoveAttachment,
    })
    render(<ChatSidebar {...props} />)

    const chip = screen.getByText('a.ts').closest('.chat-attachment-chip')
    expect(chip).toBeInTheDocument()

    const removeBtn = within(chip!).getByRole('button', { name: /remove/i })
    expect(removeBtn).toBeInTheDocument()
  })

  it('clicking remove on file chip calls onRemoveAttachment', async () => {
    const user = userEvent.setup()
    const attachedFiles: FileAttachment[] = [
      createAttachment({ path: '/src/a.ts', name: 'a.ts' }),
    ]
    const onRemoveAttachment = vi.fn()
    const props = createProps({
      state: createState({ attachedFiles }),
      onRemoveAttachment,
    })
    render(<ChatSidebar {...props} />)

    const chip = screen.getByText('a.ts').closest('.chat-attachment-chip')
    const removeBtn = within(chip!).getByRole('button', { name: /remove/i })
    await user.click(removeBtn)

    expect(onRemoveAttachment).toHaveBeenCalledWith('/src/a.ts')
  })

  // -------------------------------------------------------------------------
  // 13. @ key triggers file autocomplete callback
  // -------------------------------------------------------------------------

  it('calls onMentionTrigger when @ is typed in input', async () => {
    const user = userEvent.setup()
    const onMentionTrigger = vi.fn()
    const onInputChange = vi.fn()
    const props = createProps({
      state: createState({ inputValue: '' }),
      onMentionTrigger,
      onInputChange,
    })
    render(<ChatSidebar {...props} />)

    const textarea = screen.getByPlaceholderText(/message/i)
    await user.click(textarea)
    await user.type(textarea, '@')

    expect(onMentionTrigger).toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 14. Resize handle on left edge
  // -------------------------------------------------------------------------

  it('has a resize handle on the left edge', () => {
    const props = createProps()
    const { container } = render(<ChatSidebar {...props} />)

    expect(
      container.querySelector('.chat-resize-handle'),
    ).toBeInTheDocument()
  })

  it('resize handle triggers onResizeStart on mousedown', async () => {
    const onResizeStart = vi.fn()
    const props = createProps({ onResizeStart })
    const { container } = render(<ChatSidebar {...props} />)

    const handle = container.querySelector('.chat-resize-handle')!
    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))

    expect(onResizeStart).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // 15. Close button in header
  // -------------------------------------------------------------------------

  it('has a close button in the header', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const props = createProps({ onClose })

    render(<ChatSidebar {...props} />)

    const closeBtn = screen.getByRole('button', { name: /close/i })
    await user.click(closeBtn)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // 16. New Chat button
  // -------------------------------------------------------------------------

  it('has a New Chat button', async () => {
    const user = userEvent.setup()
    const onNewChat = vi.fn()
    const props = createProps({ onNewChat })

    render(<ChatSidebar {...props} />)

    const newChatBtn = screen.getByRole('button', { name: /new chat/i })
    await user.click(newChatBtn)

    expect(onNewChat).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // 17. Header shows title
  // -------------------------------------------------------------------------

  it('shows "AI Chat" title in header', () => {
    const props = createProps()
    render(<ChatSidebar {...props} />)

    expect(screen.getByText('AI Chat')).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // 18. Input change callback
  // -------------------------------------------------------------------------

  it('calls onInputChange when typing in textarea', async () => {
    const user = userEvent.setup()
    const onInputChange = vi.fn()
    const props = createProps({
      state: createState({ inputValue: '' }),
      onInputChange,
    })
    render(<ChatSidebar {...props} />)

    const textarea = screen.getByPlaceholderText(/message/i)
    await user.type(textarea, 'H')

    expect(onInputChange).toHaveBeenCalled()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CmdKBar } from './CmdKBar'
import type { CmdKState, CmdKResult, CmdKHistoryEntry } from '@/types/cmd-k'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createDefaultState(overrides: Partial<CmdKState> = {}): CmdKState {
  return {
    isOpen: false,
    query: '',
    isProcessing: false,
    result: null,
    history: [],
    ...overrides,
  }
}

function createResult(overrides: Partial<CmdKResult> = {}): CmdKResult {
  return {
    type: 'explanation',
    content: 'This is the AI result.',
    ...overrides,
  }
}

function createHistoryEntry(
  overrides: Partial<CmdKHistoryEntry> = {},
): CmdKHistoryEntry {
  return {
    query: 'previous query',
    result: createResult(),
    timestamp: Date.now(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Default handlers
// ---------------------------------------------------------------------------

const defaultHandlers = {
  onClose: vi.fn(),
  onSubmit: vi.fn(),
  onQueryChange: vi.fn(),
  onNavigateHistory: vi.fn(),
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CmdKBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is not visible when isOpen is false', () => {
    const state = createDefaultState({ isOpen: false })

    const { container } = render(
      <CmdKBar state={state} {...defaultHandlers} />,
    )

    expect(container.querySelector('.cmd-k-overlay')).not.toBeInTheDocument()
  })

  it('is visible when isOpen is true', () => {
    const state = createDefaultState({ isOpen: true })

    render(<CmdKBar state={state} {...defaultHandlers} />)

    expect(screen.getByTestId('cmd-k-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('cmd-k-bar')).toBeInTheDocument()
  })

  it('shows input field focused when opened', () => {
    const state = createDefaultState({ isOpen: true })

    render(<CmdKBar state={state} {...defaultHandlers} />)

    const input = screen.getByPlaceholderText(/ask ai anything/i)
    expect(input).toBeInTheDocument()
    expect(input).toHaveFocus()
  })

  it('calls onQueryChange when typing in the input', async () => {
    const user = userEvent.setup()
    const state = createDefaultState({ isOpen: true })

    render(<CmdKBar state={state} {...defaultHandlers} />)

    const input = screen.getByPlaceholderText(/ask ai anything/i)
    await user.type(input, 'hello')

    expect(defaultHandlers.onQueryChange).toHaveBeenCalled()
  })

  it('calls onSubmit when Enter is pressed', async () => {
    const state = createDefaultState({ isOpen: true, query: 'list files' })

    render(<CmdKBar state={state} {...defaultHandlers} />)

    const input = screen.getByPlaceholderText(/ask ai anything/i)
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(defaultHandlers.onSubmit).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape is pressed', async () => {
    const state = createDefaultState({ isOpen: true })

    render(<CmdKBar state={state} {...defaultHandlers} />)

    const input = screen.getByPlaceholderText(/ask ai anything/i)
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(defaultHandlers.onClose).toHaveBeenCalledTimes(1)
  })

  it('shows loading indicator when isProcessing is true', () => {
    const state = createDefaultState({ isOpen: true, isProcessing: true })

    render(<CmdKBar state={state} {...defaultHandlers} />)

    expect(screen.getByTestId('cmd-k-loading')).toBeInTheDocument()
  })

  it('shows result content after processing', () => {
    const result = createResult({
      type: 'explanation',
      content: 'Files can be listed with `ls`.',
    })
    const state = createDefaultState({ isOpen: true, result })

    render(<CmdKBar state={state} {...defaultHandlers} />)

    expect(
      screen.getByText(/files can be listed with/i),
    ).toBeInTheDocument()
  })

  it('shows "Ran:" label for auto-executed commands', () => {
    const result = createResult({
      type: 'command',
      content: 'Listed directory contents.',
      command: 'ls -la',
      isAutoExecuted: true,
    })
    const state = createDefaultState({ isOpen: true, result })

    render(<CmdKBar state={state} {...defaultHandlers} />)

    expect(screen.getByText(/ran:/i)).toBeInTheDocument()
    expect(screen.getByText('ls -la')).toBeInTheDocument()
  })

  it('renders history entries in the dropdown', () => {
    const history: ReadonlyArray<CmdKHistoryEntry> = [
      createHistoryEntry({ query: 'how to list files' }),
      createHistoryEntry({ query: 'explain git rebase' }),
    ]
    const state = createDefaultState({ isOpen: true, history })

    render(<CmdKBar state={state} {...defaultHandlers} />)

    expect(screen.getByText('how to list files')).toBeInTheDocument()
    expect(screen.getByText('explain git rebase')).toBeInTheDocument()
  })

  it('navigates history on ArrowUp key', () => {
    const history: ReadonlyArray<CmdKHistoryEntry> = [
      createHistoryEntry({ query: 'prev query' }),
    ]
    const state = createDefaultState({ isOpen: true, history })

    render(<CmdKBar state={state} {...defaultHandlers} />)

    const input = screen.getByPlaceholderText(/ask ai anything/i)
    fireEvent.keyDown(input, { key: 'ArrowUp' })

    expect(defaultHandlers.onNavigateHistory).toHaveBeenCalledWith(-1)
  })

  it('has glass morphism styling class on the bar', () => {
    const state = createDefaultState({ isOpen: true })

    render(<CmdKBar state={state} {...defaultHandlers} />)

    const bar = screen.getByTestId('cmd-k-bar')
    expect(bar.className).toContain('cmd-k-bar')
  })

  it('closes when clicking the overlay background', async () => {
    const user = userEvent.setup()
    const state = createDefaultState({ isOpen: true })

    render(<CmdKBar state={state} {...defaultHandlers} />)

    const overlay = screen.getByTestId('cmd-k-overlay')
    // Click directly on the overlay, not on the bar inside it
    await user.click(overlay)

    expect(defaultHandlers.onClose).toHaveBeenCalled()
  })

  it('shows error result with error styling', () => {
    const result = createResult({
      type: 'error',
      content: 'Something went wrong.',
    })
    const state = createDefaultState({ isOpen: true, result })

    render(<CmdKBar state={state} {...defaultHandlers} />)

    const resultEl = screen.getByTestId('cmd-k-result')
    expect(resultEl.className).toContain('cmd-k-result--error')
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument()
  })

  it('does not call onSubmit on Enter when query is empty', () => {
    const state = createDefaultState({ isOpen: true, query: '' })

    render(<CmdKBar state={state} {...defaultHandlers} />)

    const input = screen.getByPlaceholderText(/ask ai anything/i)
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(defaultHandlers.onSubmit).not.toHaveBeenCalled()
  })

  it('navigates history forward on ArrowDown key', () => {
    const history: ReadonlyArray<CmdKHistoryEntry> = [
      createHistoryEntry({ query: 'q1' }),
      createHistoryEntry({ query: 'q2' }),
    ]
    const state = createDefaultState({ isOpen: true, history })

    render(<CmdKBar state={state} {...defaultHandlers} />)

    const input = screen.getByPlaceholderText(/ask ai anything/i)
    fireEvent.keyDown(input, { key: 'ArrowDown' })

    expect(defaultHandlers.onNavigateHistory).toHaveBeenCalledWith(1)
  })
})

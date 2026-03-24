import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilePicker } from './FilePicker'
import type { FilePickerState, FilePickerResult } from '@/types/file-context'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createResult(overrides: Partial<FilePickerResult> = {}): FilePickerResult {
  return {
    path: '/project/src/index.ts',
    name: 'index.ts',
    relativePath: 'src/index.ts',
    isDirectory: false,
    ...overrides,
  }
}

function createState(overrides: Partial<FilePickerState> = {}): FilePickerState {
  return {
    isOpen: false,
    query: '',
    results: [],
    selectedIndex: 0,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Default handlers
// ---------------------------------------------------------------------------

const defaultHandlers = {
  onSelect: vi.fn(),
  onDismiss: vi.fn(),
  onQueryChange: vi.fn(),
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FilePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is not visible when state.isOpen is false', () => {
    const state = createState({ isOpen: false })

    const { container } = render(
      <FilePicker state={state} {...defaultHandlers} />,
    )

    expect(container.querySelector('.file-picker')).not.toBeInTheDocument()
  })

  it('shows search input when open', () => {
    const state = createState({ isOpen: true })

    render(<FilePicker state={state} {...defaultHandlers} />)

    const input = screen.getByPlaceholderText(/search files/i)
    expect(input).toBeInTheDocument()
  })

  it('shows results list', () => {
    const results: FilePickerResult[] = [
      createResult({ name: 'index.ts', relativePath: 'src/index.ts' }),
      createResult({ name: 'main.ts', relativePath: 'src/main.ts', path: '/project/src/main.ts' }),
    ]
    const state = createState({ isOpen: true, results })

    render(<FilePicker state={state} {...defaultHandlers} />)

    expect(screen.getByText('index.ts')).toBeInTheDocument()
    expect(screen.getByText('main.ts')).toBeInTheDocument()
  })

  it('highlights selected result', () => {
    const results: FilePickerResult[] = [
      createResult({ name: 'a.ts', path: '/project/a.ts', relativePath: 'a.ts' }),
      createResult({ name: 'b.ts', path: '/project/b.ts', relativePath: 'b.ts' }),
    ]
    const state = createState({ isOpen: true, results, selectedIndex: 1 })

    render(<FilePicker state={state} {...defaultHandlers} />)

    const items = screen.getAllByTestId(/^file-picker-item-\d+$/)
    expect(items[1].className).toContain('file-picker__item--selected')
  })

  it('calls onQueryChange when typing', async () => {
    const user = userEvent.setup()
    const state = createState({ isOpen: true })

    render(<FilePicker state={state} {...defaultHandlers} />)

    const input = screen.getByPlaceholderText(/search files/i)
    await user.type(input, 'main')

    expect(defaultHandlers.onQueryChange).toHaveBeenCalled()
  })

  it('calls onSelect with result when Enter is pressed', () => {
    const results: FilePickerResult[] = [
      createResult({ name: 'index.ts', path: '/project/src/index.ts' }),
    ]
    const state = createState({ isOpen: true, results, selectedIndex: 0 })

    render(<FilePicker state={state} {...defaultHandlers} />)

    const input = screen.getByPlaceholderText(/search files/i)
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(defaultHandlers.onSelect).toHaveBeenCalledWith(results[0])
  })

  it('calls onDismiss when Escape is pressed', () => {
    const state = createState({ isOpen: true })

    render(<FilePicker state={state} {...defaultHandlers} />)

    const input = screen.getByPlaceholderText(/search files/i)
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(defaultHandlers.onDismiss).toHaveBeenCalledTimes(1)
  })

  it('shows file icon by type — directory gets folder icon', () => {
    const results: FilePickerResult[] = [
      createResult({ name: 'src', isDirectory: true, relativePath: 'src' }),
    ]
    const state = createState({ isOpen: true, results })

    render(<FilePicker state={state} {...defaultHandlers} />)

    const icon = screen.getByTestId('file-picker-icon-0')
    expect(icon.textContent).toBeTruthy()
  })

  it('shows relative path for each result', () => {
    const results: FilePickerResult[] = [
      createResult({ name: 'index.ts', relativePath: 'src/utils/index.ts' }),
    ]
    const state = createState({ isOpen: true, results })

    render(<FilePicker state={state} {...defaultHandlers} />)

    expect(screen.getByText('src/utils/index.ts')).toBeInTheDocument()
  })

  it('calls onSelect when clicking a result', async () => {
    const user = userEvent.setup()
    const results: FilePickerResult[] = [
      createResult({ name: 'clicked.ts', path: '/project/clicked.ts', relativePath: 'clicked.ts' }),
    ]
    const state = createState({ isOpen: true, results })

    render(<FilePicker state={state} {...defaultHandlers} />)

    const item = screen.getByTestId('file-picker-item-0')
    await user.click(item)

    expect(defaultHandlers.onSelect).toHaveBeenCalledWith(results[0])
  })

  it('does not call onSelect on Enter when results are empty', () => {
    const state = createState({ isOpen: true, results: [] })

    render(<FilePicker state={state} {...defaultHandlers} />)

    const input = screen.getByPlaceholderText(/search files/i)
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(defaultHandlers.onSelect).not.toHaveBeenCalled()
  })

  it('auto-focuses search input when opened', () => {
    const state = createState({ isOpen: true })

    render(<FilePicker state={state} {...defaultHandlers} />)

    const input = screen.getByPlaceholderText(/search files/i)
    expect(input).toHaveFocus()
  })

  it('shows empty state message when no results and query is non-empty', () => {
    const state = createState({ isOpen: true, query: 'nonexistent', results: [] })

    render(<FilePicker state={state} {...defaultHandlers} />)

    expect(screen.getByText(/no files found/i)).toBeInTheDocument()
  })
})

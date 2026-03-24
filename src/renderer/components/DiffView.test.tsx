import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DiffView } from './DiffView'
import type { DiffViewState, FileDiff, DiffLine } from '@/types/diff'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createDiffLine(overrides: Partial<DiffLine> = {}): DiffLine {
  return {
    type: 'unchanged',
    content: 'some code',
    oldLineNum: 1,
    newLineNum: 1,
    ...overrides,
  }
}

function createFileDiff(overrides: Partial<FileDiff> = {}): FileDiff {
  return {
    filePath: 'src/app.ts',
    oldContent: 'old code',
    newContent: 'new code',
    lines: [
      createDiffLine({ type: 'unchanged', content: 'const a = 1', oldLineNum: 1, newLineNum: 1 }),
      createDiffLine({ type: 'removed', content: 'const b = 2', oldLineNum: 2, newLineNum: null }),
      createDiffLine({ type: 'added', content: 'const b = 3', oldLineNum: null, newLineNum: 2 }),
      createDiffLine({ type: 'unchanged', content: 'const c = 4', oldLineNum: 3, newLineNum: 3 }),
    ],
    additions: 1,
    deletions: 1,
    ...overrides,
  }
}

function createState(overrides: Partial<DiffViewState> = {}): DiffViewState {
  return {
    isOpen: true,
    diffs: [createFileDiff()],
    selectedFileIndex: 0,
    status: 'reviewing',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Default handlers
// ---------------------------------------------------------------------------

const defaultHandlers = {
  onAccept: vi.fn(),
  onReject: vi.fn(),
  onSelectFile: vi.fn(),
  onClose: vi.fn(),
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DiffView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is not visible when state.isOpen is false', () => {
    const state = createState({ isOpen: false })

    const { container } = render(
      <DiffView state={state} {...defaultHandlers} />,
    )

    expect(container.querySelector('.diff-view')).not.toBeInTheDocument()
  })

  it('shows file path header', () => {
    const state = createState()

    render(<DiffView state={state} {...defaultHandlers} />)

    expect(screen.getByText('src/app.ts')).toBeInTheDocument()
  })

  it('shows addition and deletion counts as "+N -N"', () => {
    const diff = createFileDiff({ additions: 3, deletions: 1 })
    const state = createState({ diffs: [diff] })

    render(<DiffView state={state} {...defaultHandlers} />)

    expect(screen.getByText('+3')).toBeInTheDocument()
    expect(screen.getByText('-1')).toBeInTheDocument()
  })

  it('renders added lines with green background class', () => {
    const state = createState()

    render(<DiffView state={state} {...defaultHandlers} />)

    const addedLines = document.querySelectorAll('.diff-line--added')
    expect(addedLines.length).toBeGreaterThan(0)
  })

  it('renders removed lines with red background class', () => {
    const state = createState()

    render(<DiffView state={state} {...defaultHandlers} />)

    const removedLines = document.querySelectorAll('.diff-line--removed')
    expect(removedLines.length).toBeGreaterThan(0)
  })

  it('renders unchanged lines with normal class', () => {
    const state = createState()

    render(<DiffView state={state} {...defaultHandlers} />)

    const unchangedLines = document.querySelectorAll('.diff-line--unchanged')
    expect(unchangedLines.length).toBeGreaterThan(0)
  })

  it('displays line numbers for both old and new sides', () => {
    const lines: DiffLine[] = [
      createDiffLine({ type: 'unchanged', content: 'a', oldLineNum: 1, newLineNum: 1 }),
      createDiffLine({ type: 'removed', content: 'b', oldLineNum: 2, newLineNum: null }),
      createDiffLine({ type: 'added', content: 'c', oldLineNum: null, newLineNum: 2 }),
    ]
    const diff = createFileDiff({ lines })
    const state = createState({ diffs: [diff] })

    render(<DiffView state={state} {...defaultHandlers} />)

    // Old line number gutters
    const gutters = document.querySelectorAll('.diff-gutter')
    expect(gutters.length).toBeGreaterThan(0)
  })

  it('calls onAccept when Accept button is clicked', async () => {
    const user = userEvent.setup()
    const state = createState()

    render(<DiffView state={state} {...defaultHandlers} />)

    const acceptBtn = screen.getByRole('button', { name: /accept/i })
    await user.click(acceptBtn)

    expect(defaultHandlers.onAccept).toHaveBeenCalledTimes(1)
  })

  it('calls onReject when Reject button is clicked', async () => {
    const user = userEvent.setup()
    const state = createState()

    render(<DiffView state={state} {...defaultHandlers} />)

    const rejectBtn = screen.getByRole('button', { name: /reject/i })
    await user.click(rejectBtn)

    expect(defaultHandlers.onReject).toHaveBeenCalledTimes(1)
  })

  it('shows file tabs when multiple diffs are present', () => {
    const diffs = [
      createFileDiff({ filePath: 'src/a.ts' }),
      createFileDiff({ filePath: 'src/b.ts' }),
    ]
    const state = createState({ diffs })

    render(<DiffView state={state} {...defaultHandlers} />)

    expect(screen.getByText('src/a.ts')).toBeInTheDocument()
    expect(screen.getByText('src/b.ts')).toBeInTheDocument()
  })

  it('calls onSelectFile when a file tab is clicked', async () => {
    const user = userEvent.setup()
    const diffs = [
      createFileDiff({ filePath: 'src/a.ts' }),
      createFileDiff({ filePath: 'src/b.ts' }),
    ]
    const state = createState({ diffs, selectedFileIndex: 0 })

    render(<DiffView state={state} {...defaultHandlers} />)

    const tabs = document.querySelectorAll('.diff-tab')
    expect(tabs.length).toBe(2)

    // Click the second tab
    await user.click(tabs[1])

    expect(defaultHandlers.onSelectFile).toHaveBeenCalledWith(1)
  })

  it('has scrollable diff content area', () => {
    const state = createState()

    render(<DiffView state={state} {...defaultHandlers} />)

    const scrollable = document.querySelector('.diff-content-area')
    expect(scrollable).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    const state = createState()

    render(<DiffView state={state} {...defaultHandlers} />)

    const closeBtn = screen.getByRole('button', { name: /close/i })
    await user.click(closeBtn)

    expect(defaultHandlers.onClose).toHaveBeenCalledTimes(1)
  })

  it('highlights the active tab for the selected file', () => {
    const diffs = [
      createFileDiff({ filePath: 'src/a.ts' }),
      createFileDiff({ filePath: 'src/b.ts' }),
    ]
    const state = createState({ diffs, selectedFileIndex: 1 })

    render(<DiffView state={state} {...defaultHandlers} />)

    const tabs = document.querySelectorAll('.diff-tab')
    expect(tabs[1].classList.contains('diff-tab--active')).toBe(true)
    expect(tabs[0].classList.contains('diff-tab--active')).toBe(false)
  })

  it('shows content from the selected file diff', () => {
    const diffs = [
      createFileDiff({
        filePath: 'src/a.ts',
        lines: [createDiffLine({ content: 'file a content', type: 'unchanged' })],
      }),
      createFileDiff({
        filePath: 'src/b.ts',
        lines: [createDiffLine({ content: 'file b content', type: 'unchanged' })],
      }),
    ]
    const state = createState({ diffs, selectedFileIndex: 1 })

    render(<DiffView state={state} {...defaultHandlers} />)

    expect(screen.getByText('file b content')).toBeInTheDocument()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilePreview } from './FilePreview'
import type { FilePreviewState } from '@/types/file-preview'

// ---------------------------------------------------------------------------
// Default state factory
// ---------------------------------------------------------------------------

function createState(overrides: Partial<FilePreviewState> = {}): FilePreviewState {
  return {
    isOpen: true,
    filePath: '/project/src/index.ts',
    fileName: 'index.ts',
    content: 'const x = 1\nconst y = 2\nconst z = 3',
    language: 'typescript',
    isLoading: false,
    error: null,
    lineCount: 3,
    fileSize: 42,
    scrollPosition: 0,
    ...overrides,
  }
}

const defaultProps = {
  state: createState(),
  onClose: vi.fn(),
  onScroll: vi.fn(),
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FilePreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is not visible when isOpen is false', () => {
    const { container } = render(
      <FilePreview
        {...defaultProps}
        state={createState({ isOpen: false })}
      />,
    )

    const panel = container.querySelector('.file-preview')
    expect(panel).toBeNull()
  })

  it('shows file content when loaded', () => {
    const { container } = render(<FilePreview {...defaultProps} />)

    // Content is split across syntax token spans, so check via the line content containers
    const lineContents = container.querySelectorAll('.file-preview__line-content')
    expect(lineContents).toHaveLength(3)
    expect(lineContents[0].textContent).toBe('const x = 1')
    expect(lineContents[1].textContent).toBe('const y = 2')
    expect(lineContents[2].textContent).toBe('const z = 3')
  })

  it('shows file name in the header', () => {
    render(<FilePreview {...defaultProps} />)

    expect(screen.getByTestId('file-preview-filename')).toHaveTextContent('index.ts')
  })

  it('shows line numbers', () => {
    render(<FilePreview {...defaultProps} />)

    const lineNumbers = screen.getAllByTestId('file-preview-line-number')
    expect(lineNumbers).toHaveLength(3)
    expect(lineNumbers[0]).toHaveTextContent('1')
    expect(lineNumbers[1]).toHaveTextContent('2')
    expect(lineNumbers[2]).toHaveTextContent('3')
  })

  it('shows language badge', () => {
    render(<FilePreview {...defaultProps} />)

    const badge = screen.getByTestId('file-preview-language-badge')
    expect(badge).toHaveTextContent('typescript')
  })

  it('shows file size in header', () => {
    render(<FilePreview {...defaultProps} />)

    const sizeEl = screen.getByTestId('file-preview-file-size')
    expect(sizeEl).toHaveTextContent('42 B')
  })

  it('shows human-readable file size for larger files', () => {
    render(
      <FilePreview
        {...defaultProps}
        state={createState({ fileSize: 2048 })}
      />,
    )

    const sizeEl = screen.getByTestId('file-preview-file-size')
    expect(sizeEl).toHaveTextContent('2.0 KB')
  })

  it('shows loading spinner while loading', () => {
    render(
      <FilePreview
        {...defaultProps}
        state={createState({ isLoading: true, content: null })}
      />,
    )

    expect(screen.getByTestId('file-preview-loading')).toBeInTheDocument()
  })

  it('shows error message on failure', () => {
    render(
      <FilePreview
        {...defaultProps}
        state={createState({ error: 'Failed to read file', content: null })}
      />,
    )

    expect(screen.getByTestId('file-preview-error')).toHaveTextContent('Failed to read file')
  })

  it('close button calls onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<FilePreview {...defaultProps} onClose={onClose} />)

    const closeBtn = screen.getByRole('button', { name: /close/i })
    await user.click(closeBtn)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('syntax highlighting applies correct token classes', () => {
    const { container } = render(<FilePreview {...defaultProps} />)

    // Check that at least one keyword token class exists
    const keywordTokens = container.querySelectorAll('.token-keyword')
    expect(keywordTokens.length).toBeGreaterThan(0)
  })

  it('large files show line count in header', () => {
    render(
      <FilePreview
        {...defaultProps}
        state={createState({ lineCount: 500 })}
      />,
    )

    const lineCountEl = screen.getByTestId('file-preview-line-count')
    expect(lineCountEl).toHaveTextContent('500 lines')
  })

  it('shows 1 line for single line count', () => {
    render(
      <FilePreview
        {...defaultProps}
        state={createState({ lineCount: 1, content: 'hello' })}
      />,
    )

    const lineCountEl = screen.getByTestId('file-preview-line-count')
    expect(lineCountEl).toHaveTextContent('1 line')
  })
})

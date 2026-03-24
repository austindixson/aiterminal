import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FileEntry } from '@/types/file-tree'
import { FileTree } from './FileTree'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockEntries: ReadonlyArray<FileEntry> = [
  {
    name: 'src',
    path: '/project/src',
    isDirectory: true,
    isHidden: false,
    size: 0,
    extension: null,
    children: [
      {
        name: 'components',
        path: '/project/src/components',
        isDirectory: true,
        isHidden: false,
        size: 0,
        extension: null,
      },
      {
        name: 'index.ts',
        path: '/project/src/index.ts',
        isDirectory: false,
        isHidden: false,
        size: 256,
        extension: '.ts',
      },
    ],
  },
  {
    name: 'tests',
    path: '/project/tests',
    isDirectory: true,
    isHidden: false,
    size: 0,
    extension: null,
  },
  {
    name: '.gitignore',
    path: '/project/.gitignore',
    isDirectory: false,
    isHidden: true,
    size: 42,
    extension: null,
  },
  {
    name: 'package.json',
    path: '/project/package.json',
    isDirectory: false,
    isHidden: false,
    size: 1024,
    extension: '.json',
  },
  {
    name: 'README.md',
    path: '/project/README.md',
    isDirectory: false,
    isHidden: false,
    size: 512,
    extension: '.md',
  },
]

const defaultProps = {
  cwd: '/project',
  entries: mockEntries,
  isVisible: true,
  onToggle: vi.fn(),
  onFileSelect: vi.fn(),
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FileTree', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders file list when visible', () => {
    render(<FileTree {...defaultProps} />)

    expect(screen.getByText('src')).toBeInTheDocument()
    expect(screen.getByText('tests')).toBeInTheDocument()
    expect(screen.getByText('package.json')).toBeInTheDocument()
    expect(screen.getByText('README.md')).toBeInTheDocument()
  })

  it('is hidden when isVisible is false', () => {
    const { container } = render(<FileTree {...defaultProps} isVisible={false} />)

    const panel = container.querySelector('.file-tree-panel')
    expect(panel).toBeNull()
  })

  it('directories are shown before files', () => {
    render(<FileTree {...defaultProps} />)

    const allEntries = screen.getAllByTestId('file-tree-entry')

    // Find indices of directories and files among visible (non-hidden) entries
    const srcIndex = allEntries.findIndex(el => within(el).queryByText('src'))
    const testsIndex = allEntries.findIndex(el => within(el).queryByText('tests'))
    const packageIndex = allEntries.findIndex(el => within(el).queryByText('package.json'))
    const readmeIndex = allEntries.findIndex(el => within(el).queryByText('README.md'))

    // Directories should come before files
    expect(srcIndex).toBeLessThan(packageIndex)
    expect(testsIndex).toBeLessThan(packageIndex)
    expect(srcIndex).toBeLessThan(readmeIndex)
  })

  it('clicking a directory expands it to show children', async () => {
    const user = userEvent.setup()
    render(<FileTree {...defaultProps} />)

    // Children should not be visible initially
    expect(screen.queryByText('index.ts')).not.toBeInTheDocument()

    // Click the src directory to expand it
    const srcEntry = screen.getByText('src')
    await user.click(srcEntry)

    // Children should now be visible
    expect(screen.getByText('index.ts')).toBeInTheDocument()
    expect(screen.getByText('components')).toBeInTheDocument()
  })

  it('clicking an expanded directory collapses it', async () => {
    const user = userEvent.setup()
    render(<FileTree {...defaultProps} />)

    // Expand
    await user.click(screen.getByText('src'))
    expect(screen.getByText('index.ts')).toBeInTheDocument()

    // Collapse
    await user.click(screen.getByText('src'))
    expect(screen.queryByText('index.ts')).not.toBeInTheDocument()
  })

  it('clicking a file selects it and calls onFileSelect', async () => {
    const user = userEvent.setup()
    const onFileSelect = vi.fn()
    render(<FileTree {...defaultProps} onFileSelect={onFileSelect} />)

    await user.click(screen.getByText('package.json'))

    expect(onFileSelect).toHaveBeenCalledWith('/project/package.json')
  })

  it('selected file is highlighted', async () => {
    const user = userEvent.setup()
    render(<FileTree {...defaultProps} />)

    await user.click(screen.getByText('package.json'))

    const entry = screen.getByText('package.json').closest('[data-testid="file-tree-entry"]')
    expect(entry).toHaveClass('file-tree-entry--selected')
  })

  it('shows file icons based on type', () => {
    render(<FileTree {...defaultProps} />)

    // Each entry should have an icon element
    const icons = screen.getAllByTestId('file-tree-icon')
    expect(icons.length).toBeGreaterThan(0)
  })

  it('hides hidden files by default', () => {
    render(<FileTree {...defaultProps} />)

    // .gitignore is hidden, should not be shown by default
    expect(screen.queryByText('.gitignore')).not.toBeInTheDocument()
  })

  it('shows hidden files when toggle is activated', async () => {
    const user = userEvent.setup()
    render(<FileTree {...defaultProps} />)

    // Click the toggle hidden files button
    const toggleHiddenBtn = screen.getByRole('button', { name: /hidden/i })
    await user.click(toggleHiddenBtn)

    // .gitignore should now be visible
    expect(screen.getByText('.gitignore')).toBeInTheDocument()
  })

  it('indents nested entries', async () => {
    const user = userEvent.setup()
    render(<FileTree {...defaultProps} />)

    // Expand src
    await user.click(screen.getByText('src'))

    // The child entries should have depth data attribute
    const indexTs = screen.getByText('index.ts').closest('[data-testid="file-tree-entry"]')
    expect(indexTs).toHaveAttribute('data-depth', '1')
  })

  it('shows cwd path in header', () => {
    render(<FileTree {...defaultProps} />)

    expect(screen.getByTestId('file-tree-cwd')).toHaveTextContent('/project')
  })

  it('has toggle button to show/hide panel', () => {
    render(<FileTree {...defaultProps} />)

    const toggleBtn = screen.getByRole('button', { name: /toggle file tree/i })
    expect(toggleBtn).toBeInTheDocument()
  })

  it('calls onToggle when toggle button is clicked', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<FileTree {...defaultProps} onToggle={onToggle} />)

    const toggleBtn = screen.getByRole('button', { name: /toggle file tree/i })
    await user.click(toggleBtn)

    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})

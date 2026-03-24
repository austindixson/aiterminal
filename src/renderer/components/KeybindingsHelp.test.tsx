import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KeybindingsHelp } from './KeybindingsHelp'
import type { KeybindingAction } from '@/types/keybindings'
import type { Keybinding } from '@/types/keybindings'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAction(overrides: Partial<Keybinding> & { enabled?: boolean } = {}): KeybindingAction {
  const { enabled = true, ...bindingOverrides } = overrides
  return {
    binding: {
      id: 'test',
      key: 'k',
      meta: true,
      shift: false,
      alt: false,
      ctrl: false,
      description: 'Test shortcut',
      category: 'general',
      ...bindingOverrides,
    },
    handler: vi.fn(),
    enabled,
  }
}

const sampleActions: ReadonlyArray<KeybindingAction> = [
  makeAction({ id: 'cmd-k', key: 'k', meta: true, description: 'Toggle Cmd+K bar', category: 'ai' }),
  makeAction({ id: 'cmd-b', key: 'b', meta: true, description: 'Toggle Chat sidebar', category: 'ai' }),
  makeAction({ id: 'cmd-p', key: 'p', meta: true, description: 'Toggle File picker', category: 'navigation' }),
  makeAction({ id: 'cmd-slash', key: '/', meta: true, description: 'Show keybindings help', category: 'general' }),
  makeAction({ id: 'escape', key: 'Escape', meta: false, shift: false, alt: false, ctrl: false, description: 'Close any open panel', category: 'general' }),
  makeAction({ id: 'cmd-shift-f', key: 'f', meta: true, shift: true, description: 'Toggle File tree', category: 'editor' }),
]

// ---------------------------------------------------------------------------
// Default props
// ---------------------------------------------------------------------------

function createProps(overrides: Record<string, unknown> = {}) {
  return {
    isVisible: false,
    actions: sampleActions,
    onClose: vi.fn(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KeybindingsHelp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // 1. Not visible by default
  // -------------------------------------------------------------------------

  it('is not rendered when isVisible is false', () => {
    const props = createProps({ isVisible: false })
    const { container } = render(<KeybindingsHelp {...props} />)

    expect(container.querySelector('.keybindings-overlay')).not.toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // 2. Shows when triggered
  // -------------------------------------------------------------------------

  it('renders when isVisible is true', () => {
    const props = createProps({ isVisible: true })
    render(<KeybindingsHelp {...props} />)

    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // 3. Lists all keybindings grouped by category
  // -------------------------------------------------------------------------

  it('groups keybindings by category', () => {
    const props = createProps({ isVisible: true })
    render(<KeybindingsHelp {...props} />)

    // Should have category headers
    expect(screen.getByText('General')).toBeInTheDocument()
    expect(screen.getByText('AI')).toBeInTheDocument()
    expect(screen.getByText('Navigation')).toBeInTheDocument()
    expect(screen.getByText('Editor')).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // 4. Shows key combo display
  // -------------------------------------------------------------------------

  it('displays formatted key combinations', () => {
    const props = createProps({ isVisible: true })
    render(<KeybindingsHelp {...props} />)

    // Check for specific key combo pills
    expect(screen.getByText('\u2318K')).toBeInTheDocument()
    expect(screen.getByText('\u2318B')).toBeInTheDocument()
    expect(screen.getByText('\u2318/')).toBeInTheDocument()
    expect(screen.getByText('Esc')).toBeInTheDocument()
    expect(screen.getByText('\u2318\u21e7F')).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // 5. Shows description
  // -------------------------------------------------------------------------

  it('displays descriptions for each keybinding', () => {
    const props = createProps({ isVisible: true })
    render(<KeybindingsHelp {...props} />)

    expect(screen.getByText('Toggle Cmd+K bar')).toBeInTheDocument()
    expect(screen.getByText('Toggle Chat sidebar')).toBeInTheDocument()
    expect(screen.getByText('Toggle File picker')).toBeInTheDocument()
    expect(screen.getByText('Show keybindings help')).toBeInTheDocument()
    expect(screen.getByText('Close any open panel')).toBeInTheDocument()
    expect(screen.getByText('Toggle File tree')).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // 6. Closes on Escape
  // -------------------------------------------------------------------------

  it('calls onClose when Escape is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const props = createProps({ isVisible: true, onClose })

    render(<KeybindingsHelp {...props} />)

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // 7. Closes on click outside (overlay)
  // -------------------------------------------------------------------------

  it('calls onClose when clicking the overlay background', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const props = createProps({ isVisible: true, onClose })

    const { container } = render(<KeybindingsHelp {...props} />)

    const overlay = container.querySelector('.keybindings-overlay')
    expect(overlay).toBeInTheDocument()

    // Click the overlay itself (not the modal content)
    await user.click(overlay!)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // 8. Does not close when clicking inside the modal
  // -------------------------------------------------------------------------

  it('does not close when clicking inside the modal', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const props = createProps({ isVisible: true, onClose })

    const { container } = render(<KeybindingsHelp {...props} />)

    const modal = container.querySelector('.keybindings-modal')
    expect(modal).toBeInTheDocument()

    await user.click(modal!)

    expect(onClose).not.toHaveBeenCalled()
  })
})

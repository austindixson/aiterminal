/**
 * Tests for AutocompleteDropdown — the visual dropdown for tab completion suggestions.
 *
 * TDD: these tests are written BEFORE the implementation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AutocompleteDropdown } from './AutocompleteDropdown'
import type { AutocompleteState } from '@/types/autocomplete'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseSuggestions = [
  { text: 'git status', description: 'Show working tree status', type: 'command' as const, confidence: 0.95 },
  { text: 'Desktop', description: 'directory', type: 'path' as const, confidence: 1.0 },
  { text: '--verbose', description: 'Enable verbose output', type: 'flag' as const, confidence: 0.8 },
  { text: 'git stash pop', description: 'Apply and remove stash', type: 'ai' as const, confidence: 0.7 },
]

const visibleState: AutocompleteState = {
  isVisible: true,
  suggestions: baseSuggestions,
  selectedIndex: 0,
  partialInput: 'git',
  isLoading: false,
}

const hiddenState: AutocompleteState = {
  isVisible: false,
  suggestions: [],
  selectedIndex: 0,
  partialInput: '',
  isLoading: false,
}

const loadingState: AutocompleteState = {
  isVisible: true,
  suggestions: [],
  selectedIndex: 0,
  partialInput: 'git',
  isLoading: true,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AutocompleteDropdown', () => {
  const onAccept = vi.fn()
  const onDismiss = vi.fn()
  const position = { x: 100, y: 200 }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is not visible when state.isVisible is false', () => {
    const { container } = render(
      <AutocompleteDropdown
        state={hiddenState}
        onAccept={onAccept}
        onDismiss={onDismiss}
        position={position}
      />,
    )

    const dropdown = container.querySelector('.autocomplete-dropdown')
    expect(dropdown).toBeNull()
  })

  it('shows suggestion list when visible', () => {
    render(
      <AutocompleteDropdown
        state={visibleState}
        onAccept={onAccept}
        onDismiss={onDismiss}
        position={position}
      />,
    )

    expect(screen.getByTestId('autocomplete-dropdown')).toBeInTheDocument()
    expect(screen.getAllByTestId('autocomplete-item')).toHaveLength(4)
  })

  it('highlights the selected suggestion', () => {
    const stateWithSelection: AutocompleteState = {
      ...visibleState,
      selectedIndex: 1,
    }

    render(
      <AutocompleteDropdown
        state={stateWithSelection}
        onAccept={onAccept}
        onDismiss={onDismiss}
        position={position}
      />,
    )

    const items = screen.getAllByTestId('autocomplete-item')
    expect(items[1]).toHaveClass('autocomplete-item--selected')
  })

  it('does not highlight non-selected items', () => {
    render(
      <AutocompleteDropdown
        state={visibleState}
        onAccept={onAccept}
        onDismiss={onDismiss}
        position={position}
      />,
    )

    const items = screen.getAllByTestId('autocomplete-item')
    expect(items[0]).toHaveClass('autocomplete-item--selected')
    expect(items[1]).not.toHaveClass('autocomplete-item--selected')
    expect(items[2]).not.toHaveClass('autocomplete-item--selected')
  })

  it('calls onAccept with suggestion text when clicked', async () => {
    const user = userEvent.setup()

    render(
      <AutocompleteDropdown
        state={visibleState}
        onAccept={onAccept}
        onDismiss={onDismiss}
        position={position}
      />,
    )

    const items = screen.getAllByTestId('autocomplete-item')
    await user.click(items[1])

    expect(onAccept).toHaveBeenCalledWith('Desktop')
  })

  it('shows suggestion type icon for command type', () => {
    render(
      <AutocompleteDropdown
        state={visibleState}
        onAccept={onAccept}
        onDismiss={onDismiss}
        position={position}
      />,
    )

    const items = screen.getAllByTestId('autocomplete-item')
    const firstIcon = within(items[0]).getByTestId('autocomplete-icon')
    expect(firstIcon).toHaveTextContent('>')
  })

  it('shows suggestion type icon for path type', () => {
    render(
      <AutocompleteDropdown
        state={visibleState}
        onAccept={onAccept}
        onDismiss={onDismiss}
        position={position}
      />,
    )

    const items = screen.getAllByTestId('autocomplete-item')
    const pathIcon = within(items[1]).getByTestId('autocomplete-icon')
    expect(pathIcon).toHaveTextContent('/')
  })

  it('shows suggestion type icon for flag type', () => {
    render(
      <AutocompleteDropdown
        state={visibleState}
        onAccept={onAccept}
        onDismiss={onDismiss}
        position={position}
      />,
    )

    const items = screen.getAllByTestId('autocomplete-item')
    const flagIcon = within(items[2]).getByTestId('autocomplete-icon')
    expect(flagIcon).toHaveTextContent('--')
  })

  it('shows suggestion type icon for ai type', () => {
    render(
      <AutocompleteDropdown
        state={visibleState}
        onAccept={onAccept}
        onDismiss={onDismiss}
        position={position}
      />,
    )

    const items = screen.getAllByTestId('autocomplete-item')
    const aiIcon = within(items[3]).getByTestId('autocomplete-icon')
    // AI icon uses a sparkle character
    expect(aiIcon.textContent).toBeTruthy()
  })

  it('shows description text for each suggestion', () => {
    render(
      <AutocompleteDropdown
        state={visibleState}
        onAccept={onAccept}
        onDismiss={onDismiss}
        position={position}
      />,
    )

    expect(screen.getByText('Show working tree status')).toBeInTheDocument()
    expect(screen.getByText('directory')).toBeInTheDocument()
    expect(screen.getByText('Enable verbose output')).toBeInTheDocument()
  })

  it('shows loading indicator when isLoading is true', () => {
    render(
      <AutocompleteDropdown
        state={loadingState}
        onAccept={onAccept}
        onDismiss={onDismiss}
        position={position}
      />,
    )

    expect(screen.getByTestId('autocomplete-loading')).toBeInTheDocument()
  })

  it('positions dropdown at the specified coordinates', () => {
    render(
      <AutocompleteDropdown
        state={visibleState}
        onAccept={onAccept}
        onDismiss={onDismiss}
        position={{ x: 150, y: 300 }}
      />,
    )

    const dropdown = screen.getByTestId('autocomplete-dropdown')
    expect(dropdown.style.left).toBe('150px')
    expect(dropdown.style.bottom).toBeTruthy()
  })
})

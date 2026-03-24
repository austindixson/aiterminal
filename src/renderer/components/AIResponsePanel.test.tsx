import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AIResponse } from '@/ai/types'
import { AIResponsePanel } from './AIResponsePanel'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockResponse: AIResponse = {
  content: 'The `ls` command lists directory contents.',
  model: 'anthropic/claude-sonnet-4-20250514',
  inputTokens: 42,
  outputTokens: 18,
  latencyMs: 320,
  cost: 0.0002,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AIResponsePanel', () => {
  const onDismiss = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is hidden when no AI response is provided', () => {
    const { container } = render(
      <AIResponsePanel response={null} isLoading={false} onDismiss={onDismiss} />,
    )

    // The panel should not render visible content
    const panel = container.querySelector('.ai-response-panel')
    expect(panel).toBeNull()
  })

  it('shows AI response content when present', () => {
    render(
      <AIResponsePanel response={mockResponse} isLoading={false} onDismiss={onDismiss} />,
    )

    expect(
      screen.getByText('The `ls` command lists directory contents.'),
    ).toBeInTheDocument()
  })

  it('shows model name badge', () => {
    render(
      <AIResponsePanel response={mockResponse} isLoading={false} onDismiss={onDismiss} />,
    )

    expect(screen.getByTestId('model-badge')).toHaveTextContent(
      'anthropic/claude-sonnet-4-20250514',
    )
  })

  it('shows loading spinner when isLoading is true', () => {
    render(
      <AIResponsePanel response={null} isLoading={true} onDismiss={onDismiss} />,
    )

    expect(screen.getByTestId('ai-loading-spinner')).toBeInTheDocument()
  })

  it('can be dismissed via the close button', async () => {
    const user = userEvent.setup()

    render(
      <AIResponsePanel response={mockResponse} isLoading={false} onDismiss={onDismiss} />,
    )

    const dismissBtn = screen.getByRole('button', { name: /dismiss/i })
    await user.click(dismissBtn)

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('shows token count', () => {
    render(
      <AIResponsePanel response={mockResponse} isLoading={false} onDismiss={onDismiss} />,
    )

    expect(screen.getByTestId('token-info')).toHaveTextContent('60')
  })

  it('shows latency', () => {
    render(
      <AIResponsePanel response={mockResponse} isLoading={false} onDismiss={onDismiss} />,
    )

    expect(screen.getByTestId('latency-info')).toHaveTextContent('320ms')
  })

  it('renders as a right-justified card (has ai-response-panel class, not overlay)', () => {
    render(
      <AIResponsePanel response={mockResponse} isLoading={false} onDismiss={onDismiss} />,
    )

    const card = screen.getByTestId('ai-response-card')
    expect(card).toBeInTheDocument()
    expect(card).toHaveClass('ai-response-panel')
  })

  it('appears as a flex child, not a fixed/absolute overlay', () => {
    const { container } = render(
      <AIResponsePanel response={mockResponse} isLoading={false} onDismiss={onDismiss} />,
    )

    const panel = container.querySelector('.ai-response-panel')
    expect(panel).toBeInTheDocument()
    // Panel should not have position: fixed or position: absolute
    // (verified by the absence of those CSS classes from old overlay approach)
    expect(panel?.getAttribute('style')).toBeNull()
  })

  it('has right-aligned meta section for model badge and controls', () => {
    render(
      <AIResponsePanel response={mockResponse} isLoading={false} onDismiss={onDismiss} />,
    )

    const meta = screen.getByTestId('ai-response-meta')
    expect(meta).toBeInTheDocument()
    expect(meta).toHaveClass('ai-response-panel__meta')
  })
})

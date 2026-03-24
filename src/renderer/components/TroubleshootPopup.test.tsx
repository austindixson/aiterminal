import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TroubleshootPopup } from './TroubleshootPopup'
import type { AIResponse } from '@/ai/types'
import type { SessionContext } from '@/types/troubleshoot'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockAIResponse: AIResponse = {
  content: 'The error is caused by a missing dependency.',
  model: 'anthropic/claude-sonnet-4-20250514',
  inputTokens: 42,
  outputTokens: 18,
  latencyMs: 320,
  cost: 0.0002,
}

const mockSessionContext: SessionContext = {
  cwd: '/Users/ghost/project',
  shell: '/bin/zsh',
  env: { PATH: '/usr/bin', HOME: '/Users/ghost' },
  recentEntries: [
    {
      id: 'e1',
      timestamp: Date.now(),
      type: 'command',
      content: 'npm run build',
      exitCode: 1,
    },
    {
      id: 'e2',
      timestamp: Date.now(),
      type: 'stderr',
      content: 'Error: Cannot find module react',
    },
  ],
  errorCount: 1,
  sessionStartTime: Date.now() - 120_000,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TroubleshootPopup', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a pop-out button', () => {
    render(
      <TroubleshootPopup
        initialResponse={null}
        sessionContext={mockSessionContext}
        onClose={onClose}
      />,
    )

    const button = screen.getByRole('button', { name: /troubleshoot/i })
    expect(button).toBeInTheDocument()
  })

  it('clicking pop-out opens the troubleshoot view', async () => {
    const user = userEvent.setup()
    render(
      <TroubleshootPopup
        initialResponse={mockAIResponse}
        sessionContext={mockSessionContext}
        onClose={onClose}
      />,
    )

    const button = screen.getByRole('button', { name: /troubleshoot/i })
    await user.click(button)

    expect(screen.getByTestId('troubleshoot-view')).toBeInTheDocument()
  })

  it('passes current AI response as initial context', async () => {
    const user = userEvent.setup()
    render(
      <TroubleshootPopup
        initialResponse={mockAIResponse}
        sessionContext={mockSessionContext}
        onClose={onClose}
      />,
    )

    const button = screen.getByRole('button', { name: /troubleshoot/i })
    await user.click(button)

    // The initial AI response content should appear in the chat
    expect(
      screen.getByText('The error is caused by a missing dependency.'),
    ).toBeInTheDocument()
  })

  it('closing the view calls onClose', async () => {
    const user = userEvent.setup()
    render(
      <TroubleshootPopup
        initialResponse={mockAIResponse}
        sessionContext={mockSessionContext}
        onClose={onClose}
      />,
    )

    // Open the view
    const openButton = screen.getByRole('button', { name: /troubleshoot/i })
    await user.click(openButton)

    // Close the view
    const closeButton = screen.getByRole('button', { name: /close/i })
    await user.click(closeButton)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not show troubleshoot view before clicking pop-out', () => {
    render(
      <TroubleshootPopup
        initialResponse={mockAIResponse}
        sessionContext={mockSessionContext}
        onClose={onClose}
      />,
    )

    expect(screen.queryByTestId('troubleshoot-view')).not.toBeInTheDocument()
  })

  it('shows session context entries when opening with context', async () => {
    const user = userEvent.setup()
    render(
      <TroubleshootPopup
        initialResponse={null}
        sessionContext={mockSessionContext}
        onClose={onClose}
      />,
    )

    const button = screen.getByRole('button', { name: /troubleshoot/i })
    await user.click(button)

    // The view should be open and show the troubleshoot panel
    expect(screen.getByTestId('troubleshoot-view')).toBeInTheDocument()
  })
})

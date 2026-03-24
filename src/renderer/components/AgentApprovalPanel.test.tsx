/**
 * Tests for AgentApprovalPanel — the UI component that displays an
 * agent plan and allows the user to approve/reject operations.
 *
 * Written TDD-first: all tests are defined before the implementation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AgentApprovalPanel } from './AgentApprovalPanel'
import type { AgentPlan, FileOperation } from '@/types/agent'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createOperation(
  overrides: Partial<FileOperation> = {},
): FileOperation {
  return {
    id: `op-${Math.random().toString(36).slice(2, 9)}`,
    type: 'create',
    filePath: 'src/example.ts',
    content: 'export const x = 1',
    description: 'Create example file',
    status: 'pending',
    ...overrides,
  }
}

function createTestPlan(
  overrides: Partial<AgentPlan> = {},
): AgentPlan {
  return {
    id: 'plan-test-1',
    description: 'Test agent plan',
    operations: [
      createOperation({ id: 'op-1', filePath: 'src/a.ts', type: 'create', description: 'Create a.ts' }),
      createOperation({ id: 'op-2', filePath: 'src/b.ts', type: 'edit', description: 'Edit b.ts' }),
      createOperation({ id: 'op-3', filePath: 'src/c.ts', type: 'delete', description: 'Delete c.ts' }),
    ],
    status: 'awaiting_approval',
    createdAt: Date.now(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Default props factory
// ---------------------------------------------------------------------------

function createProps(overrides: Record<string, unknown> = {}) {
  return {
    plan: createTestPlan() as AgentPlan | null,
    onApproveAll: vi.fn(),
    onRejectAll: vi.fn(),
    onApproveOperation: vi.fn(),
    onRejectOperation: vi.fn(),
    onExecute: vi.fn(),
    onCancel: vi.fn(),
    isExecuting: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentApprovalPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // 1. Not visible when no plan
  // -------------------------------------------------------------------------

  it('is not visible when plan is null', () => {
    const props = createProps({ plan: null })
    const { container } = render(<AgentApprovalPanel {...props} />)

    expect(container.innerHTML).toBe('')
  })

  // -------------------------------------------------------------------------
  // 2. Shows plan description
  // -------------------------------------------------------------------------

  it('shows the plan description', () => {
    const props = createProps()
    render(<AgentApprovalPanel {...props} />)

    expect(screen.getByText('Test agent plan')).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // 3. Lists all file operations
  // -------------------------------------------------------------------------

  it('lists all file operations', () => {
    const props = createProps()
    render(<AgentApprovalPanel {...props} />)

    expect(screen.getByText('src/a.ts')).toBeInTheDocument()
    expect(screen.getByText('src/b.ts')).toBeInTheDocument()
    expect(screen.getByText('src/c.ts')).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // 4. Each operation shows type badge
  // -------------------------------------------------------------------------

  it('shows type badges for each operation type (create/edit/delete)', () => {
    const props = createProps()
    render(<AgentApprovalPanel {...props} />)

    const badges = screen.getAllByTestId('agent-operation-badge')
    const badgeTexts = badges.map((b) => b.textContent)

    expect(badgeTexts).toContain('create')
    expect(badgeTexts).toContain('edit')
    expect(badgeTexts).toContain('delete')
  })

  // -------------------------------------------------------------------------
  // 5. Each operation shows file path
  // -------------------------------------------------------------------------

  it('displays the file path for each operation', () => {
    const props = createProps()
    render(<AgentApprovalPanel {...props} />)

    expect(screen.getByText('src/a.ts')).toBeInTheDocument()
    expect(screen.getByText('src/b.ts')).toBeInTheDocument()
    expect(screen.getByText('src/c.ts')).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // 6. Approve All button approves all pending ops
  // -------------------------------------------------------------------------

  it('calls onApproveAll when Approve All button is clicked', async () => {
    const user = userEvent.setup()
    const props = createProps()
    render(<AgentApprovalPanel {...props} />)

    const approveAllBtn = screen.getByRole('button', { name: /approve all/i })
    await user.click(approveAllBtn)

    expect(props.onApproveAll).toHaveBeenCalledOnce()
  })

  // -------------------------------------------------------------------------
  // 7. Reject All button rejects all
  // -------------------------------------------------------------------------

  it('calls onRejectAll when Reject All button is clicked', async () => {
    const user = userEvent.setup()
    const props = createProps()
    render(<AgentApprovalPanel {...props} />)

    const rejectAllBtn = screen.getByRole('button', { name: /reject all/i })
    await user.click(rejectAllBtn)

    expect(props.onRejectAll).toHaveBeenCalledOnce()
  })

  // -------------------------------------------------------------------------
  // 8. Individual approve per operation
  // -------------------------------------------------------------------------

  it('calls onApproveOperation with the operation ID when individual approve is clicked', async () => {
    const user = userEvent.setup()
    const props = createProps()
    render(<AgentApprovalPanel {...props} />)

    const approveButtons = screen.getAllByRole('button', { name: /^approve$/i })
    await user.click(approveButtons[0])

    expect(props.onApproveOperation).toHaveBeenCalledWith('op-1')
  })

  // -------------------------------------------------------------------------
  // 9. Individual reject per operation
  // -------------------------------------------------------------------------

  it('calls onRejectOperation with the operation ID when individual reject is clicked', async () => {
    const user = userEvent.setup()
    const props = createProps()
    render(<AgentApprovalPanel {...props} />)

    const rejectButtons = screen.getAllByRole('button', { name: /^reject$/i })
    await user.click(rejectButtons[0])

    expect(props.onRejectOperation).toHaveBeenCalledWith('op-1')
  })

  // -------------------------------------------------------------------------
  // 10. Shows status badges
  // -------------------------------------------------------------------------

  it('shows status badges with correct labels', () => {
    const plan = createTestPlan({
      operations: [
        createOperation({ id: 'op-a', status: 'pending', filePath: 'src/pending.ts' }),
        createOperation({ id: 'op-b', status: 'approved', filePath: 'src/approved.ts' }),
        createOperation({ id: 'op-c', status: 'rejected', filePath: 'src/rejected.ts' }),
        createOperation({ id: 'op-d', status: 'applied', filePath: 'src/applied.ts' }),
      ],
    })
    const props = createProps({ plan })
    render(<AgentApprovalPanel {...props} />)

    const statusBadges = screen.getAllByTestId('agent-status-badge')
    const statusTexts = statusBadges.map((b) => b.textContent)

    expect(statusTexts).toContain('pending')
    expect(statusTexts).toContain('approved')
    expect(statusTexts).toContain('rejected')
    expect(statusTexts).toContain('applied')
  })

  // -------------------------------------------------------------------------
  // 11. Shows execution progress
  // -------------------------------------------------------------------------

  it('shows execution progress when isExecuting is true', () => {
    const plan = createTestPlan({ status: 'executing' })
    const props = createProps({ plan, isExecuting: true })
    render(<AgentApprovalPanel {...props} />)

    expect(screen.getByTestId('agent-progress')).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // 12. Cancel button cancels the plan
  // -------------------------------------------------------------------------

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup()
    const props = createProps()
    render(<AgentApprovalPanel {...props} />)

    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    await user.click(cancelBtn)

    expect(props.onCancel).toHaveBeenCalledOnce()
  })

  // -------------------------------------------------------------------------
  // 13. Disabled controls during execution
  // -------------------------------------------------------------------------

  it('disables approve/reject buttons during execution', () => {
    const plan = createTestPlan({ status: 'executing' })
    const props = createProps({ plan, isExecuting: true })
    render(<AgentApprovalPanel {...props} />)

    const approveAllBtn = screen.getByRole('button', { name: /approve all/i })
    const rejectAllBtn = screen.getByRole('button', { name: /reject all/i })

    expect(approveAllBtn).toBeDisabled()
    expect(rejectAllBtn).toBeDisabled()
  })

  // -------------------------------------------------------------------------
  // 14. Execute button calls onExecute
  // -------------------------------------------------------------------------

  it('calls onExecute when Execute button is clicked', async () => {
    const user = userEvent.setup()
    const props = createProps()
    render(<AgentApprovalPanel {...props} />)

    const executeBtn = screen.getByRole('button', { name: /execute/i })
    await user.click(executeBtn)

    expect(props.onExecute).toHaveBeenCalledOnce()
  })
})

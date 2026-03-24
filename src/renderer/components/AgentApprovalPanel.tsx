/**
 * AgentApprovalPanel — glass panel for reviewing and approving/rejecting
 * AI agent file operations.
 *
 * Displays the agent plan with all proposed file operations. Each operation
 * shows a type badge, file path, status badge, and approve/reject buttons.
 * Footer contains bulk actions (Approve All, Reject All, Execute) and cancel.
 */

import type { FC } from 'react'
import type { AgentPlan, FileOperation } from '@/types/agent'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AgentApprovalPanelProps {
  readonly plan: AgentPlan | null
  readonly onApproveAll: () => void
  readonly onRejectAll: () => void
  readonly onApproveOperation: (id: string) => void
  readonly onRejectOperation: (id: string) => void
  readonly onExecute: () => void
  readonly onCancel: () => void
  readonly isExecuting: boolean
}

// ---------------------------------------------------------------------------
// Badge class helpers
// ---------------------------------------------------------------------------

function typeBadgeClass(type: FileOperation['type']): string {
  switch (type) {
    case 'create':
      return 'agent-operation__badge--create'
    case 'edit':
      return 'agent-operation__badge--edit'
    case 'delete':
      return 'agent-operation__badge--delete'
    default:
      return ''
  }
}

function statusBadgeClass(status: FileOperation['status']): string {
  switch (status) {
    case 'pending':
      return 'agent-status--pending'
    case 'approved':
      return 'agent-status--approved'
    case 'rejected':
      return 'agent-status--rejected'
    case 'applied':
      return 'agent-status--applied'
    default:
      return ''
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AgentApprovalPanel: FC<AgentApprovalPanelProps> = ({
  plan,
  onApproveAll,
  onRejectAll,
  onApproveOperation,
  onRejectOperation,
  onExecute,
  onCancel,
  isExecuting,
}) => {
  if (!plan) {
    return null
  }

  return (
    <div className="agent-panel" data-testid="agent-panel">
      {/* Header */}
      <div className="agent-header">
        <div className="agent-header__info">
          <h3 className="agent-header__title">Agent Plan</h3>
          <p className="agent-header__description">{plan.description}</p>
        </div>
        <button
          type="button"
          className="agent-header__cancel"
          onClick={onCancel}
          aria-label="Cancel"
        >
          &#x2715;
        </button>
      </div>

      {/* Operation list */}
      <div className="agent-operations">
        {plan.operations.map((op) => (
          <div key={op.id} className="agent-operation">
            {/* Type badge */}
            <span
              className={`agent-operation__badge ${typeBadgeClass(op.type)}`}
              data-testid="agent-operation-badge"
            >
              {op.type}
            </span>

            {/* File path */}
            <span className="agent-operation__path">{op.filePath}</span>

            {/* Status badge */}
            <span
              className={`agent-status ${statusBadgeClass(op.status)}`}
              data-testid="agent-status-badge"
            >
              {op.status}
            </span>

            {/* Individual approve/reject */}
            {op.status === 'pending' && !isExecuting && (
              <div className="agent-operation__actions">
                <button
                  type="button"
                  className="agent-btn agent-btn--approve"
                  onClick={() => onApproveOperation(op.id)}
                  aria-label="Approve"
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="agent-btn agent-btn--reject"
                  onClick={() => onRejectOperation(op.id)}
                  aria-label="Reject"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Execution progress */}
      {isExecuting && (
        <div className="agent-progress" data-testid="agent-progress">
          <div className="agent-progress__bar" />
          <span className="agent-progress__text">Executing operations...</span>
        </div>
      )}

      {/* Footer controls */}
      <div className="agent-controls">
        <button
          type="button"
          className="agent-btn agent-btn--approve-all"
          onClick={onApproveAll}
          disabled={isExecuting}
          aria-label="Approve All"
        >
          Approve All
        </button>
        <button
          type="button"
          className="agent-btn agent-btn--reject-all"
          onClick={onRejectAll}
          disabled={isExecuting}
          aria-label="Reject All"
        >
          Reject All
        </button>
        <button
          type="button"
          className="agent-btn agent-btn--execute"
          onClick={onExecute}
          disabled={isExecuting}
          aria-label="Execute"
        >
          Execute
        </button>
      </div>
    </div>
  )
}

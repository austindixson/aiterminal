/**
 * useAgent — React hook managing Agent Mode state.
 *
 * Handles the full lifecycle: sending requests to the AI,
 * parsing responses into plans, managing approval state,
 * and executing approved operations via IPC.
 *
 * All state updates are immutable.
 */

import { useState, useCallback, useMemo } from 'react'
import type { AgentState, AgentPlan, FileOperation } from '@/types/agent'
import {
  parseAgentResponse,
  buildAgentPrompt,
  createPlan,
  applyOperation,
} from '@/agent/agent-service'

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseAgentReturn {
  readonly state: AgentState
  readonly startAgent: (request: string, fileContents?: ReadonlyArray<{ path: string; content: string }>) => Promise<void>
  readonly approveAll: () => void
  readonly rejectAll: () => void
  readonly approveOperation: (id: string) => void
  readonly rejectOperation: (id: string) => void
  readonly execute: () => Promise<void>
  readonly cancel: () => void
}

// ---------------------------------------------------------------------------
// Immutable update helpers
// ---------------------------------------------------------------------------

function updateOperationStatus(
  plan: AgentPlan,
  operationId: string,
  status: FileOperation['status'],
): AgentPlan {
  return {
    ...plan,
    operations: plan.operations.map((op) =>
      op.id === operationId ? { ...op, status } : op,
    ),
  }
}

function updateAllOperationStatus(
  plan: AgentPlan,
  status: FileOperation['status'],
): AgentPlan {
  return {
    ...plan,
    operations: plan.operations.map((op) => ({ ...op, status })),
  }
}

function updatePlanStatus(
  plan: AgentPlan,
  status: AgentPlan['status'],
): AgentPlan {
  return { ...plan, status }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAgent(): UseAgentReturn {
  const [isActive, setIsActive] = useState(false)
  const [currentPlan, setCurrentPlan] = useState<AgentPlan | null>(null)
  const [history, setHistory] = useState<ReadonlyArray<AgentPlan>>([])

  // -------------------------------------------------------------------------
  // startAgent — send request to AI, parse response into plan
  // -------------------------------------------------------------------------

  const startAgent = useCallback(
    async (
      request: string,
      fileContents: ReadonlyArray<{ path: string; content: string }> = [],
    ) => {
      const prompt = buildAgentPrompt(request, fileContents)

      const hasElectronAPI =
        typeof window !== 'undefined' &&
        'electronAPI' in window &&
        window.electronAPI?.aiQuery

      if (!hasElectronAPI) return

      const response = await window.electronAPI.aiQuery({
        prompt,
        taskType: 'general',
      })

      const operations = parseAgentResponse(response.content ?? '')
      const plan = createPlan(request, operations)

      setCurrentPlan(plan)
      setIsActive(true)
    },
    [],
  )

  // -------------------------------------------------------------------------
  // approveAll — mark all pending operations as approved
  // -------------------------------------------------------------------------

  const approveAll = useCallback(() => {
    setCurrentPlan((prev) => {
      if (!prev) return prev
      return updateAllOperationStatus(prev, 'approved')
    })
  }, [])

  // -------------------------------------------------------------------------
  // rejectAll — mark all as rejected, cancel plan
  // -------------------------------------------------------------------------

  const rejectAll = useCallback(() => {
    setCurrentPlan((prev) => {
      if (!prev) return prev
      const withRejected = updateAllOperationStatus(prev, 'rejected')
      return updatePlanStatus(withRejected, 'cancelled')
    })
  }, [])

  // -------------------------------------------------------------------------
  // approveOperation — approve a single operation by ID
  // -------------------------------------------------------------------------

  const approveOperation = useCallback((id: string) => {
    setCurrentPlan((prev) => {
      if (!prev) return prev
      return updateOperationStatus(prev, id, 'approved')
    })
  }, [])

  // -------------------------------------------------------------------------
  // rejectOperation — reject a single operation by ID
  // -------------------------------------------------------------------------

  const rejectOperation = useCallback((id: string) => {
    setCurrentPlan((prev) => {
      if (!prev) return prev
      return updateOperationStatus(prev, id, 'rejected')
    })
  }, [])

  // -------------------------------------------------------------------------
  // execute — apply all approved operations, skip rejected
  // -------------------------------------------------------------------------

  const execute = useCallback(async () => {
    if (!currentPlan) return

    // Move plan to executing status
    const executingPlan = updatePlanStatus(currentPlan, 'executing')
    setCurrentPlan(executingPlan)

    const updatedOps: FileOperation[] = []

    for (const op of executingPlan.operations) {
      if (op.status === 'approved') {
        await applyOperation(op)
        updatedOps.push({ ...op, status: 'applied' as const })
      } else {
        updatedOps.push(op)
      }
    }

    const completedPlan: AgentPlan = {
      ...executingPlan,
      operations: updatedOps,
      status: 'complete',
    }

    setCurrentPlan(completedPlan)
    setHistory((prev) => [...prev, completedPlan])
  }, [currentPlan])

  // -------------------------------------------------------------------------
  // cancel — cancel the current plan
  // -------------------------------------------------------------------------

  const cancel = useCallback(() => {
    setCurrentPlan((prev) => {
      if (!prev) return prev
      return updatePlanStatus(prev, 'cancelled')
    })
  }, [])

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const state: AgentState = useMemo(
    () => ({
      isActive,
      currentPlan,
      history,
    }),
    [isActive, currentPlan, history],
  )

  return {
    state,
    startAgent,
    approveAll,
    rejectAll,
    approveOperation,
    rejectOperation,
    execute,
    cancel,
  }
}

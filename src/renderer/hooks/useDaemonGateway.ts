/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/hooks/useDaemonGateway.ts
 * Module: renderer/hooks
 * Purpose: React hook for gateway daemon communication - events, approvals, and goal submission
 * Dependencies: react, electronAPI.onDaemonEvent, electronAPI.daemonApprove, electronAPI.daemonSubmitGoal
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/components/GatewayVoiceStrip.tsx, /Users/ghost/Desktop/aiterminal/src/main/daemon-bridge.ts
 * Keywords: gateway, daemon, ipc, approval, goal-submission, background-agent
 * Last Updated: 2026-03-24
 */

import { useState, useEffect, useCallback } from 'react'

export interface DaemonEventPayload {
  readonly type?: string
  readonly jobId?: string
  readonly phase?: string
  readonly intern?: string | null
  readonly message?: string
  readonly stepId?: string
}

export function useDaemonGateway() {
  const [lastEvent, setLastEvent] = useState<DaemonEventPayload | null>(null)
  const [pendingApproval, setPendingApproval] = useState<{
    jobId: string
    stepId: string
    message: string
    intern: string | null
  } | null>(null)

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.onDaemonEvent) return undefined

    return api.onDaemonEvent((payload: unknown) => {
      const p = payload as DaemonEventPayload
      setLastEvent(p)
      if (p.phase === 'await_approval' && p.jobId && p.stepId) {
        setPendingApproval({
          jobId: p.jobId,
          stepId: p.stepId,
          message: p.message ?? '',
          intern: p.intern ?? null,
        })
      }
      if (p.phase === 'done') {
        setPendingApproval(null)
      }
    })
  }, [])

  const approve = useCallback(async (approved: boolean) => {
    const api = window.electronAPI
    if (!api?.daemonApprove || !pendingApproval) return
    await api.daemonApprove({
      jobId: pendingApproval.jobId,
      stepId: pendingApproval.stepId,
      approved,
    })
    if (approved) setPendingApproval(null)
  }, [pendingApproval])

  const submitGoal = useCallback(async (goal: string) => {
    await window.electronAPI?.daemonSubmitGoal?.(goal)
  }, [])

  const reconnect = useCallback(async () => {
    await window.electronAPI?.daemonReconnect?.()
  }, [])

  return {
    lastEvent,
    pendingApproval,
    approve,
    submitGoal,
    reconnect,
  }
}

/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/components/GatewayVoiceStrip.tsx
 * Module: renderer/components
 * Purpose: Status bar strip showing gateway daemon state and push-to-talk voice input
 * Dependencies: react, @/renderer/hooks/useDaemonGateway, @/renderer/hooks/useVoiceIO
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/hooks/useDaemonGateway.ts, /Users/ghost/Desktop/aiterminal/src/renderer/hooks/useVoiceIO.ts
 * Keywords: gateway, voice, push-to-talk, daemon, approval
 * Last Updated: 2026-03-24
 */

import { useCallback } from 'react'
import type { FC } from 'react'
import { useDaemonGateway } from '@/renderer/hooks/useDaemonGateway'
import { useVoiceIO } from '@/renderer/hooks/useVoiceIO'

/**
 * Gateway daemon status + push-to-talk to submit goals to the background agent.
 */
export const GatewayVoiceStrip: FC = () => {
  const daemon = useDaemonGateway()
  const onVoice = useCallback(
    (text: string) => {
      void daemon.submitGoal(text)
    },
    [daemon],
  )
  const voice = useVoiceIO(onVoice)

  const intern = daemon.lastEvent?.intern
  const phase = daemon.lastEvent?.phase

  return (
    <div className="gateway-voice-strip" data-testid="gateway-voice-strip">
      <span className="gateway-voice-strip__status" title="Background gateway (LaunchAgent + daemon)">
        {intern ? `${intern.toUpperCase()}` : '…'}
        {phase ? ` · ${phase}` : ''}
      </span>
      {daemon.pendingApproval && (
        <span className="gateway-voice-strip__approval">
          <button
            type="button"
            className="gateway-voice-strip__btn"
            onClick={() => void daemon.approve(true)}
          >
            Approve
          </button>
          <button
            type="button"
            className="gateway-voice-strip__btn gateway-voice-strip__btn--muted"
            onClick={() => void daemon.approve(false)}
          >
            Reject
          </button>
        </span>
      )}
      <button
        type="button"
        className={`gateway-voice-strip__mic${voice.listening ? ' gateway-voice-strip__mic--on' : ''}`}
        onMouseDown={() => voice.startListening()}
        onMouseUp={() => voice.stopListening()}
        onMouseLeave={() => voice.stopListening()}
        title="Hold to speak a goal to the gateway"
        aria-label="Voice goal"
      >
        Mic
      </button>
    </div>
  )
}

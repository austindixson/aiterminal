/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/components/GatewayVoiceStrip.tsx
 * Module: renderer/components
 * Purpose: Status bar strip showing gateway daemon state, push-to-talk voice input, and TTS indicator
 * Dependencies: react, @/renderer/hooks/useDaemonGateway, @/renderer/hooks/useVoiceIO
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/hooks/useDaemonGateway.ts, /Users/ghost/Desktop/aiterminal/src/renderer/hooks/useVoiceIO.ts
 * Keywords: gateway, voice, push-to-talk, daemon, approval, tts
 * Last Updated: 2026-03-26
 */

import { useCallback, useState, useEffect } from 'react'
import type { FC } from 'react'
import { useDaemonGateway } from '@/renderer/hooks/useDaemonGateway'
import { useVoiceIO } from '@/renderer/hooks/useVoiceIO'

type TTSBackend = 'elevenlabs' | 'browser' | null

/**
 * Gateway daemon status + push-to-talk to submit goals to the background agent + TTS indicator.
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

  // Track which TTS backend was last used
  const [ttsBackend, setTTSBackend] = useState<TTSBackend>(null)

  useEffect(() => {
    // Listen for TTS events to update the indicator
    const handleTTSStart = () => {
      console.log('[GatewayVoiceStrip] TTS event detected')
    }

    window.addEventListener('ai-response', handleTTSStart)

    // Listen for custom TTS backend events
    const handleElevenLabsTTS = () => {
      console.log('[GatewayVoiceStrip] Setting TTS indicator: ElevenLabs')
      setTTSBackend('elevenlabs')
    }

    const handleBrowserTTS = () => {
      console.log('[GatewayVoiceStrip] Setting TTS indicator: Browser')
      setTTSBackend('browser')
    }

    window.addEventListener('tts-elevenlabs', handleElevenLabsTTS)
    window.addEventListener('tts-browser', handleBrowserTTS)

    return () => {
      window.removeEventListener('ai-response', handleTTSStart)
      window.removeEventListener('tts-elevenlabs', handleElevenLabsTTS)
      window.removeEventListener('tts-browser', handleBrowserTTS)
    }
  }, [])

  const intern = daemon.lastEvent?.intern
  const phase = daemon.lastEvent?.phase

  // TTS backend display
  const ttsDisplay = ttsBackend === 'elevenlabs' ? '✓ ElevenLabs' :
                     ttsBackend === 'browser' ? '• Browser' : null

  return (
    <div className="gateway-voice-strip" data-testid="gateway-voice-strip">
      <span className="gateway-voice-strip__status" title="Background gateway (LaunchAgent + daemon)">
        {intern ? `${intern.toUpperCase()}` : '…'}
        {phase ? ` · ${phase}` : ''}
      </span>

      {/* TTS indicator */}
      {ttsDisplay && (
        <span
          className="gateway-voice-strip__tts"
          title={`Text-to-Speech: ${ttsBackend === 'elevenlabs' ? 'Cloud (high quality)' : 'Browser fallback'}`}
          style={{
            fontSize: '10px',
            fontWeight: 500,
            color: ttsBackend === 'elevenlabs' ? '#4ade80' : 'rgba(255, 255, 255, 0.5)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          {ttsDisplay}
        </span>
      )}

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

/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/hooks/useVoiceIO.ts
 * Module: renderer/hooks
 * Purpose: Web Speech API wrapper for push-to-talk voice input and speech synthesis output
 * Dependencies: react, window.SpeechRecognition, window.speechSynthesis, electronAPI.kokoroTtsSpeak
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/components/GatewayVoiceStrip.tsx, /Users/ghost/Desktop/aiterminal/src/main/kokoro-service.ts
 * Keywords: voice, speech-recognition, speech-synthesis, push-to-talk, web-speech-api, kokoro-tts
 * Last Updated: 2026-03-24
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { ttsLipSyncBridge } from '../vrm-tts-bridge'
import { INTERNS } from '../../intern-config'
import { facialEmoteController, type FacialEmotePreset } from '../vrm-facial-emotes'

/**
 * Web Speech API — push-to-talk input + ElevenLabs TTS output.
 * ElevenLabs is the primary TTS (high quality cloud API).
 * Browser speechSynthesis is fallback only.
 * Kokoro removed - quality issues.
 */

/**
 * Detect appropriate facial emote from text content
 *
 * Analyzes text for emotional sentiment to trigger VRM facial expressions
 * during TTS playback. Returns 'neutral' by default to let auto-blink handle it.
 */
function detectEmoteFromText(text: string): FacialEmotePreset {
  const lower = text.toLowerCase()

  // Positive sentiment → happy
  if (/(great|good|success|perfect|excellent|awesome|wonderful|✓|✅)/.test(lower)) {
    return 'happy'
  }

  // Error/warning sentiment → concerned
  if (/(error|failed|warning|issue|problem|mistake|incorrect)/.test(lower)) {
    return 'concerned'
  }

  // Surprise → surprised
  if (/(wow|amazing|surprising|unexpected|incredible|unbelievable)/.test(lower)) {
    return 'surprised'
  }

  // Questions → thinking
  if (/[?!]/.test(text) || /(what|how|why|when|where|who|can you|could you)/.test(lower)) {
    return 'thinking'
  }

  // Excitement → excited
  if (/(exciting|breakthrough|discovery|found it|yes|got it)/.test(lower)) {
    return 'excited'
  }

  // Default → neutral (let auto-blink handle it)
  return 'neutral'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRec = any

// Audio queue interface
interface QueuedAudio {
  text: string
  internId: string
  voiceId: string
}

export function useVoiceIO(onTranscript?: (text: string) => void, activeIntern?: string | null) {
  const [listening, setListening] = useState(false)
  const [lastTranscript, setLastTranscript] = useState('')
  const recRef = useRef<SpeechRec | null>(null)

  // Audio queue management
  const audioQueueRef = useRef<QueuedAudio[]>([])
  const isPlayingRef = useRef(false)
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const processQueueRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRec
      webkitSpeechRecognition?: new () => SpeechRec
    }
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SR) return undefined
    const rec = new SR()
    rec.continuous = false
    rec.interimResults = false
    rec.lang = 'en-US'
    rec.onresult = (ev: { results: { 0: { 0: { transcript: string } } } }) => {
      const text = ev.results[0]?.[0]?.transcript?.trim() ?? ''
      setLastTranscript(text)
      if (text) onTranscript?.(text)
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    return () => {
      recRef.current = null
    }
  }, [onTranscript])

  const startListening = useCallback(() => {
    const rec = recRef.current
    if (!rec) return
    try {
      setListening(true)
      rec.start()
    } catch {
      setListening(false)
    }
  }, [])

  const stopListening = useCallback(() => {
    const rec = recRef.current
    if (!rec) return
    try {
      rec.stop()
    } catch {
      /* noop */
    }
    setListening(false)
  }, [])

  // Process the audio queue
  const processQueue = useCallback(async () => {
    // If already playing or queue is empty, don't process
    if (isPlayingRef.current || audioQueueRef.current.length === 0) {
      return
    }

    // Get next item from queue
    const nextAudio = audioQueueRef.current.shift()
    if (!nextAudio) return

    isPlayingRef.current = true
    const { text, internId, voiceId } = nextAudio

    console.log('[useVoiceIO] Processing queue item:', text.substring(0, 50), 'for intern:', internId)

    // Detect and trigger facial emote based on content
    const emote = detectEmoteFromText(text)
    console.log('[useVoiceIO] Triggering emote:', emote, 'for text:', text.substring(0, 30))
    if (emote !== 'neutral') {
      facialEmoteController.setEmote(emote)
    }

    const elevenLabsKey = window.env.VITE_ELEVENLABS_API_KEY || import.meta.env.VITE_ELEVENLABS_API_KEY

    if (elevenLabsKey) {
      try {
        window.dispatchEvent(new CustomEvent('tts-elevenlabs'))

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': elevenLabsKey,
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_multilingual_v2',
            output_format: 'mp3_22050_32',
          }),
        })

        if (response.ok) {
          const chunks: Uint8Array[] = []
          const reader = response.body?.getReader()

          if (reader) {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              if (value) chunks.push(value)
            }

            const audioBytes = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0))
            let offset = 0
            for (const chunk of chunks) {
              audioBytes.set(chunk, offset)
              offset += chunk.length
            }

            const audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' })
            const audioUrl = URL.createObjectURL(audioBlob)

            // Play with lip-sync if available
            if (ttsLipSyncBridge['audioContext']) {
              await ttsLipSyncBridge.playWithLipSync(await audioBlob.arrayBuffer());
              URL.revokeObjectURL(audioUrl)

              // Clear facial emote after TTS completes
              if (emote !== 'neutral') {
                facialEmoteController.clearEmote()
              }

              // Continue queue after lip-sync completes
              isPlayingRef.current = false
              processQueueRef.current?.()
            } else {
              // Use Audio element with onended callback for queue processing
              const audio = new Audio(audioUrl)
              currentAudioRef.current = audio

              audio.onended = () => {
                URL.revokeObjectURL(audioUrl)
                currentAudioRef.current = null
                isPlayingRef.current = false

                // Clear facial emote after TTS completes
                if (emote !== 'neutral') {
                  facialEmoteController.clearEmote()
                }

                // Process next item in queue
                processQueueRef.current?.()
              }

              audio.onerror = () => {
                URL.revokeObjectURL(audioUrl)
                currentAudioRef.current = null
                isPlayingRef.current = false

                // Clear facial emote on error
                if (emote !== 'neutral') {
                  facialEmoteController.clearEmote()
                }

                console.error('[useVoiceIO] Audio playback error')
                // Continue processing queue even on error
                processQueueRef.current?.()
              }

              await audio.play()
            }

            return
          }
        }
      } catch (e) {
        console.error('[useVoiceIO] ElevenLabs TTS error:', e)

        // Clear facial emote on error
        if (emote !== 'neutral') {
          facialEmoteController.clearEmote()
        }
      }
    }

    // Fallback to browser speechSynthesis
    if (typeof window.speechSynthesis !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tts-browser'))
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.rate = 1

      u.onend = () => {
        isPlayingRef.current = false

        // Clear facial emote after TTS completes
        if (emote !== 'neutral') {
          facialEmoteController.clearEmote()
        }

        processQueueRef.current?.()
      }

      u.onerror = () => {
        isPlayingRef.current = false

        // Clear facial emote on error
        if (emote !== 'neutral') {
          facialEmoteController.clearEmote()
        }

        console.error('[useVoiceIO] speechSynthesis error')
        processQueueRef.current?.()
      }

      window.speechSynthesis.speak(u)
      return
    }

    // If we get here, TTS failed - continue queue
    isPlayingRef.current = false

    // Clear facial emote on TTS failure
    if (emote !== 'neutral') {
      facialEmoteController.clearEmote()
    }

    processQueueRef.current?.()
  }, [])

  const speak = useCallback(async (text: string) => {
    const t = text?.trim()
    if (!t) {
      console.log('[useVoiceIO] Empty text, skipping')
      return
    }

    console.log('[useVoiceIO] speak() called with:', t.substring(0, 50))

    // Get voice ID for active intern (defaults to Rachel if no intern or intern has no voice configured)
    const internId = activeIntern || 'sora'
    const internConfig = INTERNS[internId]
    const voiceId = internConfig?.elevenLabsVoiceId || '21m00Tcm4TlvDq8ikWAM' // Default to Rachel
    console.log('[useVoiceIO] Queueing TTS for intern:', internId, 'voice:', voiceId)

    // Add to queue instead of playing immediately
    audioQueueRef.current.push({ text: t, internId, voiceId })
    console.log('[useVoiceIO] Queue size:', audioQueueRef.current.length)

    // Try to process queue (will only start if not already playing)
    processQueueRef.current?.()
  }, [activeIntern])

  // Clear the audio queue and stop current playback
  const clearQueue = useCallback(() => {
    console.log('[useVoiceIO] Clearing audio queue')
    audioQueueRef.current = []

    // Stop current audio if playing
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current = null
    }

    // Cancel browser speech synthesis
    if (typeof window.speechSynthesis !== 'undefined') {
      window.speechSynthesis.cancel()
    }

    isPlayingRef.current = false
  }, [])

  // Set up the processQueue ref and cleanup
  useEffect(() => {
    processQueueRef.current = processQueue

    // Cleanup: stop any playing audio and clear queue on unmount
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
        currentAudioRef.current = null
      }
      audioQueueRef.current = []
      isPlayingRef.current = false
    }
  }, [processQueue])

  return {
    listening,
    lastTranscript,
    startListening,
    stopListening,
    speak,
    clearQueue,
  }
}

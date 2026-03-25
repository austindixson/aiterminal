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

/**
 * Web Speech API — push-to-talk input + speechSynthesis output.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRec = any

export function useVoiceIO(onTranscript?: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [lastTranscript, setLastTranscript] = useState('')
  const recRef = useRef<SpeechRec | null>(null)

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

  const speak = useCallback(async (text: string) => {
    const t = text?.trim()
    if (!t) return

    const api = window.electronAPI
    if (api?.kokoroTtsSpeak) {
      try {
        const r = await api.kokoroTtsSpeak(t)
        if (r.ok && r.mimeType && r.dataBase64) {
          const audio = new Audio(`data:${r.mimeType};base64,${r.dataBase64}`)
          await audio.play()
          return
        }
      } catch {
        /* fall through to speechSynthesis */
      }
    }

    if (typeof window.speechSynthesis === 'undefined') return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(t)
    u.rate = 1
    window.speechSynthesis.speak(u)
  }, [])

  return {
    listening,
    lastTranscript,
    startListening,
    stopListening,
    speak,
  }
}

// Voice intake controller: the browser does speech-to-text; the server receives
// TEXT ONLY; MiniMax only structures that text into capture fields. Degrades
// gracefully — if the browser can't transcribe we report `unsupported`; if the
// server can't structure we still hand back the raw words so the mic always does
// something useful. The MiniMax key stays server-side; no audio is uploaded by us.

import { useCallback, useEffect, useRef, useState } from 'react'

export type VoiceState = 'idle' | 'listening' | 'processing' | 'success' | 'error' | 'unsupported'

export interface VoiceFields {
  outcome?: string
  description?: string
  safetyRules?: string[]
  domain?: string
  embodiment?: string
}

// Minimal typings for the (non-standard) Web Speech API — avoids `any`.
interface SRAlternative {
  transcript: string
}
interface SRResult {
  0: SRAlternative
  isFinal: boolean
}
interface SRResultList {
  length: number
  [index: number]: SRResult
}
interface SREvent {
  results: SRResultList
}
interface SRErrorEvent {
  error: string
}
interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: (e: SREvent) => void
  onerror: (e: SRErrorEvent) => void
  onend: () => void
  start: () => void
  stop: () => void
  abort: () => void
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

const MAX_LISTEN_MS = 30000

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function useVoiceWorkflow(onFields: (fields: VoiceFields, opts: { fallback: boolean }) => void) {
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)

  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const transcriptRef = useRef('')
  const finalizedRef = useRef(false)
  const tickRef = useRef<number | null>(null)
  const autoStopRef = useRef<number | null>(null)

  const supported = getRecognitionCtor() !== null

  const clearTimers = useCallback(() => {
    if (tickRef.current) window.clearInterval(tickRef.current)
    if (autoStopRef.current) window.clearTimeout(autoStopRef.current)
    tickRef.current = null
    autoStopRef.current = null
  }, [])

  const structure = useCallback(
    async (text: string) => {
      setState('processing')
      try {
        const resp = await fetch('/api/voice/structure', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ transcript: text }),
        })
        const data = (await resp.json()) as
          | { ok: true; fields: Required<VoiceFields> }
          | { ok: false }
          | null
        if (resp.ok && data && data.ok) {
          onFields(data.fields, { fallback: false })
          setState('success')
          return
        }
      } catch {
        // fall through to raw-transcript fallback
      }
      // Graceful fallback: keep the user's words even if structuring is unavailable.
      onFields({ outcome: text }, { fallback: true })
      setState('success')
    },
    [onFields],
  )

  const finalize = useCallback(() => {
    if (finalizedRef.current) return
    finalizedRef.current = true
    clearTimers()
    const text = transcriptRef.current.trim()
    if (!text) {
      setState('idle')
      return
    }
    void structure(text)
  }, [clearTimers, structure])

  const stop = useCallback(() => {
    try {
      recRef.current?.stop()
    } catch {
      finalize()
    }
  }, [finalize])

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      setState('unsupported')
      return
    }
    if (state === 'listening' || state === 'processing') return
    setError(null)
    setTranscript('')
    transcriptRef.current = ''
    finalizedRef.current = false
    setSeconds(0)

    const rec = new Ctor()
    rec.lang = 'en-US'
    rec.interimResults = true
    rec.continuous = true
    rec.onresult = (e: SREvent) => {
      let text = ''
      for (let i = 0; i < e.results.length; i += 1) text += e.results[i][0].transcript
      transcriptRef.current = text
      setTranscript(text)
    }
    rec.onerror = (e: SRErrorEvent) => {
      clearTimers()
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError('Microphone permission is blocked. Allow mic access, or type instead.')
        setState('error')
        finalizedRef.current = true
      } else if (e.error === 'no-speech') {
        setState('idle')
        finalizedRef.current = true
      } else {
        // Other errors still keep whatever was heard.
        finalize()
      }
    }
    rec.onend = () => finalize()

    recRef.current = rec
    try {
      rec.start()
      setState('listening')
      tickRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000)
      autoStopRef.current = window.setTimeout(() => stop(), MAX_LISTEN_MS)
    } catch {
      setError('Could not start the microphone. Try again, or type instead.')
      setState('error')
    }
  }, [state, clearTimers, finalize, stop])

  const reset = useCallback(() => {
    clearTimers()
    try {
      recRef.current?.abort()
    } catch {
      /* noop */
    }
    recRef.current = null
    finalizedRef.current = false
    transcriptRef.current = ''
    setState('idle')
    setTranscript('')
    setError(null)
    setSeconds(0)
  }, [clearTimers])

  useEffect(() => {
    return () => {
      clearTimers()
      try {
        recRef.current?.abort()
      } catch {
        /* noop */
      }
    }
  }, [clearTimers])

  return { state, transcript, error, seconds, supported, start, stop, reset }
}

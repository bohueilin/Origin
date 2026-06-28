import { useCallback, useEffect, useRef, useState } from 'react'

// Minimal Web Speech API typing (not in lib.dom). Free, browser-native, no key.
// Branded in the UI as voice dictation; VoiceCursor is featured as the premium path.
interface SpeechAlt { transcript: string }
interface SpeechResult { 0: SpeechAlt; isFinal: boolean }
interface SpeechResultList { length: number; [i: number]: SpeechResult }
interface SpeechEvent { resultIndex: number; results: SpeechResultList }
interface SpeechErrEvent { error: string }
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechEvent) => void) | null
  onerror: ((e: SpeechErrEvent) => void) | null
  onend: (() => void) | null
}
type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export interface VoiceState {
  supported: boolean
  listening: boolean
  transcript: string
  error: string | null
  start(): void
  stop(): void
  reset(): void
}

/** Live speech-to-text via the browser. onFinal fires once with the settled transcript. */
export function useVoiceInput(onFinal?: (text: string) => void): VoiceState {
  const [supported] = useState(() => recognitionCtor() !== null)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<Recognition | null>(null)
  const onFinalRef = useRef(onFinal)
  useEffect(() => {
    onFinalRef.current = onFinal
  }, [onFinal])

  const stop = useCallback(() => recRef.current?.stop(), [])

  const start = useCallback(() => {
    if (listening) return
    const Ctor = recognitionCtor()
    if (!Ctor) {
      setError('Voice input is not supported in this browser — try Chrome, Edge, or Safari.')
      return
    }
    const rec = new Ctor()
    recRef.current = rec
    rec.lang = 'en-US'
    rec.continuous = false
    rec.interimResults = true
    setError(null)
    setTranscript('')
    let finalText = ''
    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText += r[0].transcript
        else interim += r[0].transcript
      }
      setTranscript(`${finalText} ${interim}`.trim())
    }
    rec.onerror = (e) => {
      setError(e.error === 'not-allowed' ? 'Microphone permission was denied.' : `Voice error: ${e.error}`)
      setListening(false)
    }
    rec.onend = () => {
      setListening(false)
      const t = finalText.trim()
      if (t) {
        setTranscript(t)
        onFinalRef.current?.(t)
      }
    }
    rec.start()
    setListening(true)
  }, [listening])

  const reset = useCallback(() => {
    setTranscript('')
    setError(null)
  }, [])

  useEffect(() => () => recRef.current?.abort(), [])

  return { supported, listening, transcript, error, start, stop, reset }
}

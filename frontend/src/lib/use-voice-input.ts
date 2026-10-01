import { useEffect, useRef, useState } from "react"

interface SpeechWindow extends Window {
  SpeechRecognition?: new () => SpeechRecognitionInstance
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance
}

interface SpeechRecognitionInstance {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

/**
 * Real voice dictation via Web Speech API. Appends final transcripts
 * through onText. `supported` is false where the API doesn't exist.
 */
export function useVoiceInput(onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [supported] = useState(
    () =>
      typeof window !== "undefined" &&
      !!(
        (window as unknown as SpeechWindow).SpeechRecognition ??
        (window as unknown as SpeechWindow).webkitSpeechRecognition
      )
  )
  const recRef = useRef<SpeechRecognitionInstance | null>(null)
  const cbRef = useRef(onText)
  // Keep the latest callback without reading the ref during render.
  useEffect(() => {
    cbRef.current = onText
  }, [onText])

  useEffect(
    () => () => {
      try {
        recRef.current?.stop()
      } catch {
        /* noop */
      }
    },
    []
  )

  const toggle = () => {
    if (!supported) return
    if (listening) {
      try {
        recRef.current?.stop()
      } catch {
        /* noop */
      }
      setListening(false)
      return
    }
    const w = window as unknown as SpeechWindow
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = "en-US"
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (e) => {
      const last = e.results[e.results.length - 1]?.[0]?.transcript.trim()
      if (last) cbRef.current(last)
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }

  return { listening, supported, toggle }
}

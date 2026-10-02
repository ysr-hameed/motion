import { useAgentChat } from "@cloudflare/ai-chat/react"
import { useAgent } from "agents/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import "./styles.css"

/**
 * Where the backend Worker lives. Empty means "same origin", which is the
 * production case once the Worker serves the built assets. In local dev the
 * Worker runs on 8787 while Vite serves 5173, so VITE_API_HOST points across.
 */
const API_HOST = import.meta.env.VITE_API_HOST ?? ""

/**
 * One Durable Object instance per session id, so a reload reattaches to the
 * same transcript instead of silently starting a new conversation.
 */
function useSessionId() {
  const [id] = useState(() => {
    const key = "motion.session"
    const existing = localStorage.getItem(key)
    if (existing) return existing
    const fresh = crypto.randomUUID()
    localStorage.setItem(key, fresh)
    return fresh
  })
  return id
}

function Bubble({ message }: { message: { role: string; parts: unknown[] } }) {
  return (
    <div className={`bubble bubble--${message.role}`}>
      {message.parts.map((part, i) => {
        const p = part as { type?: string; text?: string }
        if (p?.type === "text" && p.text) return <p key={i}>{p.text}</p>
        if (p?.type === "reasoning" && p.text) {
          return (
            <details key={i} className="reasoning">
              <summary>thinking</summary>
              <pre>{p.text}</pre>
            </details>
          )
        }
        return null
      })}
    </div>
  )
}

function App() {
  const sessionId = useSessionId()
  const agent = useAgent({ agent: "Chat", name: sessionId, host: API_HOST })
  const { messages, sendMessage, clearHistory, status, isStreaming, isRecovering } =
    useAgentChat({ agent })

  const [draft, setDraft] = useState("")
  const bottom = useRef<HTMLDivElement>(null)

  const busy = status === "submitted" || status === "streaming"

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const label = useMemo(() => {
    if (isRecovering) return "recovering…"
    if (status === "submitted") return "thinking…"
    if (isStreaming) return "writing…"
    return null
  }, [isRecovering, status, isStreaming])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    setDraft("")
    sendMessage({ text })
  }

  return (
    <main className="app">
      <header className="head">
        <h1>SlyxUp Motion</h1>
        <button className="ghost" onClick={clearHistory} disabled={isStreaming}>
          New chat
        </button>
      </header>

      <section className="thread">
        {messages.length === 0 && (
          <p className="empty">Ask something. The transcript is kept per session.</p>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
        {label && <p className="status">{label}</p>}
        {status === "error" && (
          <p className="status status--error">Something broke — press Retry.</p>
        )}
        <div ref={bottom} />
      </section>

      <form className="composer" onSubmit={submit}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit(e)
            }
          }}
          placeholder="Send a message…"
          rows={1}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !draft.trim()}>
          Send
        </button>
      </form>
    </main>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
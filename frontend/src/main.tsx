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

/** Renders one tool call: what was asked, and what came back. */
function ToolPart({ part }: { part: Record<string, unknown> }) {
  const name = String(part.toolName ?? String(part.type).replace(/^tool-/, ""))
  const state = String(part.state ?? "pending")
  const input = part.input as Record<string, unknown> | undefined
  const output = part.output as Record<string, unknown> | undefined
  const error = part.errorText as string | undefined

  const done = state === "output-available" || state === "output-error"
  const failed = state === "output-error"

  return (
    <div className={`tool ${failed ? "tool--error" : ""}`}>
      <span className="tool__name">{name}</span>
      {input && Object.keys(input).length > 0 && (
        <code className="tool__input">{Object.values(input).join(", ")}</code>
      )}
      {done && output && (
        <span className="tool__output">
          {error ??
            Object.entries(output)
              .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
              .join(" · ")}
        </span>
      )}
      {!done && <span className="tool__state">{state}</span>}
    </div>
  )
}

function Bubble({ message }: { message: { role: string; parts: unknown[] } }) {
  return (
    <div className={`bubble bubble--${message.role}`}>
      {message.parts.map((part, i) => {
        const p = part as Record<string, unknown>
        const text = typeof p?.text === "string" ? p.text : null
        if (p?.type === "text" && text) return <p key={i}>{text}</p>
        if (p?.type === "reasoning" && text) {
          return (
            <details key={i} className="reasoning">
              <summary>thinking</summary>
              <pre>{text}</pre>
            </details>
          )
        }
        if (typeof p?.type === "string" && p.type.startsWith("tool-")) {
          return <ToolPart key={i} part={p} />
        }
        return null
      })}
    </div>
  )
}

/**
 * A turn that produces nothing for this long is treated as failed.
 *
 * The gateway answers a rate limit with "Retry after 60s", and a model call can
 * stall outright. Without a deadline the turn stays in `streaming` and the UI
 * looks frozen forever. 45s is far longer than a normal first token, so this
 * only fires on a genuinely stuck turn.
 */
const STALL_MS = 45_000

function App() {
  const sessionId = useSessionId()
  const agent = useAgent({ agent: "Chat", name: sessionId, host: API_HOST })
  const {
    messages,
    sendMessage,
    clearHistory,
    stop,
    status,
    isStreaming,
    isRecovering,
  } = useAgentChat({ agent })

  const [draft, setDraft] = useState("")
  const [stalled, setStalled] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)

  const busy = status === "submitted" || status === "streaming"
  const lastActivity = useRef(Date.now())

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" })
    // Any new message part means the turn is making progress.
    lastActivity.current = Date.now()
  }, [messages])

  // Stall watchdog. Only runs while a turn is in flight.
  useEffect(() => {
    if (!busy) return
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current > STALL_MS) {
        stop()
        setStalled(true)
      }
    }, 5_000)
    return () => clearInterval(timer)
  }, [busy, stop])

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
    setStalled(false)
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
        {stalled && !busy && (
          <p className="status status--error">
            The model stopped responding — that was a stall, not your fault. Send again to
            retry on the next model in the chain.
          </p>
        )}
        {status === "error" && (
          <p className="status status--error">Something broke — send again to retry.</p>
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
        {busy ? (
          <button type="button" className="stop" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!draft.trim()}>
            Send
          </button>
        )}
      </form>
    </main>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
import { useAgentChat } from "@cloudflare/ai-chat/react"
import { useAgent } from "agents/react"
import { useCallback, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { Conversation } from "~/components/Conversation"
import { Stage } from "~/components/Stage"
import { fetchComposition, type MotionPlan } from "~/lib/composition"
import { DEMO_CODE, DEMO_PLAN } from "~/lib/demo"
import "./styles.css"

/**
 * One Durable Object instance per session, so a reload reattaches to the same
 * transcript and the same cut rather than silently starting over.
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

const API_HOST = import.meta.env.VITE_API_HOST ?? ""

/**
 * `?demo=1` renders a hand-written composition through the real compile path.
 * It is how the browser compiler gets smoke-tested without spending model
 * quota, and how the stage is checked when the agent has produced nothing yet.
 */
const DEMO = new URLSearchParams(location.search).has("demo")

function App() {
  const sessionId = useSessionId()
  const agent = useAgent({ agent: "Chat", name: sessionId, host: API_HOST })
  const chat = useAgentChat({ agent })

  const [code, setCode] = useState("")
  const [plan, setPlan] = useState<MotionPlan | null>(null)
  const [version, setVersion] = useState(0)
  const [reloadKey, setReloadKey] = useState("0")
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const next = await fetchComposition(sessionId, signal)
        setCode(next.code)
        setPlan(next.plan)
        setVersion(next.version)
        // The version is the cache key: a new version is a new cut, so the
        // stage recompiles from scratch rather than reusing a stale component.
        setReloadKey(String(next.version))
        setLoadError(null)
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return
        setLoadError(err instanceof Error ? err.message : String(err))
      }
    },
    [sessionId]
  )

  useEffect(() => {
    if (DEMO) {
      setCode(DEMO_CODE)
      setPlan(DEMO_PLAN)
      setVersion(1)
      setReloadKey("demo")
      return
    }
    const ac = new AbortController()
    void reload(ac.signal)
    return () => ac.abort()
  }, [reload])

  // The agent is the only writer of the composition, so poll while a turn is in
  // flight and settle once it ends. Cheap: two rows out of the Durable
  // Object's own SQLite, and the poll stops the moment the turn closes.
  const busy = chat.status === "submitted" || chat.status === "streaming"
  useEffect(() => {
    if (DEMO || !busy) return
    const t = setInterval(() => void reload(), 3_000)
    return () => clearInterval(t)
  }, [busy, reload])

  return (
    <div className="flex h-full min-h-0 flex-col lg:grid lg:grid-cols-[1fr_400px]">
      <main className="flex min-h-0 min-w-0 flex-col gap-3 p-3 lg:h-full lg:p-4">
        <TopBar version={version} loadError={loadError} />
        <Stage code={code} plan={plan} version={version} reloadKey={reloadKey} />
      </main>
      <Conversation chat={chat} onFiles={() => {}} />
    </div>
  )
}

function TopBar({ version, loadError }: { version: number; loadError: string | null }) {
  return (
    <header className="flex shrink-0 items-center gap-3">
      <span className="text-[13px] font-semibold tracking-tight">SlyxUp Motion</span>
      <span className="eyebrow">studio</span>
      <div className="ml-auto flex items-center gap-2 text-[10px] text-dim">
        {loadError ? (
          <span className="text-bad">offline — {loadError}</span>
        ) : (
          <span className="font-mono">{version > 0 ? `cut v${version}` : "no cut"}</span>
        )}
      </div>
    </header>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
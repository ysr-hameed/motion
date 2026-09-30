import { useEffect, useState } from "react"
import type { UIMessage } from "ai"
import { getAuthToken } from "./auth"

const API = import.meta.env.VITE_API_URL as string | undefined

export interface AgentConversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

function headers(): Record<string, string> {
  const token = getAuthToken()
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

/**
 * Every agent call gets a hard deadline. A request that never answers used
 * to leave `listed` false forever, which held the chat on a spinner with no
 * way forward — the same reason `apiFetch` aborts on a timer. Twenty seconds
 * is well above a cold Worker start, so this only ever fires on a stall.
 */
const AGENT_TIMEOUT_MS = 20_000

const TIMEOUT_MESSAGE = "The backend didn't respond — check that it's running."

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API) throw new Error("Backend not configured")
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  if (init?.signal) {
    if (init.signal.aborted) ctrl.abort()
    else init.signal.addEventListener("abort", onAbort, { once: true })
  }
  const timer = setTimeout(() => ctrl.abort(), AGENT_TIMEOUT_MS)
  try {
    const res = await fetch(`${API}${path}`, { ...init, signal: ctrl.signal, headers: headers() })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error ?? `Request failed (${res.status})`)
    }
    return (await res.json()) as T
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error(TIMEOUT_MESSAGE)
    throw e
  } finally {
    clearTimeout(timer)
    init?.signal?.removeEventListener("abort", onAbort)
  }
}

export function agentConfigured(): boolean {
  return !!API
}

export async function listAgentConversations(projectId: string): Promise<AgentConversation[]> {
  const res = await req<{ conversations: AgentConversation[] }>(
    `/api/agent/conversations/${projectId}`
  )
  return res.conversations
}

export async function createAgentConversation(
  projectId: string,
  title?: string
): Promise<AgentConversation> {
  const res = await req<{ conversation: AgentConversation }>("/api/agent/conversations", {
    method: "POST",
    body: JSON.stringify({ projectId, title }),
  })
  return res.conversation
}

export async function loadAgentMessages(
  projectId: string,
  conversationId: string
): Promise<UIMessage[]> {
  const res = await req<{
    messages: Array<{ id: string; role: string; parts: unknown }>
  }>(`/api/agent/conversations/${projectId}/${conversationId}/messages`)
  return res.messages.map((m) => ({
    id: m.id,
    role: m.role as UIMessage["role"],
    parts: (Array.isArray(m.parts) ? m.parts : []) as UIMessage["parts"],
  }))
}

/** Seed a fresh agent conversation from the legacy plain-text thread. */
export async function seedAgentConversation(
  conversationId: string,
  thread: Array<{ role: string; text: string }>
): Promise<void> {
  const clean = thread
    .filter((m) => (m.role === "user" || m.role === "ai") && m.text.trim())
    .slice(-20)
    .map((m) => ({ role: m.role === "user" ? "user" : "assistant", text: m.text.slice(0, 2000) }))
  if (clean.length === 0) return
  await req(`/api/agent/conversations/${conversationId}/seed`, {
    method: "POST",
    body: JSON.stringify({ messages: clean }),
  })
}

/** Report a real player compile/render error for the agent recovery loop. */
export async function reportRenderError(
  projectId: string,
  errors: string[],
  versionNo?: number
): Promise<void> {
  if (!API) return
  try {
    await req("/api/agent/errors", {
      method: "POST",
      body: JSON.stringify({ projectId, errors: errors.slice(0, 12), versionNo }),
    })
  } catch {
    /* advisory — never blocks the player */
  }
}

export function useAgentConversations(serverProjectId: string | null) {
  const [conversations, setConversations] = useState<AgentConversation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!serverProjectId || !API) {
      setConversations([])
      return
    }
    let live = true
    setLoading(true)
    listAgentConversations(serverProjectId)
      .then((cs) => {
        if (live) {
          setConversations(cs)
          setError(null)
        }
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : "Failed to load chats")
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [serverProjectId])

  return { conversations, setConversations, loading, error }
}

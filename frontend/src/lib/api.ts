import { useEffect, useState } from "react"
import type { Artifact } from "./artifact"
import type { ProjectState } from "./use-motion-studio"
import { getAuthToken } from "./auth"

const KEY = "motion:projects:v1"
const API = import.meta.env.VITE_API_URL as string | undefined

export interface DirectorStreamEvent {
  type: "stage" | "progress" | "text" | "output" | "final" | "error"
  stage?: string
  tokens?: number
  /** Model output so far — the live progress signal. */
  chars?: number
  /** Raw model text delta (live stream view). */
  delta?: string
  result?: unknown
  message?: string
}

/** Repair streams cap at ~200s (the backend repairer budget) — a hung model returns null, never hangs the UI. */
const STREAM_TIMEOUT_MS = 220_000

/** Plain JSON calls (projects mirror) cap at 20s. */
const FETCH_TIMEOUT_MS = 20_000

/**
 * Backend client with local fallback. When VITE_API_URL answers /api/health,
 * AI calls go to the real director; otherwise the caller falls
 * back to the on-device simulation. Returns null on any failure.
 */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!API) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const token = getAuthToken()
    const res = await fetch(`${API}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export interface AiStatus {
  reachable: boolean
  aiConfigured: boolean
  model?: string | null
}

let statusCache: { at: number; value: AiStatus } | null = null

/** Backend reachability + whether the director has an API key. Cached 30s. */
export async function apiStatus(): Promise<AiStatus> {
  if (!API) return { reachable: false, aiConfigured: false, model: null }
  if (statusCache && Date.now() - statusCache.at < 30_000)
    return statusCache.value
  try {
    const res = await fetch(`${API}/api/health`)
    const body = res.ok
      ? ((await res.json()) as { aiConfigured?: boolean; model?: string })
      : null
    const value: AiStatus = {
      reachable: res.ok,
      aiConfigured: res.ok && body?.aiConfigured === true,
      model: res.ok ? (body?.model ?? null) : null,
    }
    statusCache = { at: Date.now(), value }
    return value
  } catch {
    const value: AiStatus = { reachable: false, aiConfigured: false, model: null }
    statusCache = { at: Date.now(), value }
    return value
  }
}

/** Live AI status for UI badges — polls the cached health check. */
export function useAiStatus(): AiStatus & { checking: boolean } {
  const [state, setState] = useState<AiStatus & { checking: boolean }>({
    reachable: false,
    aiConfigured: false,
    model: null,
    checking: true,
  })
  useEffect(() => {
    let live = true
    const poll = async () => {
      const v = await apiStatus()
      if (live) setState({ ...v, checking: false })
    }
    void poll()
    const t = setInterval(poll, 30_000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [])
  return state
}

export async function apiHealth(): Promise<boolean> {
  return (await apiStatus()).reachable
}

/**
 * Reads a POST SSE stream (/api/ai/stream) into discrete events.
 * Resolves with the `final` result payload.
 * - Director errors (backend `error` event) THROW with the backend's real
 *   message so the chat shows what the AI actually did — never canned.
 * - Network/offline/timeout still resolves null (caller shows guidance).
 */
export class DirectorError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DirectorError"
  }
}

async function apiStream<T>(
  payload: Record<string, unknown>,
  onEvent?: (e: DirectorStreamEvent) => void
): Promise<T | null> {
  if (!API) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), STREAM_TIMEOUT_MS)
  try {
    const token = getAuthToken()
    const res = await fetch(`${API}/api/ai/stream`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok || !res.body) {
      // Try to surface the backend's JSON error before giving up.
      try {
        const body = (await res.json()) as { error?: string }
        if (body?.error) throw new DirectorError(body.error)
      } catch (e) {
        if (e instanceof DirectorError) throw e
      }
      return null
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ""
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const frames = buf.split("\n\n")
      buf = frames.pop() ?? ""
      for (const frame of frames) {
        let event = "message"
        const dataLines: string[] = []
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim()
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim())
        }
        if (dataLines.length === 0) continue
        let data: DirectorStreamEvent
        try {
          data = JSON.parse(dataLines.join("\n")) as DirectorStreamEvent
        } catch {
          continue
        }
        if (event === "final") return (data.result ?? null) as T | null
        if (event === "error") throw new DirectorError(data.message || "The director failed.")
        onEvent?.({ ...data, type: event as DirectorStreamEvent["type"] })
      }
    }
    return null
  } catch (e) {
    if (e instanceof DirectorError) throw e
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function apiRepair(
  args: {
    code: string
    errors: string[]
    width: number
    height: number
    fps: number
    durationInFrames: number
    prompt?: string
    projectId?: string | null
  },
  onEvent?: (e: DirectorStreamEvent) => void
): Promise<{ code: string; fixed: boolean; warnings?: string[] } | null> {
  if (!(await apiHealth())) return null
  return apiStream<{ code: string; fixed: boolean; warnings?: string[] }>(
    { kind: "repair", ...args },
    onEvent
  )
}

export interface ServerProject {
  id: string
}

export async function apiCreateProject(args: {
  name: string
  prompt: string
  format: string
  style?: string
  durationSecs?: number
}): Promise<ServerProject | null> {
  if (!(await apiHealth())) return null
  const res = await apiFetch<{ project: { id: string } }>(
    "/api/projects",
    { method: "POST", body: JSON.stringify(args) }
  )
  return res ? { id: res.project.id } : null
}

export async function apiRecordVersion(
  serverId: string,
  version: { note?: string; reply?: string; artifact?: Artifact }
): Promise<void> {
  if (!(await apiHealth())) return
  await apiFetch(`/api/projects/${serverId}/versions`, {
    method: "POST",
    body: JSON.stringify({ ...version, motionJson: version.artifact ?? null }),
  })
}

/** Local persistence (used until server sync lands). */
export const api = {
  listProjects(): ProjectState[] {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as ProjectState[]) : []
    } catch {
      return []
    }
  },

  saveProjects(projects: ProjectState[]) {
    try {
      localStorage.setItem(KEY, JSON.stringify(projects))
    } catch {
      try {
        const slim = projects.map((p) => ({
          ...p,
          attachments: p.attachments.map((a) => ({ ...a, dataUrl: "" })),
        }))
        localStorage.setItem(KEY, JSON.stringify(slim))
      } catch {
        /* storage unavailable — session-only mode */
      }
    }
  },
}

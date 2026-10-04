/**
 * Reads the composition and its plan from the agent.
 *
 * The source never travels through the chat transcript: the model does not
 * need it echoed back, and putting a whole composition into the context on
 * every preview is the bloat that made the old implementation expensive.
 */

export interface Beat {
  from: number
  to: number
  what: string
}

export interface MotionPlan {
  title: string
  intent: string
  beats: Beat[]
  ending: string
}

/** The render contract. Shared with the agent so a cut is never guessed at. */
export const CANVAS = { width: 1920, height: 1080, fps: 30, maxFrames: 900 } as const

export interface CompositionState {
  code: string
  plan: MotionPlan | null
  version: number
}

function base(): string {
  // Empty in dev (Vite proxies /agents) and in production when the Worker serves
  // the frontend; set to the Worker host when the two are on separate domains.
  const host = import.meta.env.VITE_API_HOST as string | undefined
  return host ? `https://${host.replace(/^https?:\/\//, "")}` : ""
}

export function agentUrl(instance: string, path: string): string {
  return `${base()}/agents/chat/${instance}/${path}`
}

export async function fetchComposition(
  instance: string,
  signal?: AbortSignal
): Promise<CompositionState> {
  const res = await fetch(agentUrl(instance, "composition"), { signal })
  if (!res.ok) throw new Error(`composition ${res.status}`)
  const data = (await res.json()) as Partial<CompositionState>
  return { code: data.code ?? "", plan: data.plan ?? null, version: data.version ?? 0 }
}

/**
 * Instant starter: publishes a golden composition with zero model calls.
 * The player renders it immediately; the agent refines it from there.
 */
export async function publishStarter(
  instance: string,
  template: string,
  context: { product?: string; brand?: string; headline?: string } = {},
  signal?: AbortSignal
): Promise<{ ok: boolean; version: number; title?: string }> {
  const res = await fetch(agentUrl(instance, "starter"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template, ...context }),
    signal,
  })
  if (!res.ok) throw new Error(`starter ${res.status}`)
  return (await res.json()) as { ok: boolean; version: number; title?: string }
}

export interface VersionSummary {
  n: number
  lines: number
  bytes: number
  title: string | null
}

export async function fetchVersions(
  instance: string,
  signal?: AbortSignal
): Promise<{ current: number; versions: VersionSummary[] }> {
  const res = await fetch(agentUrl(instance, "versions"), { signal })
  if (!res.ok) throw new Error(`versions ${res.status}`)
  return (await res.json()) as { current: number; versions: VersionSummary[] }
}

export interface ModelOption {
  id: string
  label: string
  blurb: string
  textOnly: boolean
}

export async function fetchChatModel(
  instance: string,
  signal?: AbortSignal
): Promise<{ model: string; available: ModelOption[] }> {
  const res = await fetch(agentUrl(instance, "model"), { signal })
  if (!res.ok) throw new Error(`model ${res.status}`)
  return (await res.json()) as { model: string; available: ModelOption[] }
}

export async function setChatModel(instance: string, model: string): Promise<{ model: string }> {
  const res = await fetch(agentUrl(instance, "model"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error((detail as { error?: string } | null)?.error ?? `model ${res.status}`)
  }
  return (await res.json()) as { model: string }
}

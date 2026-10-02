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

import type { Artifact } from "./artifact"

/** Realtime lifecycle events streamed to the client (no extra tokens). */
export type DirectorEvent =
  | { type: "stage"; stage: string }
  | { type: "progress"; tokens: number }
  | { type: "report"; notes: string[] }
  /**
   * Raw model text deltas. The client does not show these — the composer
   * streams code, not prose — but their length is a real progress signal,
   * so the live status counts them instead of inventing a bar.
   */
  | { type: "text"; stage: string; delta: string }
  /** Bytes of model output so far, for the live status. */
  | { type: "output"; chars: number; stage: string }
  /**
   * The composition is ready to watch, sent before the review and the
   * reply so the user is never waiting on a video that already exists.
   */
  | { type: "artifact"; artifact: Artifact }
  /**
   * The director's read of the brief, sent the moment it exists — before
   * a line of the composition is written. It is the one thing the user
   * can read while nothing has happened yet, and the honest answer to
   * "what is it making?".
   */
  | { type: "plan"; concept: string; beats: string[]; signature: string }
  /** Conversational follow-ups the critic wants to put to the user. */
  | { type: "offers"; offers: string[] }

export type DirectorEventHandler = (e: DirectorEvent) => void

export interface DirectorImage {
  name: string
  dataUrl: string
}

export interface DirectRequest {
  prompt: string
  format: "16:9" | "9:16" | "1:1"
  /**
   * True when the canvas was picked in the UI — the director must never
   * re-ask what the user already decided.
   */
  formatLocked?: boolean
  /** Reference images (data URLs) for the model to study. */
  images?: DirectorImage[]
  /**
   * Earlier turns of this session, oldest first. A follow-up is only a
   * follow-up if the agent can see what came before it — without this,
   * "now make it faster" reads as a brand new brief and re-plans the
   * whole thing.
   */
  history?: Array<{ role: "user" | "ai"; text: string }>
  /** Server project id — wires session memory. Null = local draft. */
  projectId?: string | null
}

/**
 * A question the director wants to put to the user. It never blocks
 * generation — the cut is composed either way. It rides in the chat as an
 * invitation, with its own options, a send button, and a custom-answer
 * escape hatch.
 */
export interface Question {
  text: string
  options: string[]
}

export interface DirectResult {
  /** The composition: TypeScript, ready to mount. */
  artifact: Artifact
  /** One conversational sentence to the user (their language). */
  reply: string
  /** The director's read of the brief, shown while the cut renders. */
  plan: {
    concept: string
    beats: string[]
    signature?: string
    palette?: { bg: string; hero: string; accent: string }
  } | null
  /**
   * Zero to two. The director decides how many and writes the options.
   * Advisory: the client renders them, and the user may ignore them
   * entirely without anything breaking.
   */
  questions?: Question[]
  /** At most one follow-up the voice agent wants to put to the user. */
  offers?: string[]
  /** Model id that served this result (for transparency). */
  model: string
  /** Advisory reviewer notes. Non-blocking — the cut renders regardless. */
  warnings: string[]
}

export interface RefineRequest {
  /** The composition being edited. Legacy JSON docs are rejected. */
  artifact: Artifact
  prompt: string
  history: Array<{ role: "ai" | "user"; text: string }>
  note: string
  images?: DirectorImage[]
  projectId?: string | null
}

export interface RepairRequest {
  /** The file that failed to run. */
  code: string
  /** Real diagnostics — transpiler output, render throws, lint findings. */
  errors: string[]
  width: number
  height: number
  fps: number
  durationInFrames: number
  prompt?: string
  projectId?: string | null
}

export interface AiProvider {
  name: string
  direct(req: DirectRequest, onEvent?: DirectorEventHandler): Promise<DirectResult>
  refine(
    req: RefineRequest,
    onEvent?: DirectorEventHandler
  ): Promise<{
    reply: string
    artifact: Artifact
    model: string
    offers?: string[]
    warnings: string[]
  }>
  /**
   * Client-driven repair. The browser mounts the composition, so it is the
   * only place that can prove a file runs. When it throws, it posts the
   * real error here and gets a corrected file back.
   */
  repair(
    req: RepairRequest,
    onEvent?: DirectorEventHandler
  ): Promise<{ code: string; fixed: boolean; warnings: string[] }>
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI provider is not configured (missing API key)")
    this.name = "AiNotConfiguredError"
  }
}

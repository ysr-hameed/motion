import type { UIMessage } from "ai"

/**
 * Turn protocol (pure helpers — no I/O, fully unit-tested).
 *
 * One request runs ONE model step (CPU-capped plans die on multi-step
 * loops), so the client chains steps: after a step that ends with tool
 * calls, it sends CONTINUE_TOKEN as a user message to trigger the next
 * step. The server never persists the token and never charges for it.
 * Shared contract with the frontend's agent-chat-card (same literal,
 * display-filtered there).
 */
export const CONTINUE_TOKEN = "[continue-turn]"

/**
 * Turn depth.
 *
 * `standard` is the default. `advanced` is for briefs that need a real piece
 * rather than a tweak, and buys MORE STEPS — more passes of read, compose,
 * preview and refine — rather than a longer single response. More steps is
 * what actually improves a cut; a longer single response does not.
 *
 * ---------------------------------------------------------------------------
 * NO TOKEN CEILING, ON PURPOSE — read before adding one back
 * ---------------------------------------------------------------------------
 * There was a 16K/24K ceiling here, then a 1,200 one. Both were wrong, for
 * opposite reasons:
 *
 * - At 16K with STREAMING, the Worker parsed ~3.9us of CPU per output token.
 *   A 16K response is ~62ms against a ~10ms Free-plan budget, so the request
 *   was killed mid-write. Users saw it as "Interrupted mid-step".
 * - At 1,200 the request survived, but the model spent its entire budget
 *   narrating its PLAN and the tool arguments arrived EMPTY. The model
 *   reported its own writes as "a placeholder" and retried the identical
 *   plan indefinitely. A smaller cap did not make it safer; it made it
 *   unable to write code at all.
 *
 * The fix was neither number but the call itself: the route runs the model
 * NON-STREAMING, where one `res.json()` on the finished body costs ~0.27ms of
 * CPU regardless of length. With the per-token cost gone, the ceiling stopped
 * being a CPU question and became only a self-imposed limit on quality — so
 * it is removed. The model writes the scene it needs to write.
 *
 * Progress stays live in the UI via a real event per executed tool
 * (`data-toolstart`), so a long generation is reported rather than a spinner.
 */
export type TurnMode = "standard" | "advanced"

export interface TurnLimits {
  maxSteps: number
  /**
   * Output ceiling. Kept as a field so the wiring is explicit, but set far
   * above any real scene: a 5s composition is roughly 1-3K tokens, so this is
   * a runaway backstop, not a design constraint. If a turn ever genuinely
   * needs more, raise this rather than capping it near real output size.
   */
  maxOutputTokens: number
}

export const TURN_LIMITS: Record<TurnMode, TurnLimits> = {
  // 12 steps ≈ read → write → validate → preview → critique → revise, twice.
  standard: { maxSteps: 12, maxOutputTokens: 128000 },
  // Advanced keeps refining: more passes over the same cut, which is what
  // separates a good cut from a great one.
  advanced: { maxSteps: 28, maxOutputTokens: 128000 },
}

/**
 * Lines a written composition should stay under.
 *
 * This is a GUIDANCE figure for the model, not an enforced cap — it is stated
 * in the tool description because a number the model can reason about works
 * far better than a token ceiling it cannot see. Nothing rejects a write for
 * exceeding it; `write_composition` holds a whole file, which is the point.
 */
export const COMPOSITION_LINE_BUDGET = 900

export const DEFAULT_MODE: TurnMode = "standard"

/** Normalizes anything untrusted (client input, D1 row) to a known mode. */
export function resolveMode(raw: unknown): TurnMode {
  return raw === "advanced" ? "advanced" : DEFAULT_MODE
}

/** Hard cap on assistant step-messages per user turn (widest mode). */
export const MAX_STEPS_PER_TURN = TURN_LIMITS.advanced.maxSteps

interface LoosePart {
  type?: unknown
  text?: unknown
}

function userText(m: UIMessage): string {
  const parts = (m.parts ?? []) as LoosePart[]
  return parts
    .filter((p) => p?.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("")
}

export function isContinueMessage(m: Pick<UIMessage, "role" | "parts">): boolean {
  if (m.role !== "user") return false
  return userText(m as UIMessage).trim() === CONTINUE_TOKEN
}

function hasToolParts(m: UIMessage): boolean {
  const parts = (m.parts ?? []) as Array<{ type?: string }>
  return parts.some(
    (p) => typeof p?.type === "string" && (p.type.startsWith("tool-") || p.type === "dynamic-tool")
  )
}

/**
 * Assistant step-messages since the last real user message.
 * Continuation tokens never reset the count (they aren't turns).
 */
export function stepsUsedOf(history: UIMessage[]): number {
  let n = 0
  for (const m of history) {
    if (m.role === "user") {
      if (!isContinueMessage(m)) n = 0
      continue
    }
    if (m.role === "assistant" && hasToolParts(m)) n += 1
  }
  return n
}

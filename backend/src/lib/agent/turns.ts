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
 * `standard` is the default and stays small: most briefs resolve in a
 * handful of steps, and every extra step is another round-trip the user
 * waits through.
 *
 * `advanced` is for briefs that genuinely need more — a full piece rather
 * than a tweak. It raises the step cap and the output budget so the agent
 * can compose, preview, critique and revise in one turn instead of being
 * cut off mid-scene.
 *
 * CPU note, because this is the whole constraint this codebase lives under:
 * the limit is per REQUEST, not per turn. Advanced mode issues MORE
 * requests, each of which is individually sized and individually capped —
 * it does not make any single request more expensive. The one thing that
 * does raise per-request cost is `maxOutputTokens`, since a longer answer
 * is a bigger JSON body to parse, so it stays modest and bounded.
 *
 * `maxOutputTokens` IS the ceiling on a whole-file write, though, and that
 * is not a soft number. `write_composition` carries an entire
 * Composition.tsx as TOOL-CALL ARGUMENTS, so the scene has to be emitted
 * inside one response. At 8000 tokens a dense 5s scene (~900 lines of TSX)
 * ran past the cap, the response stopped mid-JSON, and the tool call was
 * never executed — while the gateway logged a clean HTTP 200 and the
 * Worker logged nothing at all, because no exception is ever raised. The
 * user just saw "The tool failed."
 *
 * So the budget is sized to hold a real composition, and the
 * COMPOSITION_LINE_BUDGET figure is stated in the write_composition tool
 * description so the model sizes its own output far more reliably than a
 * token ceiling it cannot see.
 */
/**
 * Turn depth.
 *
 * `standard` is the default and stays small: most briefs resolve in a
 * handful of steps, and every extra step is another round-trip the user
 * waits through.
 *
 * `advanced` is for briefs that genuinely need more — a full piece rather
 * than a tweak. It raises the step cap and the output budget so the agent
 * can compose, preview, critique and revise in one turn instead of being
 * cut off mid-scene.
 *
 * ---------------------------------------------------------------------------
 * WHY maxOutputTokens IS SMALL — read this before "just raise it"
 * ---------------------------------------------------------------------------
 * A streamed response costs roughly 3.9µs of CPU PER OUTPUT TOKEN, because
 * every SSE frame is parsed and re-serialized in the Worker. Measured on
 * this account:
 *
 *     500 tokens ->  5.3ms      8,000 ->  37ms
 *   2,000 tokens -> 13.1ms     16,000 ->  62ms
 *
 * The Workers Free plan allows ~10ms CPU per request. So a 16K budget was
 * guaranteed to be killed mid-write every single time — which is exactly
 * what users saw as "Interrupted mid-step". Raising this number cannot be
 * fixed by prompt engineering; it is arithmetic.
 *
 * The composition is therefore built INCREMENTALLY across several steps via
 * `append_composition`, not in one enormous response. That is both cheaper
 * AND more robust: a step that dies costs one chunk, not the whole cut, and
 * each chunk is small enough to be inspected and validated as it lands.
 */
export type TurnMode = "standard" | "advanced"

export interface TurnLimits {
  maxSteps: number
  maxOutputTokens: number
}

export const TURN_LIMITS: Record<TurnMode, TurnLimits> = {
  // ~1200 tokens ≈ 4.7ms of streaming CPU — inside the per-request budget
  // with room for the tools and D1 writes in the same request. Roughly
  // 40-60 lines of composition per step, so a full cut takes 4-8 appends.
  standard: { maxSteps: 12, maxOutputTokens: 1200 },
  // Same ceiling: a bigger number does not buy a bigger cut, it just kills
  // the request. Advanced buys MORE STEPS (more passes of refine), not a
  // longer single response — which is what actually improves the output.
  advanced: { maxSteps: 24, maxOutputTokens: 1200 },
}

/**
 * Lines a written composition should stay under so it fits one response.
 * Stated in the system prompt and the tool description: the model sizes
 * its own output far more reliably than a token ceiling it cannot see.
 *
 * This is PER WRITE, not per composition — the whole file is assembled
 * from several of these.
 */
export const COMPOSITION_LINE_BUDGET = 45

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

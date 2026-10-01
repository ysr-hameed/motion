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
 */
export type TurnMode = "standard" | "advanced"

export interface TurnLimits {
  maxSteps: number
  maxOutputTokens: number
}

export const TURN_LIMITS: Record<TurnMode, TurnLimits> = {
  standard: { maxSteps: 7, maxOutputTokens: 8000 },
  // 14 steps ≈ two full compose→preview→revise cycles inside one turn.
  // Output stays under 2x standard: parsing cost is linear in the response
  // body, and this file has to live inside a ~10ms CPU budget.
  advanced: { maxSteps: 14, maxOutputTokens: 14000 },
}

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

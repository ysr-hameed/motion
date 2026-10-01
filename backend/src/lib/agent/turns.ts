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
/** Hard cap on assistant step-messages per user turn. */
export const MAX_STEPS_PER_TURN = 7

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

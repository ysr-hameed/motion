/**
 * Inspecting a SETTLED assistant message.
 *
 * This module used to be the bridge from `GenerateTextResult.content` to the
 * browser's UIMessage vocabulary — a 326-line hand-rolled `toUIMessageStream`,
 * because the route called `agent.generate()` and buffered the whole turn.
 *
 * That buffering was the bug. A step takes 77–88s, and for every one of those
 * seconds the client had received nothing but a `start` frame, so the
 * assistant bubble rendered a bare "Thinking…" — no text, no tool chips, no
 * idea what was happening. The model writes "On it —" and the plan FIRST, so
 * streaming delivered them in about two seconds.
 *
 * The route now calls `agent.stream()` and relays the SDK's own
 * `toUIMessageStream()` chunks as they arrive, so the SDK owns the vocabulary
 * and this module only has to answer three questions about a finished
 * message. The hand-rolled `collectTools` / `toUiParts` / `toSseChunks` are
 * gone, along with the bugs that lived in them — most memorably reading
 * `errorText` off a `tool-error` part that only ever sets `error`, which is
 * what turned every truncated write into a bare "The tool failed."
 */

import type { UIMessage } from "ai"

/** Minimal shape of a settled message part we care about. */
interface SettledPart {
  type?: string
  text?: string
  state?: string
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

/** True when a part set carries nothing a user would see. */
export function isEmptyParts(parts: UIMessage["parts"] | undefined): boolean {
  if (!Array.isArray(parts) || parts.length === 0) return true
  return parts.every((raw) => {
    const p = raw as SettledPart
    if (p.type === "text") return !(p.text ?? "").trim()
    if (typeof p.type === "string" && p.type.startsWith("tool-")) {
      return p.state === "input-available"
    }
    return false
  })
}

/** Tool invocations for the client's activity feed, in call order. */
export function toolActivity(parts: UIMessage["parts"] | undefined): Array<{ name: string; state: string }> {
  return (Array.isArray(parts) ? parts : [])
    .map((raw) => {
      const p = raw as SettledPart
      if (typeof p.type !== "string" || !p.type.startsWith("tool-")) return null
      return { name: p.type.slice("tool-".length), state: p.state ?? "input-available" }
    })
    .filter((x): x is { name: string; state: string } => x !== null)
}

/**
 * Did this step get cut off mid tool-call?
 *
 * The SDK only executes tools when the finish reason allows it, so on
 * `length` a whole-file write never runs: the arguments never closed, the
 * call is discarded, and the step still reports success. Nothing throws, so
 * this is the only signal there is — and it is the difference between the
 * model being corrected and the model re-sending the identical 16K payload
 * five more times.
 *
 * On the streamed path the leftovers arrive as UI parts, so this looks for a
 * tool part rather than a raw `tool-call`.
 */
export function truncatedByLength(parts: unknown, finishReason?: string): boolean {
  if (finishReason !== "length") return false
  const list = Array.isArray(parts) ? (parts as SettledPart[]) : []
  return list.some((p) => isRecord(p) && typeof p?.type === "string" && p.type.startsWith("tool-"))
}

export { isRecord }
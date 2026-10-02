import type { UIMessage } from "ai"
import { CONTINUE_TOKEN } from "./turns"

/**
 * Worker-budget history pruning. The #1 CPU killer was unbounded history:
 * every stored message — base64 reference images, full-composition tool
 * snapshots — was re-serialized on EVERY model step of a long tool loop.
 * The pruned copy is for the model only; storage keeps full fidelity.
 */
/**
 * Upper bound on the model window. The window is not a plain tail — it pins
 * recent real briefs and then adds the recent tail, so this is a ceiling on
 * the merged result rather than the slice length itself.
 */
export const MAX_MODEL_HISTORY = 12
const MAX_TOOL_ARTIFACT_CHARS = 2000
const MAX_TOOL_INPUT_CHARS = 4000
/** A single user turn can never usefully exceed this; adversarial pastes
 *  (10k+ chars, path dumps, threats) get cut before serialization. */
const MAX_USER_TEXT_CHARS = 4000

/**
 * How much of the recent tail the window holds, and how many earlier REAL
 * user turns it keeps alongside it.
 *
 * The original brief is non-negotiable. A plain `slice(-MAX_MODEL_HISTORY)`
 * looks harmless, but ONE turn can produce a dozen assistant step-messages
 * (the client chains a step per request), so on a long turn the window filled
 * entirely with assistant steps and the user's original brief fell off the
 * end. Observed in production: the model lost the brief, said so out loud,
 * re-planned the identical cut four times, and the continuation request then
 * failed outright because there was no user message left to continue.
 *
 * So the window always keeps the most recent REAL user turns — continuation
 * tokens are transport, not content — pinned at the front, plus the recent
 * tail for continuity.
 */
const RECENT_TAIL = 8
const KEPT_USER_TURNS = 3

function isRealUserTurn(m: UIMessage): boolean {
  if (m.role !== "user") return false
  const text = ((m.parts ?? []) as Array<{ type?: string; text?: unknown }>)
    .filter((p) => p?.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("")
    .trim()
  // `[continue-turn]` is the chaining token; it is not a brief.
  return text.length > 0 && text !== CONTINUE_TOKEN
}

export function pruneForModel(history: UIMessage[]): UIMessage[] {
  const realUsers = history.filter(isRealUserTurn)
  // Oldest first: if there are more real briefs than fit, keep the most
  // recent ones — a 10-turn-old brief is less load-bearing than the one the
  // current turn is answering.
  const pinned = new Set(realUsers.slice(-KEPT_USER_TURNS))
  const tail = new Set(history.slice(-RECENT_TAIL))
  // Filter the ORIGINAL list so chronological order is preserved. Merging two
  // separately-ordered lists (pinned first, then tail) would demote the
  // newest message out of last position, which several behaviours depend on.
  const window = history.filter((m) => pinned.has(m) || tail.has(m))

  const latestId = history[history.length - 1]?.id
  return window.map((m) => {
    const isLatest = m.id === latestId
    const parts = ((m.parts ?? []) as unknown[]).map((p) => {
      if (typeof p !== "object" || p === null) return p
      const t = (p as { type?: unknown }).type
      // Giant user pastes: cap the text, say so honestly.
      if (t === "text" && m.role === "user") {
        const text = (p as { text?: unknown }).text
        if (typeof text === "string" && text.length > MAX_USER_TEXT_CHARS) {
          return {
            type: "text",
            text: `${text.slice(0, MAX_USER_TEXT_CHARS)}\n…[message truncated to ${MAX_USER_TEXT_CHARS} chars]`,
          }
        }
        return p
      }
      // Base64 images ride along only on the newest user turn — older
      // ones become a one-line note (the pixels already informed the cut).
      if (t === "file") {
        if (isLatest && m.role === "user") return p
        return { type: "text", text: "[reference image attached earlier in this conversation]" }
      }
      if (typeof t === "string" && (t.startsWith("tool-") || t === "dynamic-tool")) {
        const part = p as Record<string, unknown>
        let out = part.output as Record<string, unknown> | undefined
        // Full composition snapshots in old tool results: keep the canvas
        // facts, drop the code (current code re-reads via read_file).
        const art = out?.artifact as Record<string, unknown> | undefined
        if (art && typeof art.code === "string" && art.code.length > MAX_TOOL_ARTIFACT_CHARS) {
          out = {
            ...out,
            artifact: {
              kind: art.kind,
              width: art.width,
              height: art.height,
              fps: art.fps,
              durationInFrames: art.durationInFrames,
              note: "[full code truncated in history — use read_file for current source]",
            },
          }
        }
        // Full-file tool inputs (create/write with 100KB+ content) in old
        // turns: keep a preview, drop the payload.
        const input = part.input as unknown
        if (!isLatest && input !== undefined) {
          let s: string
          try {
            s = JSON.stringify(input)
          } catch {
            s = ""
          }
          if (s.length > MAX_TOOL_INPUT_CHARS) {
            return { ...part, ...(out !== part.output ? { output: out } : {}), input: { truncated: true, preview: s.slice(0, MAX_TOOL_INPUT_CHARS) } }
          }
        }
        if (out !== part.output) return { ...part, output: out }
      }
      return p
    })
    return { ...m, parts: parts as UIMessage["parts"] }
  })
}

/** Plain text of a stored/client user message (for the smalltalk gate). */
export function userTextOf(m: { parts?: unknown }): { text: string; hasFiles: boolean } {
  let text = ""
  let hasFiles = false
  const parts = Array.isArray(m.parts) ? m.parts : []
  for (const p of parts) {
    if (typeof p !== "object" || p === null) continue
    const t = (p as { type?: unknown }).type
    if (t === "text" && typeof (p as { text?: unknown }).text === "string") {
      text += (p as { text: string }).text
    } else if (t === "file") {
      hasFiles = true
    }
  }
  return { text, hasFiles }
}

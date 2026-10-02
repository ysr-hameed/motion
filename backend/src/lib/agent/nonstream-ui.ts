/**
 * Non-streaming `GenerateTextResult` → UIMessage parts + SSE chunks.
 *
 * WHY THIS EXISTS
 *
 * The chat route calls the model with `agent.generate()` rather than
 * `agent.stream()`. Streaming costs ~3.9us of Worker CPU per output token
 * on this account — a 16K response is ~62ms against a ~10ms budget, so the
 * request is killed mid-write. A single `res.json()` on the finished body is
 * ~0.27ms regardless of length.
 *
 * But the SDK only ships `toUIMessageStream()` on `StreamTextResult`.
 * `GenerateTextResult.content` speaks the MODEL part vocabulary
 * (`tool-call`, `tool-result`) while the browser's `useChat` transport
 * requires the UI vocabulary (`tool-input-available`, `tool-output-available`,
 * and `type: "tool-<name>"` message parts). This module is that bridge.
 *
 * The stored message parts and the live SSE chunks are derived from the SAME
 * converted parts, deliberately: derived separately they would drift, and a
 * reload would show a different conversation than the one just watched.
 */

import type { UIMessage } from "ai"

/** A tool call awaiting or carrying its result, keyed by toolCallId. */
interface ToolInvocation {
  toolCallId: string
  toolName: string
  input: unknown
  output?: unknown
  errorText?: string
  hasOutput: boolean
  hasError: boolean
}

/** Minimal shape of the model content parts this module cares about. */
interface ModelPart {
  type?: string
  text?: string
  toolCallId?: string
  toolName?: string
  input?: unknown
  args?: unknown
  output?: unknown
  result?: unknown
  errorText?: string
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

/**
 * Merge the model's tool calls and results into one list of invocations.
 *
 * The model emits these as separate parts (`tool-call`, then `tool-result`
 * per call). The UI needs them paired by toolCallId so a tool renders once,
 * with its result, rather than twice.
 */
function collectTools(content: ModelPart[]): ToolInvocation[] {
  const byId = new Map<string, ToolInvocation>()
  for (const part of content) {
    // Defensive: a nullish or malformed part is skipped, not thrown on. This
    // runs after the model call, so a throw would discard the whole completed
    // turn — including tools that already ran and published a cut.
    if (!isRecord(part)) continue
    const m = part as unknown as ModelPart
    if (m.type === "tool-call" && typeof m.toolCallId === "string") {
      byId.set(m.toolCallId, {
        toolCallId: m.toolCallId,
        toolName: m.toolName ?? "tool",
        input: m.input ?? m.args,
        hasOutput: false,
        hasError: false,
      })
    } else if (m.type === "tool-result" && typeof m.toolCallId === "string") {
      const existing = byId.get(m.toolCallId)
      const output = m.output ?? m.result
      if (existing) {
        existing.output = output
        existing.hasOutput = true
      } else {
        // A result with no preceding call still gets surfaced, so a tool that
        // genuinely ran is never silently dropped from the transcript.
        byId.set(m.toolCallId, {
          toolCallId: m.toolCallId,
          toolName: m.toolName ?? "tool",
          input: m.input ?? m.args,
          output,
          hasOutput: true,
          hasError: false,
        })
      }
    } else if (m.type === "tool-error" && typeof m.toolCallId === "string") {
      const existing = byId.get(m.toolCallId)
      if (existing) {
        existing.errorText = String(m.errorText ?? "The tool failed.")
        existing.hasError = true
      }
    }
  }
  return [...byId.values()]
}

/**
 * Build the UI message parts for a completed non-streaming step.
 * Order matches a streamed run: text first (what the user reads), then the
 * tool activity it described.
 */
export function toUiParts(content: unknown): UIMessage["parts"] {
  const parts = Array.isArray(content) ? (content as ModelPart[]) : []
  const out: UIMessage["parts"] = []

  for (const part of parts) {
    if (!isRecord(part)) continue
    const m = part as unknown as ModelPart
    if (m.type === "text" && typeof m.text === "string" && m.text.trim()) {
      out.push({ type: "text", text: m.text } as UIMessage["parts"][number])
    } else if (m.type === "reasoning" && typeof m.text === "string" && m.text.trim()) {
      out.push({
        type: "reasoning",
        text: m.text,
      } as unknown as UIMessage["parts"][number])
    }
  }

  for (const t of collectTools(parts)) {
    // `tool-<name>` is exactly what the client keys on to pick an icon and
    // render the right block, so it has to match precisely.
    const base = {
      type: `tool-${t.toolName}`,
      toolCallId: t.toolCallId,
      input: t.input,
    } as unknown as UIMessage["parts"][number]
    if (t.hasError) {
      out.push({
        ...(base as object),
        state: "output-error",
        errorText: t.errorText ?? "The tool failed.",
      } as unknown as UIMessage["parts"][number])
    } else if (t.hasOutput) {
      out.push({
        ...(base as object),
        state: "output-available",
        output: t.output,
      } as unknown as UIMessage["parts"][number])
    } else {
      // Called but never resolved because the step ended first. Rendered as
      // still pending rather than hidden — a visible gap beats a silent one.
      out.push({
        ...(base as object),
        state: "input-available",
      } as unknown as UIMessage["parts"][number])
    }
  }

  return out
}

/**
 * Convert the same parts into SSE chunks the existing `useChat` transport
 * understands. The wire vocabulary differs from the stored-parts vocabulary
 * (`tool-input-available`, not `tool-input-start`); getting this wrong breaks
 * the live stream in ways that only show up in the browser.
 */
export function toSseChunks(parts: UIMessage["parts"], messageId: string): unknown[] {
  const chunks: unknown[] = [{ type: "start", messageId }]
  for (const raw of parts) {
    const p = raw as unknown as ModelPart & {
      state?: string
      errorText?: string
      output?: unknown
      input?: unknown
    }
    if (p.type === "text") {
      const id = crypto.randomUUID()
      chunks.push({ type: "text-start", id })
      chunks.push({ type: "text-delta", id, delta: p.text ?? "" })
      chunks.push({ type: "text-end", id })
    } else if (p.type === "reasoning") {
      const id = crypto.randomUUID()
      chunks.push({ type: "reasoning-start", id })
      chunks.push({ type: "reasoning-delta", id, delta: p.text ?? "" })
      chunks.push({ type: "reasoning-end", id })
    } else if (typeof p.type === "string" && p.type.startsWith("tool-")) {
      const toolName = p.type.slice("tool-".length)
      chunks.push({
        type: "tool-input-available",
        toolCallId: p.toolCallId,
        toolName,
        input: p.input,
      })
      if (p.state === "output-available") {
        chunks.push({
          type: "tool-output-available",
          toolCallId: p.toolCallId,
          output: p.output,
        })
      } else if (p.state === "output-error") {
        chunks.push({
          type: "tool-output-error",
          toolCallId: p.toolCallId,
          errorText: p.errorText ?? "The tool failed.",
        })
      }
    }
  }
  chunks.push({ type: "finish" })
  return chunks
}

/** True when a part set carries nothing a user would see. */
export function isEmptyParts(parts: UIMessage["parts"]): boolean {
  if (!Array.isArray(parts) || parts.length === 0) return true
  // A lone pending tool call with no text and no output is noise; the
  // client's "that step produced nothing" notice is more honest.
  return parts.every((raw) => {
    const p = raw as unknown as ModelPart & { state?: string }
    if (p.type === "text") return !(p.text ?? "").trim()
    if (typeof p.type === "string" && p.type.startsWith("tool-")) return p.state === "input-available"
    return false
  })
}

/** Tool invocations for the client's activity feed, in call order. */
export function toolActivity(parts: UIMessage["parts"]): Array<{ name: string; state: string }> {
  return (Array.isArray(parts) ? parts : [])
    .map((raw) => {
      const p = raw as unknown as ModelPart & { state?: string }
      if (typeof p.type !== "string" || !p.type.startsWith("tool-")) return null
      return { name: p.type.slice("tool-".length), state: p.state ?? "input-available" }
    })
    .filter((x): x is { name: string; state: string } => x !== null)
}

export { isRecord, collectTools as _collectToolsForTest }
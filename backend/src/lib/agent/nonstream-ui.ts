/**
 * Non-streaming `GenerateTextResult` → UIMessage parts + SSE chunks.
 *
 * WHY THIS EXISTS
 *
 * The chat route runs the model with `agent.generate()` instead of
 * `agent.stream()`. Streaming cost ~18.8ms of Worker CPU for a 4,000-token
 * answer (every SSE frame parsed and re-serialized) versus ~0.7ms for one
 * `res.json()` on the finished body — the difference between surviving and
 * being killed on a CPU-capped plan.
 *
 * But the SDK only ships `toUIMessageStream()` on `StreamTextResult`.
 * `GenerateTextResult.content` uses the MODEL part vocabulary
 * (`tool-call`, `tool-result`) while the UI message stream — and therefore
 * the browser's `useChat` transport — expects the UI vocabulary
 * (`tool-input-available`, `tool-output-available`, and
 * `type: "tool-<name>"` message parts). So this module does that
 * translation, once, in one place.
 *
 * Both the persisted message parts (D1 → history → next turn's model
 * context) and the live SSE chunks are derived from the SAME converted
 * parts. That is deliberate: if they came from two different code paths they
 * would drift, and a reload would show a different conversation than the
 * one the user just watched.
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

/** Minimal shape of the model content parts we care about. */
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
  /**
   * The AI SDK's `tool-error` part carries its reason here — NOT in
   * `errorText`. Two different shapes reach us depending on how the tool
   * failed: an INVALID call (unparsable/truncated arguments) gets a
   * pre-stringified message, while a call whose `execute` threw carries
   * the raw thrown value. Both land in `error`.
   */
  error?: unknown
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

/**
 * Pull a human-readable reason out of a tool failure.
 *
 * This used to read `errorText` only, which no AI SDK `tool-error` part
 * ever sets. Every truncated tool call therefore collapsed to the literal
 * "The tool failed." — which is why a turn that produced 8K output tokens
 * and returned HTTP 200 reported a failure with no explanation anywhere,
 * including the Worker logs (no exception is ever thrown: an invalid call
 * never reaches `execute`).
 */
function errorTextOf(part: ModelPart): string | undefined {
  const raw = part.errorText ?? part.error
  if (raw == null) return undefined
  if (typeof raw === "string") return raw.trim() || undefined
  if (raw instanceof Error) return raw.message.trim() || undefined
  if (isRecord(raw) && typeof raw.message === "string" && raw.message.trim()) {
    return raw.message.trim()
  }
  try {
    return JSON.stringify(raw).slice(0, 300)
  } catch {
    return String(raw).slice(0, 300)
  }
}

/**
 * Merge the model's tool calls and results into one list of invocations.
 *
 * The model emits these as separate parts (`tool-call`, then `tool-result`
 * for each). The UI needs them paired by toolCallId so a tool renders once,
 * with its result, rather than twice.
 */
function collectTools(content: ModelPart[]): ToolInvocation[] {
  const byId = new Map<string, ToolInvocation>()
  for (const part of content) {
    // Defensive: a malformed or nullish part must be skipped, not thrown on.
    // This runs after the model call, so a throw here would lose the entire
    // completed turn — including tools that already ran and previewed a cut.
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
        // A result with no preceding call: still surface it, so a tool that
        // ran is never silently dropped from the transcript.
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
      const text = errorTextOf(m) ?? "The tool failed."
      const existing = byId.get(m.toolCallId)
      if (existing) {
        existing.errorText = text
        existing.hasError = true
      } else {
        // An error with no preceding call (the SDK emits the call first
        // today, but the two arrive on separate code paths) still has a
        // reason worth showing — dropping it is how a failed tool used to
        // disappear with no trace in the transcript.
        byId.set(m.toolCallId, {
          toolCallId: m.toolCallId,
          toolName: m.toolName ?? "tool",
          input: m.input ?? m.args,
          errorText: text,
          hasOutput: false,
          hasError: true,
        })
      }
    }
  }
  return [...byId.values()]
}

/**
 * What the SDK reports when the response ran into `maxOutputTokens`.
 *
 * The whole step is still HTTP 200 — the model simply stopped mid-sentence.
 * For a whole-file tool call like `write_composition` that means the JSON
 * arguments never closed, so `execute` never ran. Saying so beats letting
 * the card spin on a tool that is never going to resolve.
 */
const TRUNCATED_ERROR =
  "The scene was cut off before it finished writing, so nothing was changed. " +
  "Try a simpler scene, or ask for one beat at a time, and I'll build it in pieces."

/** Extra facts about the finished step that change how parts are rendered. */
export interface StepContext {
  /** The SDK's `finishReason` — `"length"` means the output cap was hit. */
  finishReason?: string | undefined
}

/**
 * Build the UI message parts for a completed non-streaming step.
 *
 * Order matches what a streamed run would have produced: text first (what
 * the user reads), then the tool activity it described.
 */
export function toUiParts(content: unknown, ctx?: StepContext): UIMessage["parts"] {
  const parts = Array.isArray(content) ? (content as ModelPart[]) : []
  const out: UIMessage["parts"] = []
  // The SDK only executes tools when the finish reason allows it; on
  // `length` every tool call in the step is left unresolved.
  const truncated = ctx?.finishReason === "length"

  for (const part of parts) {
    if (!isRecord(part)) continue
    if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
      out.push({ type: "text", text: part.text } as UIMessage["parts"][number])
    } else if (part?.type === "reasoning" && typeof part.text === "string" && part.text.trim()) {
      out.push({
        type: "reasoning",
        text: part.text,
      } as unknown as UIMessage["parts"][number])
    }
  }

  for (const t of collectTools(parts)) {
    // The `tool-<name>` type is what the client's ActivityLine keys on to
    // pick an icon and render the right block, so it must match exactly.
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
    } else if (truncated) {
      // Resolved-as-never: the response hit the output cap mid-call, so
      // this tool can never finish. An eternal "still working" spinner is
      // the one outcome worse than an honest failure.
      out.push({
        ...(base as object),
        state: "output-error",
        errorText: TRUNCATED_ERROR,
      } as unknown as UIMessage["parts"][number])
    } else {
      // Called but never resolved (the step ended first). Rendered as still
      // pending rather than hidden — a visible gap beats a silent one.
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
 * (`tool-input-available`, not `tool-input-start`) and getting this wrong
 * breaks the live stream in ways that only show up in the browser.
 */
export function toSseChunks(parts: UIMessage["parts"], messageId: string): unknown[] {
  const chunks: unknown[] = [{ type: "start", messageId }]
  let textId: string | null = null

  for (const raw of parts) {
    const p = raw as unknown as ModelPart & {
      state?: string
      errorText?: string
      output?: unknown
      input?: unknown
    }
    if (p.type === "text") {
      textId = crypto.randomUUID()
      chunks.push({ type: "text-start", id: textId })
      chunks.push({ type: "text-delta", id: textId, delta: p.text ?? "" })
      chunks.push({ type: "text-end", id: textId })
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
    if (typeof p.type === "string" && p.type.startsWith("tool-")) {
      return p.state === "input-available"
    }
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

/** Exposed for tests: the tool-merge step on its own. */
export function _collectToolsForTest(content: unknown) {
  return collectTools(Array.isArray(content) ? (content as ModelPart[]) : [])
}

export { isRecord }
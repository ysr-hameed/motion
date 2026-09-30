/**
 * Edit ops — the cheap path for refinements.
 *
 * Re-emitting a 300-line composition to change one easing function is
 * absurd. The editor is asked for find/replace ops instead and only falls
 * back to a full rewrite when the change is genuinely structural.
 *
 * Ops are resolved in order, against the running result, so a later op can
 * target text an earlier op introduced. Each op is tried three ways:
 *   1. exact substring
 *   2. whitespace-normalised (re-indentation, blank lines, spacing)
 *   3. line-wise fuzzy match ignoring leading indentation
 * An op that resolves zero times is reported, never silently dropped —
 * a silent miss would show the user "done" over an unchanged file.
 */
 
export interface ReplaceOp {
  op: "replace"
  find: string
  replace: string
}

export interface ReplaceAllOp {
  op: "replaceAll"
  find: string
  replace: string
}

export interface InsertAfterOp {
  op: "insertAfter"
  anchor: string
  text: string
}

export interface InsertBeforeOp {
  op: "insertBefore"
  anchor: string
  text: string
}

export interface DeleteOp {
  op: "delete"
  find: string
}

export type EditOp =
  | ReplaceOp
  | ReplaceAllOp
  | InsertAfterOp
  | InsertBeforeOp
  | DeleteOp

export interface EditResult {
  code: string
  /** How many ops landed. */
  applied: number
  /** Ops that matched nothing, with a readable reason. */
  failed: Array<{ op: EditOp; reason: string }>
}

const isOp = (v: unknown): v is EditOp => {
  if (typeof v !== "object" || v === null) return false
  const o = v as Record<string, unknown>
  if (typeof o.op !== "string") return false
  switch (o.op) {
    case "replace":
    case "replaceAll":
    case "delete":
      return typeof o.find === "string" && o.find.length > 0
    case "insertAfter":
    case "insertBefore":
      return (
        typeof o.anchor === "string" &&
        o.anchor.length > 0 &&
        typeof o.text === "string"
      )
    default:
      return false
  }
}

const first = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : ""

/** Narrow to a mutable record — op payloads come from untrusted JSON. */
const asRecord = (o: EditOp): Record<string, unknown> =>
  o as unknown as Record<string, unknown>

/** Pulls an ops array out of whatever shape the model returned. */
export function coerceOps(raw: unknown): EditOp[] {
  const holder = (raw ?? {}) as { ops?: unknown }
  const src = Array.isArray(raw) ? raw : Array.isArray(holder.ops) ? holder.ops : []
  return src.filter(isOp).map((o) => {
    const r = asRecord(o)
    const out: Record<string, unknown> = { op: r.op }
    if (typeof r.find === "string") out.find = r.find
    if (typeof r.replace === "string") out.replace = r.replace
    if (typeof r.anchor === "string") out.anchor = r.anchor
    if (typeof r.text === "string") out.text = r.text
    return out as unknown as EditOp
  })
}

/** Collapses all runs of whitespace to a single space, per line. */
function normalise(s: string): string {
  return s
    .split("\n")
    .map((l) => l.trim().replace(/\s+/g, " "))
    .filter((l, i, a) => !(l === "" && i === a.length - 1))
    .join("\n")
}

/** Index of `needle` in `haystack` ignoring indentation, or -1. */
function fuzzyIndex(haystack: string, needle: string): number {
  const nLines = needle.split("\n").map((l) => l.trim()).filter(Boolean)
  if (nLines.length === 0) return -1
  const hLines = haystack.split("\n")
  for (let i = 0; i + nLines.length <= hLines.length; i++) {
    let ok = true
    for (let j = 0; j < nLines.length; j++) {
      if (hLines[i + j]!.trim() !== nLines[j]) {
        ok = false
        break
      }
    }
    if (ok) {
      // Convert the matched line span back to a character offset.
      return hLines.slice(0, i).reduce((a, l) => a + l.length + 1, 0)
    }
  }
  return -1
}

interface Located {
  start: number
  end: number
  how: "exact" | "normalised" | "fuzzy" | "missing"
}

function locate(code: string, needle: string): Located {
  const exact = code.indexOf(needle)
  if (exact !== -1)
    return { start: exact, end: exact + needle.length, how: "exact" }

  const normNeedle = normalise(needle)
  const normCode = normalise(code)
  const nIdx = normCode.indexOf(normNeedle)
  if (nIdx !== -1) {
    // Map the normalised offset back by walking the same normalisation.
    const start = mapNormOffset(code, nIdx)
    if (start !== -1) {
      const end = mapNormOffset(code, nIdx + normNeedle.length)
      if (end !== -1) return { start, end: end, how: "normalised" }
    }
  }

  const fIdx = fuzzyIndex(code, needle)
  if (fIdx !== -1)
    return { start: fIdx, end: fIdx, how: "fuzzy" }
  return { start: -1, end: -1, how: "missing" }
}

/** Character offset in the original for an offset in the normalised text. */
function mapNormOffset(code: string, normOffset: number): number {
  let seen = 0
  const lines = code.split("\n")
  for (const line of lines) {
    const trimmed = line.trim().replace(/\s+/g, " ")
    const len = trimmed.length
    if (seen + len >= normOffset) {
      const within = normOffset - seen
      const rawIndex = line.indexOf(trimmed)
      if (rawIndex === -1) return -1
      return line.length === 0 ? 0 : rawIndex + within
    }
    seen += len + 1 // +1 for the newline
  }
  return -1
}

/**
 * Character span of a whole-line fuzzy match, so the matched lines can be
 * replaced or removed as a unit.
 */
function fuzzySpan(code: string, needle: string): { start: number; end: number } | null {
  const start = fuzzyIndex(code, needle)
  if (start === -1) return null
  const count = needle.split("\n").map((l) => l.trim()).filter(Boolean).length
  const lines = code.split("\n")
  const startLine = code.slice(0, start).split("\n").length - 1
  const endLine = startLine + count
  if (endLine >= lines.length) return { start, end: code.length }
  const end = lines.slice(0, endLine).reduce((a, l) => a + l.length + 1, 0)
  return { start, end }
}

/**
 * Applies ops in order. Returns the new code plus a per-op report so the
 * caller can decide whether to retry with a full rewrite.
 */
export function applyEdits(code: string, ops: EditOp[]): EditResult {
  let out = code
  let applied = 0
  const failed: EditResult["failed"] = []

  for (const op of ops) {
    const r = asRecord(op)
    switch (op.op) {
      case "replace":
      case "replaceAll": {
        const replacement = first(r.replace)
        const hit = locate(out, op.find)
        if (hit.how === "fuzzy") {
          const span = fuzzySpan(out, op.find)
          if (span) {
            out = out.slice(0, span.start) + replacement + out.slice(span.end)
            applied++
            continue
          }
        }
        if (hit.how === "missing") {
          failed.push({ op, reason: "`find` matched nothing" })
          continue
        }
        if (op.op === "replaceAll") {
          const parts = out.split(op.find)
          out = parts.join(replacement)
        } else {
          out = out.slice(0, hit.start) + replacement + out.slice(hit.end)
        }
        applied++
        break
      }
      case "delete": {
        const hit = locate(out, op.find)
        if (hit.how === "fuzzy") {
          const span = fuzzySpan(out, op.find)
          if (span) {
            out = out.slice(0, span.start) + out.slice(span.end)
            applied++
            continue
          }
        }
        if (hit.how === "missing") {
          failed.push({ op, reason: "`find` matched nothing" })
          continue
        }
        out = out.slice(0, hit.start) + out.slice(hit.end)
        applied++
        break
      }
      case "insertAfter":
      case "insertBefore": {
        const hit = locate(out, op.anchor)
        let at: number
        if (hit.how === "fuzzy") {
          const span = fuzzySpan(out, op.anchor)
          if (span) at = op.op === "insertAfter" ? span.end : span.start
          else {
            failed.push({ op, reason: "`anchor` matched nothing" })
            continue
          }
        } else if (hit.how === "missing") {
          failed.push({ op, reason: "`anchor` matched nothing" })
          continue
        } else {
          at = op.op === "insertAfter" ? hit.end : hit.start
        }
        out = out.slice(0, at) + first(r.text) + out.slice(at)
        applied++
        break
      }
    }
  }
  return { code: out, applied, failed }
}

/** One-line explanation of a failed op, safe to show a model. */
export function describeFailure(f: EditResult["failed"][number]): string {
  const o = asRecord(f.op)
  const target = String(o.find ?? o.anchor ?? "")
  const head = target.replace(/\s+/g, " ").trim().slice(0, 70)
  return `${o.op}: could not find ${head ? `"${head}"` : "the target"}`
}

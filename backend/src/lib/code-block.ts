/**
 * Pulls TypeScript out of a model response.
 *
 * Models fence, apologise, explain, and then fence again. The composition
 * itself is always delimited by its `export default`, so we find that
 * statement, brace-match to its end, and take everything from the first
 * line of real code up to there.
 */

/** Strips a single layer of markdown fence, remembering the language. */
function stripFence(text: string): { code: string; lang: string } {
  const fence = /```([\w-]*)\s*\n([\s\S]*?)```/
  const m = text.match(fence)
  if (m) return { code: m[2] ?? "", lang: m[1] ?? "" }
  return { code: text, lang: "" }
}

/** First offset that looks like the start of source, not prose. */
function firstCodeOffset(text: string): number {
  const lines = text.split("\n")
  const starts = [
    /^\s*\/\//, /^\s*\/\*/, /^\s*\*/,
    /^\s*(import|export)\b/,
    /^\s*(const|let|var|function|class|type|interface|enum)\b/,
    /^\s*["'`]/,
    /^\s*</,
  ]
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.trim() === "") continue
    if (starts.some((re) => re.test(line))) {
      return lines.slice(0, i).reduce((a, l) => a + l.length + 1, 0)
    }
  }
  return 0
}

/**
 * Walks forward from `from`, tracking depth across strings, template
 * literals, comments and regex-ish slashes, and returns the offset just
 * past the balanced block that contains `from`.
 */
function balancedEnd(code: string, from: number): number {
  let depth = 0
  let i = from
  let inStr: '"' | "'" | "`" | null = null
  let inLine = false
  let inBlock = false
  while (i < code.length) {
    const c = code[i]!
    const next = code[i + 1]
    if (inLine) {
      if (c === "\n") inLine = false
      i++
      continue
    }
    if (inBlock) {
      if (c === "*" && next === "/") {
        inBlock = false
        i += 2
        continue
      }
      i++
      continue
    }
    if (inStr) {
      if (c === "\\") {
        i += 2
        continue
      }
      if (c === inStr) inStr = null
      i++
      continue
    }
    if (c === "/" && next === "/") {
      inLine = true
      i += 2
      continue
    }
    if (c === "/" && next === "*") {
      inBlock = true
      i += 2
      continue
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c
      i++
      continue
    }
    if (c === "{" || c === "(" || c === "[") depth++
    else if (c === "}" || c === ")" || c === "]") {
      depth--
      if (depth === 0) return i + 1
    }
    i++
  }
  return code.length
}

/**
 * True when the source declares a default export. This is the contract
 * the player needs, so it gates acceptance.
 */
export function hasDefaultExport(code: string): boolean {
  return /^\s*export\s+default\b/m.test(code) || /^\s*export\s*\{[^}]*\bas\s+default\b/m.test(code)
}

export interface Extracted {
  code: string
  /** Model prose found after the composition — surfaced, never shipped. */
  trailing: string
}

/**
 * Recovers the composition when the model wrote a complete component but
 * forgot to export it.
 *
 * Measured on a real run: the model produced 14.7 KB of correct Remotion,
 * forgot the `export default` line, and appended a note about font setup
 * instead. Throwing that away and asking again costs a full regeneration
 * and usually produces something worse.
 *
 * The root is found structurally, not by guessing. Two filters:
 *   1. only declarations that actually return JSX are components — the
 *      file is full of constants like `FPS` and `PALETTE` that are never
 *      referenced twice either, and they are not the root;
 *   2. among those, the root is the one no other declaration mentions.
 *      A helper is always referenced by whoever composes it.
 *
 * Ambiguity returns null: guessing wrong is worse than letting the
 * repairer try.
 */
function recoverUnexportedDefault(code: string): string | null {
  if (hasDefaultExport(code)) return null

  // Spans first, over every top-level declaration, then filter. Doing it
  // the other way round indexes the filtered list against the full one and
  // produces spans that do not line up with the source.
  const heads = [...code.matchAll(/^(?:export\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)]
  const all = heads.map((m, i) => {
    // A declaration's body runs to the next top-level declaration. Good
    // enough for a reference test, and immune to unbalanced JSX.
    const start = m.index
    const end = i + 1 < heads.length ? heads[i + 1]!.index : code.length
    return { name: m[1]!, start, end, body: code.slice(start, end) }
  })

  const decls = all
    .filter((d) => /^[A-Z]/.test(d.name))
    .filter((d) => /<[A-Za-z]/.test(d.body) || d.body.includes("React.createElement"))

  if (decls.length === 0) return null
  if (decls.length === 1) return `${code}\n\nexport default ${decls[0]!.name}\n`

  const roots = decls.filter((d) => {
    const outside = code.slice(0, d.start) + code.slice(d.end)
    return !new RegExp(`\\b${d.name}\\b`).test(outside)
  })
  if (roots.length !== 1) return null
  return `${code}\n\nexport default ${roots[0]!.name}\n`
}

/**
 * Extracts the composition from a raw model response. Falls back to the
 * whole (fence-stripped) body when no `export default` is found, so a
 * missing marker degrades to "probably still fine" rather than "lost".
 */
export function extractComponent(raw: string): Extracted {
  const { code: unfenced } = stripFence(raw ?? "")
  if (unfenced.trim() === "") return { code: "", trailing: "" }

  const body = unfenced
  const start = firstCodeOffset(body)
  const search = body.slice(start)

  const exportAt = search.search(/(?<![$\w.])export\s+default\b/)
  if (exportAt !== -1) {
    const abs = start + exportAt
    const braceAt = body.indexOf("{", abs)
    const semiAt = body.indexOf(";", abs)
    // A block-bodied export ends at its matching brace; an expression
    // export ends at its semicolon (or the end of a balanced paren group).
    let end: number
    if (braceAt !== -1 && (semiAt === -1 || braceAt < semiAt)) {
      end = balancedEnd(body, braceAt)
    } else if (semiAt !== -1) {
      end = semiAt + 1
    } else {
      const parenAt = body.indexOf("(", abs)
      end = parenAt !== -1 ? balancedEnd(body, parenAt) : body.length
    }
    const code = body.slice(start, end)
    const trailing = body.slice(end).trim()
    return { code: normalise(code), trailing }
  }

  // No marker at all. Keep everything, then try to salvage it.
  const whole = normalise(body.slice(start).trim())
  const recovered = recoverUnexportedDefault(whole)
  if (recovered) return { code: recovered, trailing: "" }
  return { code: whole, trailing: "" }
}

/** Tidy trailing whitespace and guarantee a single trailing newline. */
function normalise(code: string): string {
  const trimmed = code.replace(/^\n+/, "").replace(/[ \t]+$/gm, "").trimEnd()
  return trimmed === "" ? "" : `${trimmed}\n`
}

/** A short, quotable summary of a composition for logs and prompts. */
export function summariseComponent(code: string): string {
  const lines = code.split("\n").length
  const frames = code.match(/durationInFrames=\{?(\d+)/)?.[1]
  // No \b before "<" — both sides are non-word characters, so it can
  // never match and every structural check below silently reported false.
  const usesSequence = /<Sequence[\s>]/.test(code)
  const usesSeries = /<Series[\s>]/.test(code)
  const usesTransitions = /<TransitionSeries[\s>]/.test(code)
  const usesCanvas = /<canvas[\s>]/.test(code)
  const usesSvg = /<svg[\s>]/.test(code)
  const bits = [`${lines} lines`]
  if (frames) bits.push(`${frames}f inline`)
  if (usesSeries) bits.push("Series")
  if (usesSequence) bits.push("Sequence")
  if (usesTransitions) bits.push("transitions")
  if (usesCanvas) bits.push("canvas")
  if (usesSvg) bits.push("svg")
  return bits.join(" · ")
}

/** Whether the composition is small enough that a full rewrite is cheap. */
export function isSmallComposition(code: string): boolean {
  return code.split("\n").length <= 90
}

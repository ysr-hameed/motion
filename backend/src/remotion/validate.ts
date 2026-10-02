/**
 * Static checks on composition source.
 *
 * These run in the Worker, not the browser, so the model finds out about a
 * broken file in the same turn it wrote it. The browser compiler is the
 * authority on whether a component actually mounts — this is the cheap pass
 * that catches the failures worth catching before spending a render on them.
 */

export interface Check {
  level: "error" | "warn"
  message: string
}

const REMOTION_CORE = new Set([
  "AbsoluteFill",
  "Sequence",
  "Series",
  "Composition",
  "useCurrentFrame",
  "useVideoConfig",
  "interpolate",
  "interpolateColors",
  "spring",
  "Easing",
  "cancelRender",
  "continueRender",
  "delayRender",
  "staticFile",
  "random",
  "Noise",
  "Loop",
  "Freeze",
  "Still",
  "Audio",
  "Img",
  "Video",
  "OffthreadVideo",
  "Series",
])

/** Packages the browser scope actually provides to a composition. */
const PROVIDED_PACKAGES = [
  "@remotion/transitions",
  "@remotion/shapes",
  "@remotion/paths",
  "@remotion/noise",
  "@remotion/motion-blur",
  "@remotion/gif",
  "@remotion/lottie",
  "@remotion/captions",
  "@remotion/media",
  "@remotion/fonts",
  "@remotion/google-fonts",
  "lucide-react",
]

export function checkComposition(code: string): Check[] {
  const out: Check[] = []
  const src = code.trim()

  if (!src) {
    return [{ level: "error", message: "The composition is empty." }]
  }

  // --- default export -----------------------------------------------------
  if (!/export\s+default\b/.test(src)) {
    out.push({
      level: "error",
      message:
        "No default export. A composition must end with `export default MyCut;` " +
        "(or `export default function MyCut() {}`) or the player has nothing to mount.",
    })
  }

  // --- balanced braces ----------------------------------------------------
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
  const open = (stripped.match(/[{[(]/g) ?? []).length
  const close = (stripped.match(/[}\])]/g) ?? []).length
  if (open !== close) {
    out.push({
      level: "error",
      message: `Unbalanced brackets: ${open} opening vs ${close} closing. The file will not parse.`,
    })
  }

  // --- imports ------------------------------------------------------------
  const imports = [...src.matchAll(/import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/g)].map(
    (m) => ({ clause: m[1] ?? "", source: m[2] ?? "" })
  )
  for (const imp of imports) {
    if (
      imp.source !== "remotion" &&
      imp.source !== "react" &&
      !imp.source.startsWith(".") &&
      !PROVIDED_PACKAGES.includes(imp.source)
    ) {
      out.push({
        level: "error",
        message:
          `Cannot import "${imp.source}". Only "remotion", "react", relative paths ` +
          `and these are available: ${PROVIDED_PACKAGES.join(", ")}.`,
      })
    }
  }

  // --- imports that are never used ---------------------------------------
  for (const imp of imports) {
    const named = imp.clause.match(/\{([\s\S]*?)\}/)
    if (!named?.[1]) continue
    for (const raw of named[1].split(",")) {
      const name = raw.split(/\s+as\s+/).pop()?.trim()
      if (!name) continue
      const body = src.replace(imp.clause, "")
      const uses = new RegExp(`(?<![.\\w$'"\`])${escapeRe(name)}\\b`).test(body)
      if (!uses) {
        out.push({
          level: "warn",
          message: `"${name}" is imported but never used.`,
        })
      }
    }
  }

  // --- free identifiers the scope does not provide ------------------------
  const declared = new Set<string>()
  for (const m of src.matchAll(/\b(?:const|let|var|function|class|type|interface)\s+([A-Za-z_$][\w$]*)/g)) {
    declared.add(m[1]!)
  }
  // Anything bound by an import is fine.
  for (const imp of imports) {
    const def = imp.clause.match(/^\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/)
    if (def?.[1] && def[1] !== "type") declared.add(def[1])
    const named = imp.clause.match(/\{([\s\S]*?)\}/)
    for (const raw of (named?.[1] ?? "").split(",")) {
      const parts = raw.split(/\s+as\s+/)
      const name = (parts[1] ?? parts[0])?.trim()
      if (name && name !== "type") declared.add(name)
    }
  }
  // Function params and JSX tags are declared elsewhere; only flag
  // capitalised identifiers, which is where hallucinated names show up.
  for (const m of src.matchAll(/(?<![.\w$'"`])([A-Z][A-Za-z0-9_$]{1,})\s*(?=[(<{[\s,;)}])/g)) {
    const name = m[1]!
    if (declared.has(name) || REMOTION_CORE.has(name)) continue
    out.push({
      level: "warn",
      message:
        `"${name}" is not defined here. Either it is a component you have not ` +
        `written yet, or it needs an import from remotion, react or one of the ` +
        `supported packages.`,
    })
  }

  // --- Remotion-specific correctness -------------------------------------
  if (/transition\s*:\s*["']all\s+["']/.test(src) && !/springs?\s*:\s*springTimingConfig/.test(src)) {
    out.push({
      level: "error",
      message:
        "A transition needs `springTimingConfig` or `linearTiming`. Without one, " +
        "Remotion's spring validation fails at render time.",
    })
  }

  if (/\buseState\s*\(/.test(src)) {
    out.push({
      level: "error",
      message:
        "useState cannot be used in a Remotion composition — the renderer controls " +
        "frame-by-frame determinism and state makes output non-deterministic. " +
        "Derive everything from useCurrentFrame().",
    })
  }

  if (/(className=.*\b(transition|animate)-[a-z]+)/.test(src)) {
    out.push({
      level: "warn",
      message:
        "CSS transitions and animations do not render in Remotion — the renderer " +
        "scrubs frames directly. Use useCurrentFrame() with interpolate() instead.",
    })
  }

  if (!/useCurrentFrame\(\)/.test(src) && /interpolate\(/.test(src)) {
    out.push({
      level: "error",
      message: "interpolate() needs a frame — pass useCurrentFrame() as its input.",
    })
  }

  if (/\bMath\.random\s*\(/.test(src)) {
    out.push({
      level: "error",
      message:
        "Math.random() is non-deterministic and Remotion will render a different " +
        "frame every pass. Use random(seed) from remotion.",
    })
  }

  // A frame number past the end means the layer never appears.
  if (/interpolate\(\s*frame\s*,\s*\[([^\]]*)\]/.test(src) === false) {
    const beyond = src.match(/interpolate\(\s*frame\s*,\s*\[(\d+)\s*,\s*(\d+)\]/g)
    for (const b of beyond ?? []) {
      const nums = b.match(/\d+/g)?.map(Number) ?? []
      const last = nums[nums.length - 1] ?? 0
      if (last > 900) {
        out.push({
          level: "warn",
          message: `interpolate() runs to frame ${last}. Clips are at most 900 frames (30s) — check this is not a typo.`,
        })
      }
    }
  }

  return out
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

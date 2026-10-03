import { MAX_FONT, MIN_FONT, SAFE_MARGIN, TYPE_SCALE } from "./type"

/** Matches the agent's canvas so scale/overflow warnings and the prompt agree. */
const CANVAS_W = 1920
const CANVAS_H = 1080

/** 1-based line number for a character offset, so messages are actionable. */
function lineOf(src: string, index: number): number {
  return src.slice(0, index).split("\n").length
}

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

  // --- type scale and layout discipline ---------------------------------
  // The model had no scale reference and guessed: headlines that filled a third
  // of the frame, captions nobody could read, and generic stacks that read as
  // "nobody chose a font". These catch the guess in the same turn instead of on
  // the user's third correction.

  for (const m of src.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)) {
    const size = Number(m[1])
    const near = lineOf(src, m.index ?? 0)
    if (size < MIN_FONT) {
      out.push({
        level: "error",
        message: `fontSize ${size} (line ${near}) is under the ${MIN_FONT}px floor — unreadable as video. Body is ${TYPE_SCALE.body[0]}-${TYPE_SCALE.body[1]}px, caption ${TYPE_SCALE.caption[0]}-${TYPE_SCALE.caption[1]}px.`,
      })
    } else if (size > MAX_FONT) {
      out.push({
        level: "error",
        message: `fontSize ${size} (line ${near}) is over the ${MAX_FONT}px ceiling on a ${1080}px frame — it fills the canvas. Hero is ${TYPE_SCALE.hero[0]}-${TYPE_SCALE.hero[1]}px.`,
      })
    }
  }

  for (const m of src.matchAll(/fontFamily:\s*["']([^"']+)["']/g)) {
    const stack = (m[1] ?? "").trim()
    if (/^(system-ui|sans-serif|serif|ui-sans-serif|Arial|Helvetica)$/i.test(stack)) {
      out.push({
        level: "warn",
        message: `fontFamily "${stack}" (line ${lineOf(src, m.index ?? 0)}) is a page default, not a choice. Use Fonts.<name>.family — the available faces are listed in the prompt and in load_skill("typography").`,
      })
    }
  }

  // Absolute positions near the frame edge get cropped by most encoders.
  for (const m of src.matchAll(/(?:left|top|right|bottom):\s*(-?\d+)/g)) {
    const v = Number(m[1])
    if (v !== 0 && Math.abs(v) < SAFE_MARGIN && Math.abs(v) < CANVAS_H * 0.02) {
      out.push({
        level: "warn",
        message: `Position ${v}px (line ${lineOf(src, m.index ?? 0)}) sits inside the ${SAFE_MARGIN}px safe margin — encoders crop it. Use ${SAFE_MARGIN}px or a percentage.`,
      })
      break // one warning is enough; the model does not need all of them
    }
  }

  // --- Remotion-specific correctness -------------------------------------

  // <Composition> registers a composition with the Studio entry file. It is
  // never rendered inside a component, and mounting one throws in the Player —
  // which is exactly what a generated cut does, so this failure is guaranteed
  // rather than likely.
  if (/<Composition[\s/>]/.test(src)) {
    out.push({
      level: "error",
      message:
        "Do not render <Composition>. It registers a composition with Remotion's " +
        "Studio entry file and throws when mounted inside a Player. Export the " +
        "component itself as the default export instead.",
    })
  }
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

  // --- layout & spatial reasoning (AGENT_UPGRADE_PLAN Phase 1) ---------------
  // The canvas is fixed at 1920x1080, so positions and animated ranges that
  // statically escape it are caught here instead of on the user's screen.

  // Single absolute offsets that alone escape the canvas.
  for (const m of src.matchAll(/(?:left|top|right|bottom|width|height):\s*(-?\d+(?:\.\d+)?)/g)) {
    const v = Number(m[1])
    const near = lineOf(src, m.index ?? 0)
    if (Math.abs(v) > CANVAS_W && Math.abs(v) > CANVAS_H) {
      out.push({
        level: "warn",
        message: `Position/size ${v}px (line ${near}) exceeds the ${CANVAS_W}x${CANVAS_H} canvas — the element renders off-canvas. Check the interpolate ranges and scale.`,
      })
      break // one warning is enough; the model does not need all of them
    }
  }

  // Duplicate z-index on positioned elements: without bounds we cannot prove
  // an overlap, but two absolutely-positioned layers sharing a z-index is
  // where paint-order fights come from.
  {
    const positioned = (src.match(/position:\s*['"]absolute['"]/g) ?? []).length
    const zValues = [...src.matchAll(/zIndex:\s*(\d+)/g)].map((m) => m[1])
    if (positioned >= 2 && zValues.length >= 2) {
      const dupes = zValues.filter((z, i) => zValues.indexOf(z) !== i)
      if (dupes.length > 0) {
        out.push({
          level: "warn",
          message: `z-index conflict: ${positioned} absolutely-positioned elements share zIndex ${[...new Set(dupes)].join(", ")}. Use the layer convention background=1, content=10, overlays=20, UI=30 so paint order is deliberate.`,
        })
      } else if (zValues.length < positioned) {
        out.push({
          level: "warn",
          message: `${positioned} absolutely-positioned elements but only ${zValues.length} declare zIndex. Declare one per layer (background=1, content=10, overlays=20, UI=30).`,
        })
      }
    }
  }

  // Animated translate/scale ranges that push elements off-canvas.
  for (const m of src.matchAll(/interpolate\(\s*frame\s*,\s*\[([^\]]*)\]\s*,\s*\[([^\]]*)\]/g)) {
    const outs = (m[2] ?? "").split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n))
    if (outs.length === 0) continue
    const peak = Math.max(...outs.map((n) => Math.abs(n)))
    const ctx = src.slice(Math.max(0, (m.index ?? 0) - 220), (m.index ?? 0) + 120)
    const near = lineOf(src, m.index ?? 0)
    if (/translate/i.test(ctx) && peak > CANVAS_W) {
      out.push({
        level: "warn",
        message: `translate range peaks at ${peak}px (line ${near}) — past the ${CANVAS_W}px canvas width. The element leaves the frame; overflow.`,
      })
    } else if (!/translate|scale|rotate|opacity|clipPath/.test(ctx) && peak > CANVAS_W * 1.2) {
      out.push({
        level: "warn",
        message: `interpolate() output peaks at ${peak}px (line ${near}) with no obvious transform context — likely an off-canvas overflow.`,
      })
    }
    if (/scale/i.test(ctx) && Math.max(...outs) > 1.5 && /position:\s*['"]absolute['"]/.test(src)) {
      out.push({
        level: "warn",
        message: `scale peaks above 1.5x (line ${near}) on an absolutely-positioned element — elements near edges will overflow. Keep scale ≤1.5 or pull the element inward.`,
      })
      break
    }
  }

  // Display type set too tight, body type set too tight.
  {
    const sizes = [...src.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]))
    const leadings = [...src.matchAll(/lineHeight:\s*(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]))
    const hasDisplay = sizes.some((s) => s >= 64)
    const hasBody = sizes.some((s) => s <= 44)
    if (hasDisplay && leadings.some((l) => l < 0.9)) {
      out.push({
        level: "warn",
        message: `Display type (≥64px) with lineHeight under 0.9 — glyphs collide. Display wants 0.95-1.05; body wants 1.3-1.5.`,
      })
    }
    if (hasBody && leadings.some((l) => l < 1.2)) {
      out.push({
        level: "warn",
        message: `Body/small type with lineHeight under 1.2 — lines crush together on video. Body wants 1.3-1.5.`,
      })
    }
  }

  // --- advanced code quality (AGENT_UPGRADE_PLAN Phase 1) ---------------------

  // interpolate(frame, ...) with no frame binding in scope.
  if (
    /interpolate\(\s*frame\b/.test(src) &&
    !/useCurrentFrame\(\)/.test(src) &&
    !/(?:const|let|var)\s+frame\b/.test(src)
  ) {
    out.push({
      level: "error",
      message: "interpolate() reads `frame`, but no frame variable exists. Add `const frame = useCurrentFrame();` inside the component.",
    })
  }

  // Hardcoded long-range timing with no video config to retime from.
  if (!/useVideoConfig\(\)/.test(src)) {
    const magic = [...src.matchAll(/(?:from=\{|durationInFrames=\{|interpolate\(\s*frame\s*,\s*\[)\s*(\d{3,})/g)].map(
      (m) => Number(m[1])
    )
    if (magic.some((n) => n > 450)) {
      out.push({
        level: "warn",
        message: "Timing uses hardcoded frame numbers past 450 with no useVideoConfig(). One duration change means retyping every number — read durationInFrames from useVideoConfig() instead.",
      })
    }
  }

  // Wall-clock time breaks frame determinism the same way Math.random does.
  if (/\bDate\.now\s*\(/.test(src) || /\bperformance\.now\s*\(/.test(src)) {
    out.push({
      level: "error",
      message: "Date.now()/performance.now() is non-deterministic — every render pass would produce different frames. Derive everything from useCurrentFrame().",
    })
  }

  // Compositions are scrubbed frames, not interactive pages.
  if (/\bonClick\s*=|\bonMouse\w+\s*=|\bonPointer\w+\s*=|\bonHover\s*=|addEventListener\s*\(/.test(src)) {
    out.push({
      level: "error",
      message: "Event listeners (onClick/onHover/addEventListener) never fire in a Remotion render — the output is video frames. Remove them; animate from useCurrentFrame() instead.",
    })
  }

  // Async work without a render gate leaves holes in the output.
  if (
    (/\basync\b|\bawait\s|fetch\s*\(|Promise\./.test(src)) &&
    !/continueRender|delayRender/.test(src)
  ) {
    out.push({
      level: "warn",
      message: "Async work (async/await, fetch, Promise) without a continueRender/delayRender pair — the renderer will not wait for it. Gate it or precompute the data.",
    })
  }

  // useEffect without cleanup leaks across frame scrubs.
  if (/useEffect\s*\(/.test(src) && !/return\s*(\(\s*\)\s*=>|function)/.test(src)) {
    out.push({
      level: "warn",
      message: "useEffect without a cleanup return — effects re-run as the renderer scrubs frames. Return a cleanup function.",
    })
  }

  // Refs bypass the frame clock.
  if (/\buseRef\s*\(/.test(src)) {
    out.push({
      level: "warn",
      message: "useRef used in frame rendering — refs do not re-derive per frame and go stale. Derive the value from useCurrentFrame() instead.",
    })
  }

  // --- motion quality heuristics (AGENT_UPGRADE_PLAN Phase 1) ----------------
  // Advisory only (warn): these read as cheap motion, never as broken code.

  {
    const interpolates = (src.match(/interpolate\(/g) ?? []).length
    const easings = (src.match(/Easing\./g) ?? []).length
    const springs = (src.match(/\bspring\(/g) ?? []).length
    const hasTransform = /translate[XY]|scale|rotate|skew/i.test(src)
    const hasOpacity = /opacity/i.test(src)
    const hasMap = /\.map\(/.test(src)
    const hasStagger = /delay|stagger|index\s*[\*\+\-]/.test(src)

    if (interpolates > 0 && easings === 0 && springs === 0) {
      out.push({
        level: "warn",
        message: `All ${interpolates} interpolate() call(s) use default linear timing — linear motion reads as robotic. Give each move an Easing.bezier(0.16, 1, 0.3, 1) or a spring().`,
      })
    } else if (interpolates > 0 && springs === 0) {
      out.push({
        level: "warn",
        message: "Nothing settles — no spring() in the composition. At least one element should arrive with a spring or an overshoot so the cut has a landing.",
      })
    }
    if (hasOpacity && !hasTransform) {
      out.push({
        level: "warn",
        message: "The cut animates opacity only. Fading is the weakest kind of change — add translate, scale or rotate so elements have direction.",
      })
    }
    if (hasMap && !hasStagger) {
      out.push({
        level: "warn",
        message: "A list maps over items with no stagger. Offset each item's start (e.g. index * 3 frames) to turn a block into a sequence.",
      })
    }

    // Transitions faster than ~15 frames are felt, not seen.
    for (const m of src.matchAll(/interpolate\(\s*frame\s*,\s*\[([^\]]*)\]/g)) {
      const nums = (m[1] ?? "").split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n))
      for (let i = 1; i < nums.length; i++) {
        const span = (nums[i] ?? 0) - (nums[i - 1] ?? 0)
        if (span > 0 && span < 15) {
          out.push({
            level: "warn",
            message: `A transition spans ${span} frames (line ${lineOf(src, m.index ?? 0)}) — under 15 frames it is too fast to perceive. Hold it for at least 15-24 frames.`,
          })
          break
        }
      }
      break // first offending range is enough to act on
    }

    // Sequential Sequences with no handoff read as a slide deck.
    {
      const seqs = [...src.matchAll(/<Sequence[^>]*from=\{(\d+)\}[^>]*durationInFrames=\{(\d+)\}/g)].map((m) => ({
        from: Number(m[1]),
        to: Number(m[1]) + Number(m[2]),
      }))
      if (seqs.length >= 2) {
        const sorted = [...seqs].sort((a, b) => a.from - b.from)
        const overlaps = sorted.some((s, i) => i > 0 && s.from < (sorted[i - 1]?.to ?? 0))
        if (!overlaps) {
          out.push({
            level: "warn",
            message: `${sorted.length} Sequences run end-to-end with no overlap — isolated blocks, no handoff. Start each beat 10-15 frames before the previous ends.`,
          })
        }
      }
    }
  }

  return out
}

export interface PlanBeat {
  from: number
  to: number
  what: string
}

/**
 * Phase 1: feasibility check BEFORE codegen (IMPLEMENTATION_PLAN.md §3.3).
 * Pure function so both the tool and the prompt path share one rule set.
 */
export function preValidatePlan(
  beats: PlanBeat[],
  maxFrames = 900
): { ok: boolean; issues: string[]; fixes: string[] } {
  const issues: string[] = []
  const fixes: string[] = []
  if (beats.length < 2) {
    issues.push("A single beat stretched to fill the clip reads as a slide — add a second beat with a different idea.")
    fixes.push("Split the clip into at least two beats (e.g. entrance 0-90, resolve 90-180).")
  }
  const sorted = [...beats].sort((a, b) => a.from - b.from)
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i]!
    if (b.from < 0 || b.to <= b.from) {
      issues.push(`Beat ${i} has an invalid window (${b.from}→${b.to}); need 0 ≤ from < to.`)
      fixes.push(`Clamp beat ${i} to a positive window inside 0-${maxFrames}.`)
    }
    if (b.to > maxFrames) {
      issues.push(`Beat ${oteric(i, b.to, maxFrames)}`)
      fixes.push(`Tighten beat ${i} to end at or before frame ${maxFrames} (30s).`)
    }
    if (!b.what || b.what.trim().length < 12) {
      issues.push(`Beat ${i} names no real props or easing ("${b.what || "empty"}").`)
      fixes.push(`Name the props and easing, e.g. 'translateX 0→-420, Easing.bezier(0.16,1,0.3,1)'.`)
    }
    const next = sorted[i + 1]
    if (next && next.from < b.to - 1) {
      // Overlap of 1 frame is a deliberate handoff; more is a likely typo.
      if (b.to - next.from > 30) {
        issues.push(`Beat ${i} (${b.from}→${b.to}) overlaps beat ${i + 1} (${next.from}→${next.to}) by ${b.to - next.from} frames.`)
        fixes.push(`Overlap deliberately (≤30f handoff) or start beat ${i + 1} at ${b.to - 15}.`)
      }
    }
    if (next && next.from > b.to + 150) {
      issues.push(`Gap of ${next.from - b.to} frames between beat ${i} and ${i + 1} — the frame sits dead.`)
      fixes.push(`Bridge the gap with an overlap or a holding beat.`)
    }
  }
  return { ok: issues.length === 0, issues, fixes }
}

function oteric(i: number, to: number, max: number): string {
  return `Beat ${i} ends at frame ${to}, past the ${max}-frame (30s) limit.`
}

/**
 * Phase 1: timing/duration/frame-budget solver (IMPLEMENTATION_PLAN.md §3.3).
 * Returns a valid retiming or an impossibility report — never throws.
 */
export function constraintSolve(
  totalFrames: number,
  beats: PlanBeat[],
  maxFrames = 900
): { ok: boolean; totalFrames: number; beats: PlanBeat[]; note: string } {
  if (totalFrames <= 0) {
    return { ok: false, totalFrames, beats, note: "Total duration must be a positive frame count." }
  }
  if (totalFrames > maxFrames) {
    const scale = maxFrames / totalFrames
    const squeezed: PlanBeat[] = beats.map((b) => ({
      ...b,
      from: Math.floor(b.from * scale),
      to: Math.max(Math.floor(b.from * scale) + 15, Math.floor(b.to * scale)),
    }))
    return {
      ok: true,
      totalFrames: maxFrames,
      beats: squeezed,
      note: `Over budget (${totalFrames}f) — proportionally squeezed to ${maxFrames}f. Verify beats still read.`,
    }
  }
  const heavy = beats.length * totalFrames
  if (heavy > 9000) {
    return {
      ok: true,
      totalFrames,
      beats,
      note: `Frame budget high (${beats.length} beats × ${totalFrames}f). Keep effects cheap: transforms + opacity, avoid per-frame blur/noise.`,
    }
  }
  return { ok: true, totalFrames, beats, note: "Constraints satisfied — no retiming needed." }
}

/** Phase 1: import → scope map (IMPLEMENTATION_PLAN.md §3.3). */
export function dependencyResolve(imports: string[]): {
  ok: boolean
  resolved: Array<{ source: string; status: "ok" | "replace"; hint: string }>
} {
  const PROVIDED = new Set([
    "remotion",
    "react",
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
  ])
  const resolved = imports.map((source) => {
    const s = source.trim()
    if (s.startsWith(".") || PROVIDED.has(s)) {
      return { source: s, status: "ok" as const, hint: "Available in the browser scope." }
    }
    if (s === "@remotion/google-fonts/Anton" || s.startsWith("@remotion/google-fonts/")) {
      return {
        source: s,
        status: "replace" as const,
        hint: "Do not import google-fonts directly — Fonts.* is already in scope via the registry.",
      }
    }
    return {
      source: s,
      status: "replace" as const,
      hint: `Not in the browser scope. Use remotion/react/relative or one of: ${[...PROVIDED].filter((p) => p.startsWith("@remotion")).join(", ")}.`,
    }
  })
  return { ok: resolved.every((r) => r.status === "ok"), resolved }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

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

// The player strips every import and resolves identifiers from a fixed
// scope. lucide-react is registered there ONLY as the `Lucide`
// namespace, so a named import like `import {Zap} from "lucide-react"`
// compiles but throws "<name> is not available" the moment the player
// mounts it. Named lucide imports are therefore hard errors.
const LUCIDE_SAFE: ReadonlySet<string> = new Set()

/** Capitalised names the browser scope provides without an import. */
const SCOPE_GLOBALS = new Set([
  "React", "Fonts", "Lucide", "Shapes", "Paths", "Noise",
  "TransitionSeries", "Transition", "Overlay", "Interactive",
  "Solid", "CanvasImage", "HtmlInCanvas", "AnimatedImage", "IFrame",
  "CameraMotionBlur", "HtmlInCanvasMotionBlur", "Trail",
])

/** Standard JS globals and TS utility types that never throw at runtime. */
const LANGUAGE_GLOBALS = new Set([
  "Error", "Set", "Map", "WeakSet", "WeakMap", "Promise", "RegExp",
  "Object", "Array", "String", "Number", "Boolean", "Symbol",
  "Date", "Math", "JSON", "Intl", "Record", "Partial", "Omit", "Pick",
  "Readonly", "Required", "Exclude", "Extract", "NonNullable",
  "HTMLElement", "Element", "Event", "Node", "Window", "Document",
  "ComponentType", "ReactNode", "CSSProperties",
])

/**
 * Code with comments, strings and JSX text blanked (length-preserving, so
 * line numbers survive). Identifier scans must run on this, never on raw
 * source: a headline like `SCROLL FOR MORE`, a brand word, or a `// Beat 1`
 * comment is content, not a variable — scanning raw source flagged every
 * composition with real copy as "not in the player scope" and rejected
 * files that render fine, including hand-written ones.
 */
function stripNoise(src: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, " ")
  const noComments = src
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/\/\/[^\n]*/g, blank)
    .replace(/`(?:\\.|[^`\\])*`/g, blank)
    .replace(/"(?:\\.|[^"\\])*"/g, blank)
    .replace(/'(?:\\.|[^'\\])*'/g, blank)
  // JSX text nodes between tags: `>Motion that lands<` and `>Hello {name}<`
  // are rendered copy, not identifiers. Expressions stay (they hold real
  // code); only the literal text around them is blanked.
  return noComments.replace(/>([^<>]+)</g, (m, inner: string) => {
    const kept = inner.replace(/\{[^{}]*\}/g, (e: string) => "\0".repeat(e.length))
    let out = ""
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i]!
      out += kept[i] === "\0" ? c : c === "\n" ? "\n" : " "
    }
    return `>${out}<`
  })
}

/**
 * Names a composition references that the browser scope cannot
 * provide. The player strips imports and resolves every identifier
 * from a fixed scope, so anything outside it is a hard ReferenceError
 * at mount — caught here, in the same turn, instead of at preview.
 */
function scopeViolations(src: string, imports: Array<{ clause: string; source: string }>): Check[] {
  const out: Check[] = []
  const clean = stripNoise(src)

  for (const imp of imports) {
    if (imp.source !== "lucide-react") continue
    const named = imp.clause.match(/\{([\s\S]*?)\}/)?.[1]
    if (!named) continue
    for (const raw of named.split(",")) {
      const name = raw.split(/\s+as\s+/).pop()?.trim()
      if (name && !LUCIDE_SAFE.has(name)) {
        out.push({
          level: "error",
          message: `"${name}" from lucide-react is not registered in the player scope — it compiles but throws "${name} is not available" at mount. Use the Lucide namespace instead (import * as Lucide, then <Lucide.${name} />) or an inline <svg>.`,
        })
      }
    }
  }

  // `import {Fonts} from "../fonts"` — there is no such module; Fonts
  // is already a global in the player scope, and the broken path
  // blanks the preview at compile time.
  for (const imp of imports) {
    if (imp.source.startsWith(".") && /Fonts/.test(imp.clause)) {
      out.push({
        level: "error",
        message: `Do not import Fonts from "${imp.source}" — Fonts is already in scope as a global. Write fontFamily: Fonts.unbounded.family directly, no import.`,
      })
    }
  }

  // Capitalised identifiers that are neither declared, nor imported,
  // nor core Remotion API: the exact class of failure the player
  // reports as "<name> is not available". Scanned on noise-stripped
  // source so JSX copy and comments are never mistaken for code.
  const declared = new Set<string>()
  for (const m of clean.matchAll(/\b(?:const|let|var|function|class|type|interface)\s+([A-Za-z_$][\w$]*)/g)) {
    declared.add(m[1]!)
  }
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
  const REMOTION_CORE = new Set([
    "AbsoluteFill", "Sequence", "Series", "Composition", "useCurrentFrame",
    "useVideoConfig", "interpolate", "interpolateColors", "spring", "Easing",
    "cancelRender", "continueRender", "delayRender", "staticFile", "random",
    "Noise", "Loop", "Freeze", "Still", "Audio", "Img", "Video",
    "OffthreadVideo", "Shapes", "Paths", "TransitionSeries", "Transition",
    "Overlay", "linearTiming", "springTiming", "useTransitionProgress",
  ])
  for (const m of clean.matchAll(/(?<![.\w$'"`])([A-Z][A-Za-z0-9_$]{1,})\s*(?=[(<{[\s,;)}])/g)) {
    const name = m[1]!
    if (
      declared.has(name) ||
      REMOTION_CORE.has(name) ||
      SCOPE_GLOBALS.has(name) ||
      LANGUAGE_GLOBALS.has(name)
    ) continue
    out.push({
      level: "error",
      message: `"${name}" is not defined here and not in the player scope — it will throw "${name} is not available" at mount. Declare it, import it from remotion/react, or use Lucide.${name}.`,
    })
  }
  return out
}

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
  // Hard failures the browser compiler would throw at mount: unregistered
  // lucide icons, phantom relative imports, undefined identifiers.
  out.push(...scopeViolations(src, imports))

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
        level: "error",
        message: `fontFamily "${stack}" (line ${lineOf(src, m.index ?? 0)}) is a browser page default — it is never a deliberate choice in a motion composition and reads as unfinished. Replace it with Fonts.<name>.family (e.g. Fonts.unbounded.family for modern, Fonts.bricolage.family for playful). Run load_skill("typography") for the full catalogue.`,
      })
    }
    // Inter and Roboto are the "nobody chose" defaults of generated UI — the
    // brief asks for creative type, so reaching for them unasked reads as
    // unfinished. Name them only when the user explicitly asks for them.
    if (/^(Inter|Roboto)(\s*,|$)/i.test(stack)) {
      out.push({
        level: "error",
        message: `fontFamily "${stack}" (line ${lineOf(src, m.index ?? 0)}) defaults to Inter/Roboto — pick a deliberate Google Fonts face instead (Fonts.<CamelCase>.family, any family works). Use Inter or Roboto only when the user explicitly names them.`,
      })
    }
  }

  // The dynamic loader serves ANY Google Fonts family, including the default
  // faces — so the Fonts.* path gets the same no-Inter/Roboto rule, not a
  // silent pass. (These are unquoted references, checked outside the string loop.)
  for (const m of src.matchAll(/fontFamily:\s*Fonts\.(inter|roboto)\.family\b/gi)) {
    out.push({
      level: "error",
      message: `Fonts.${m[1]} (line ${lineOf(src, m.index ?? 0)}) is a default face — pick a deliberate Google Fonts family instead (any Fonts.<CamelCase>.family works). Use Inter or Roboto only when the user explicitly names them.`,
    })
    break
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

  // Remotion docs: never animate fontSize — it re-lays-out text every frame
  // and reads as jitter. Animate translate/scale/opacity + letterSpacing.
  if (/fontSize:\s*(interpolate\s*\(|spring\s*\()/i.test(src)) {
    out.push({
      level: "error",
      message:
        "fontSize is driven by interpolate()/spring(). Never animate fontSize — " +
        "animate translate/scale/opacity (and letterSpacing for tracking punches) instead.",
    })
  }

  // Series positions its clips itself — a from= on Series.Sequence fights it.
  // Overlap with offset={-15}, the same 10-15f handoff beats use.
  if (/<Series\.Sequence[^>]*\bfrom\s*=/i.test(src)) {
    out.push({
      level: "error",
      message:
        "<Series.Sequence> takes no from= — Series positions clips back-to-back itself. " +
        "Overlap beats with offset={-15} instead.",
    })
  }

  // Docs: always premount a Sequence, or the first frames render unready.
  if (/<Sequence[\s>]/i.test(src) && !/premountFor\s*=/i.test(src)) {
    out.push({
      level: "warn",
      message:
        "A <Sequence> without premountFor — add premountFor={1 * fps} so the first " +
        "frames never render before the scene is ready.",
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

  // Single absolute offsets that alone escape the canvas. Advisory: entering
  // and exiting elements live off-canvas by design — the bug is one that
  // never appears, which the player report (not this heuristic) proves.
  for (const m of src.matchAll(/(?:left|top|right|bottom|width|height):\s*(-?\d+(?:\.\d+)?)/g)) {
    const v = Number(m[1])
    const near = lineOf(src, m.index ?? 0)
    if (Math.abs(v) > CANVAS_W && Math.abs(v) > CANVAS_H) {
      out.push({
        level: "warn",
        message: `Position/size ${v}px (line ${near}) sits outside the ${CANVAS_W}x${CANVAS_H} canvas — normal for an element that enters the frame (advisory): only fix it if the element never appears on screen.`,
      })
      break // one warning is enough; the model does not need all of them
    }
  }

  // Duplicate z-index on positioned elements: advisory only. Siblings in DOM
  // order usually paint fine — separate them only if layers actually fight.
  {
    const positioned = (src.match(/position:\s*['"]absolute['"]/g) ?? []).length
    const zValues = [...src.matchAll(/zIndex:\s*(\d+)/g)].map((m) => m[1])
    if (positioned >= 2 && zValues.length >= 2) {
      const dupes = zValues.filter((z, i) => zValues.indexOf(z) !== i)
      if (dupes.length > 0) {
        out.push({
          level: "warn",
          message: `z-index note (advisory): ${positioned} absolutely-positioned elements share zIndex ${[...new Set(dupes)].join(", ")}. DOM order already paints siblings correctly — only separate layers that actually fight (background=1, content=10, overlays=20, UI=30).`,
        })
      } else if (zValues.length < positioned) {
        out.push({
          level: "warn",
          message: `${positioned} absolutely-positioned elements but only ${zValues.length} declare zIndex (advisory). Declare one per layer (background=1, content=10, overlays=20, UI=30) where paint order matters.`,
        })
      }
    }
  }

  // Two absolutely-positioned elements at the exact same spot: always a bug,
  // never a design — one of them was meant to move. Advisory, one warning.
  // Layers without an explicit left+top (full-bleed fills, inset layers) are
  // skipped: with no coordinates there is no spot to compare, and counting
  // them flagged every intentional backdrop as an overlap.
  {
    const posRe = /position:\s*['"]absolute['"]/g
    const seen = new Map<string, number>()
    let m: RegExpExecArray | null
    while ((m = posRe.exec(src)) !== null) {
      const window = src.slice(m.index, m.index + 500)
      const left = /left:\s*(?:"([^"]+)"|'([^']+)'|(-?\d+(?:\.\d+)?))/.exec(window)?.[0]
      const top = /top:\s*(?:"([^"]+)"|'([^']+)'|(-?\d+(?:\.\d+)?))/.exec(window)?.[0]
      if (!left || !top) continue
      const key = `${left} | ${top}`
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    const dupe = [...seen.entries()].find(([, n]) => n >= 2)
    if (dupe) {
      out.push({
        level: "warn",
        message: `Two absolutely-positioned elements share the spot (${dupe[0]}) — they paint on top of each other. Stack text in one flex column with gap, or offset one deliberately (see layout-composition).`,
      })
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
        message: `translate range reaches ${peak}px (line ${near}) — past the canvas edge. Entrances and exits do this by design (advisory): only fix it if the element never appears on screen.`,
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
        message: `scale peaks above 1.5x (line ${near}) — fine for a punch-in or bloom that settles inside the frame (advisory): the player report, not this heuristic, is the authority on whether it renders.`,
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
    // Tight leading is only suspicious when there is NO display type: a hero
    // legitimately uses 0.95-1.05, and flagging it alongside body copy made
    // every hero+body composition warn — including the starter itself.
    if (hasBody && !hasDisplay && leadings.some((l) => l < 1.2)) {
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

  // --- new hard errors from analysis: blank-frame bugs ---------------------

  // interpolate() on opacity/scale without extrapolateRight: "clamp"
  // causes values to run past their range (opacity goes negative, scale
  // grows unbounded) after the animation window ends — blank or broken frame.
  {
    const interpMatches = [...src.matchAll(/interpolate\(\s*frame\s*,\s*\[[^\]]*\]\s*,\s*\[([^\]]*)\]/g)]
    for (const m of interpMatches) {
      const outputs = (m[1] ?? "").split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n))
      if (outputs.length < 2) continue
      const min = Math.min(...outputs)
      const max = Math.max(...outputs)
      // Only flag when the range is bounded [0,1] or [0,n≤2] — the patterns
      // that go invisible/garbled when they extrapolate past the boundary.
      const isBoundedRange = min >= 0 && max <= 2
      if (!isBoundedRange) continue
      // The context around this call — look for opacity or scale to be sure.
      const ctx = src.slice(Math.max(0, (m.index ?? 0) - 300), (m.index ?? 0) + 200)
      const isOpacityOrScale = /opacity|scale/i.test(ctx)
      if (!isOpacityOrScale) continue
      // Check if this specific call has an options object with extrapolate.
      // Take the slice just past the output array to the end of the options
      // object. NOTE: never split on ")" — an Easing.bezier(0.16, 1, 0.3, 1)
      // inside the options contains parens, and splitting there truncated the
      // search before extrapolateRight, flagging clamped calls as unclamped
      // (every auto-repaired file failed validation because of this).
      const afterOutputs = src.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 300)
      const optsEnd = afterOutputs.indexOf("})")
      const opts = optsEnd === -1 ? afterOutputs.split(")")[0] ?? "" : afterOutputs.slice(0, optsEnd)
      const hasClamp = /extrapolate(?:Left|Right)\s*:\s*["']clamp["']/.test(opts)
      if (!hasClamp) {
        const near = lineOf(src, m.index ?? 0)
        out.push({
          level: "error",
          message:
            `interpolate() on opacity/scale at line ${near} has no extrapolateRight: "clamp". ` +
            `After frame ${outputs[outputs.length - 1]} the value continues past ${max} — ` +
            `element becomes invisible or oversized. Add { extrapolateRight: "clamp" } as the fourth argument.`,
        })
        break // one instance is enough to require a fix; avoid spam
      }
    }
  }

  // spring() without both frame and fps produces NaN — blank frame.
  // The only safe form is spring({ frame: ..., fps: ..., config: ... }).
  {
    for (const m of src.matchAll(/\bspring\s*\(\s*\{([^}]*)\}/g)) {
      const body = m[1] ?? ""
      const hasFrame = /\bframe\b/.test(body)
      const hasFps = /\bfps\b/.test(body)
      if (!hasFrame || !hasFps) {
        const near = lineOf(src, m.index ?? 0)
        const missing = [!hasFrame && "frame", !hasFps && "fps"].filter(Boolean).join(" and ")
        out.push({
          level: "error",
          message:
            `spring() at line ${near} is missing ${missing}. ` +
            `Without both, spring() returns NaN and renders a blank frame. ` +
            `Use spring({ frame: frame - startFrame, fps, config: { damping, mass, stiffness } }).`,
        })
        break
      }
    }
  }

  // interpolateColors() with non-hex/non-valid CSS colour strings produces
  // undefined style values — invisible text.
  {
    for (const m of src.matchAll(/interpolateColors\s*\([^,]+,\s*\[[^\]]*\]\s*,\s*\[([^\]]*)\]/g)) {
      const colorsRaw = m[1] ?? ""
      // Extract quoted strings from the colours array
      const colorStrings = [...colorsRaw.matchAll(/["']([^"']+)["']/g)].map((c) => c[1] ?? "")
      const VALID_COLOR = /^(#[0-9a-fA-F]{3,8}|rgb\(|rgba\(|hsl\(|hsla\(|transparent|black|white|red|blue|green|yellow|orange|purple|pink|gray|grey|navy|coral|cyan|magenta|lime|indigo|violet|teal|brown|tan|olive|silver|gold|crimson|turquoise|aqua|maroon|fuchsia)/
      for (const color of colorStrings) {
        if (!VALID_COLOR.test(color.trim())) {
          const near = lineOf(src, m.index ?? 0)
          out.push({
            level: "error",
            message:
              `interpolateColors() at line ${near} contains "${color}" which is not a valid CSS colour. ` +
              `Invalid values produce undefined — invisible text or background. ` +
              `Use hex (#rrggbb), rgb(...), or a named CSS colour.`,
          })
          break
        }
      }
    }
  }

  // useEffect with [frame] in its dependency array fires on every scrub —
  // expensive and produces incorrect, non-deterministic output.
  {
    for (const m of src.matchAll(/useEffect\s*\([^,)]*,\s*\[([^\]]*)\]/g)) {
      const deps = m[1] ?? ""
      if (/\bframe\b/.test(deps)) {
        const near = lineOf(src, m.index ?? 0)
        out.push({
          level: "error",
          message:
            `useEffect at line ${near} depends on [frame]. This fires on every scrub and produces ` +
            `non-deterministic output — the effect runs thousands of times during a render. ` +
            `Derive the value from useCurrentFrame() and frame directly, without useEffect.`,
        })
        break
      }
    }
  }

  // Bare CSS keywords as style values (`display: flex`, `position: absolute`)
  // are the commonest runtime ReferenceError in generated cuts: they read as
  // identifiers, not strings. display:/position: values are literals in
  // practice — a variable named `flex` is never what the model meant.
  {
    // Quoted values never match (the char after `:` is `"`), so any match
    // here is a genuinely bare identifier.
    for (const m of src.matchAll(/\bdisplay\s*:\s*(flex|block|inline|grid|contents|none)\b/g)) {
      out.push({
        level: "error",
        message:
          `display: ${m[1]} (line ${lineOf(src, m.index ?? 0)}) is a bare identifier — ` +
          `at runtime it throws "${m[1]} is not defined". Quote it: display: "${m[1]}".`,
      })
      break
    }
    for (const m of src.matchAll(/\bposition\s*:\s*(absolute|relative|fixed|sticky)\b/g)) {
      out.push({
        level: "error",
        message:
          `position: ${m[1]} (line ${lineOf(src, m.index ?? 0)}) is a bare identifier — ` +
          `at runtime it throws "${m[1]} is not defined". Quote it: position: "${m[1]}".`,
      })
      break
    }
  }

  // <Video> or <Audio> without crossOrigin="anonymous" when src is an http URL
  // causes canvas tainting that breaks any effect that reads pixel data.
  {
    const mediaTagRe = /<(Video|Audio|OffthreadVideo)\s([^>]*?)(?:\/?>|>)/gs
    for (const m of src.matchAll(mediaTagRe)) {
      const attrs = m[2] ?? ""
      const srcMatch = attrs.match(/src=\{?["']?(https?:\/\/[^"'\s}]+)["']?\}?/)
      if (srcMatch && !/crossOrigin/.test(attrs)) {
        const near = lineOf(src, m.index ?? 0)
        out.push({
          level: "warn",
          message:
            `<${m[1]}> at line ${near} loads from ${srcMatch[1].slice(0, 60)}... without crossOrigin="anonymous". ` +
            `This taints the canvas and breaks effects that read pixel data (blur, effects, compositing). ` +
            `Add crossOrigin="anonymous" as a prop.`,
        })
        break
      }
    }
  }

  // <Audio startFrom={non-integer}> — startFrom requires an integer; a float
  // causes the audio to fail silently.
  {
    for (const m of src.matchAll(/<Audio\s[^>]*startFrom=\{([^}]+)\}/g)) {
      const expr = (m[1] ?? "").trim()
      // Only flag plain float literals — expressions like Math.round(...) are fine.
      if (/^\d+\.\d+$/.test(expr)) {
        const near = lineOf(src, m.index ?? 0)
        out.push({
          level: "warn",
          message:
            `<Audio> startFrom={${expr}} at line ${near} is a float — startFrom must be an integer or the audio fails silently. ` +
            `Use Math.round(${expr}) or compute it as an integer.`,
        })
      }
    }
  }

  // Duplicate import sources produce TS warnings that confuse the model.
  {
    const sources = imports.map((imp) => imp.source)
    const seen = new Set<string>()
    for (const source of sources) {
      if (seen.has(source)) {
        out.push({
          level: "warn",
          message:
            `"${source}" is imported more than once. Merge all imports from this module into a single import statement ` +
            `to avoid TypeScript compile warnings and confusing the tree-shaker.`,
        })
        break // one warning is enough
      }
      seen.add(source)
    }
  }

  // --- motion quality heuristics (AGENT_UPGRADE_PLAN Phase 1) ----------------
  // Advisory only (warn): these read as cheap motion, never as broken code.

  {
    const interpolates = (src.match(/interpolate\(/g) ?? []).length
    const easings = (src.match(/Easing\./g) ?? []).length
    const springs = (src.match(/\bspring\(/g) ?? []).length
    const hasTransform = /translate[XY]?|scale|rotate|skew/i.test(src)
    const hasOpacity = /opacity/i.test(src)
    const hasMap = /\.map\(/.test(src)
    // Stagger patterns: explicit delay/stagger variable, or index multiplied/added
    // to a number (e.g. `i * 3`, `index + 2`, `idx * 5`).
    const hasStagger = /\bdelay\b|\bstagger\b|\b(?:index|idx|i)\s*[\*\+]\s*\d/.test(src)

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
        message: "A list maps over items with no stagger. Offset each item's start by index (e.g. `i * 3` frames) to turn a block appearance into a cascade.",
      })
    }

    // Transitions faster than ~15 frames are felt, not seen.
    {
      let firedFastTransition = false
      for (const m of src.matchAll(/interpolate\(\s*frame\s*,\s*\[([^\]]*)\]/g)) {
        if (firedFastTransition) break
        const nums = (m[1] ?? "").split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n))
        for (let i = 1; i < nums.length; i++) {
          const span = (nums[i] ?? 0) - (nums[i - 1] ?? 0)
          if (span > 0 && span < 15) {
            out.push({
              level: "warn",
              message:
                `A transition spans ${span} frames (line ${lineOf(src, m.index ?? 0)}) — too fast to perceive (under 15 frames at 30fps). ` +
                `Hold it for at least 15-24 frames so the motion registers.`,
            })
            firedFastTransition = true
            break
          }
        }
      }
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
            message: `${sorted.length} Sequences run end-to-end with no overlap — isolated blocks, no handoff. Start each beat 10-15 frames before the previous ends so elements cross-dissolve rather than cut.`,
          })
        }
      }
    }

    // Entrance/exit motion validation: elements that have position absolute
    // but no translate/scale animation are static layers with no entrance.
    // Only fire if there are at least 2 positioned elements and none animate.
    {
      const positioned = (src.match(/position:\s*['"]absolute['"]/g) ?? []).length
      const hasAnyMotion = /translate|scale|rotate|opacity\s*:\s*interpolate|spring\s*\(/.test(src)
      if (positioned >= 2 && !hasAnyMotion && interpolates === 0) {
        out.push({
          level: "warn",
          message:
            `${positioned} absolutely-positioned elements with no entrance or exit motion. ` +
            `Static layers read as a still image — give each element a translate, scale or opacity entrance from useCurrentFrame().`,
        })
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
      issues.push(`Beat ${beatEndsPastLimit(i, b.to, maxFrames)}`)
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

function beatEndsPastLimit(i: number, to: number, max: number): string {
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
      // lucide-react resolves as a namespace only: `import * as Lucide`
      // works, but named imports (import {Zap}) throw at mount.
      if (s === "lucide-react") {
        return { source: s, status: "ok" as const, hint: "Available ONLY as the Lucide namespace — `import * as Lucide`, then <Lucide.Zap/>. Named imports (import {Zap}) throw. When in doubt use an inline <svg>." }
      }
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

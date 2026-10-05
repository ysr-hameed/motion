import { MAX_FONT, MIN_FONT, SAFE_MARGIN } from "./type"
import { MAX_ASSETS, MAX_PART, parseBundle } from "./bundle"

/**
 * Static checks on a web motion bundle.
 *
 * These run in the Worker, not the browser, so the model finds out about a
 * broken bundle in the same turn it wrote it. The sandboxed iframe is the
 * authority on whether a cut actually mounts — this is the cheap pass that
 * catches the failures worth catching before spending a render on them.
 */

export interface Check {
  level: "error" | "warn"
  message: string
}

/** 1-based line number for a character offset, so messages are actionable. */
function lineOf(src: string, index: number): number {
  return src.slice(0, index).split("\n").length
}

/**
 * Basic-motion gate — blocking at WRITE, advisory in taxonomy.
 *
 * Linear-only timing and stagger-less maps are never a finished cut: the
 * write is refused with the fix instead of stored. Deliberately narrow so
 * recovery scenarios still verify.
 */
export function basicMotionBlocks(checks: Array<{ level: string; message: string }>): string[] {
  const blocks: string[] = []
  for (const c of checks) {
    if (c.level !== "warn") continue
    if (/linear motion reads as robotic/i.test(c.message)) {
      blocks.push(
        "BASIC MOTION — refused: every move uses default linear timing. " +
          "Give each move an easing (ctx.Easing.easeOut / ctx.Easing.bezier) or land it with ctx.spring().",
      )
    } else if (/maps over items with no stagger/i.test(c.message)) {
      blocks.push(
        "BASIC MOTION — refused: a list builds items with identical timing. " +
          "Offset each item's start time (e.g. t - (start + i * 0.12)) so the list cascades instead of flashing on.",
      )
    }
  }
  return [...new Set(blocks)]
}

/**
 * Eval-free JS syntax check: bracket/paren/brace balance plus unterminated
 * strings, templates, and comments — the failures that kill the sandbox
 * driver at parse time. Single pass, aware of strings (all three quotes),
 * template `${}` nesting, regex literals (heuristic start detection), and
 * both comment styles. Returns a message with a line number, or null.
 *
 * Deliberately narrow: it cannot catch every SyntaxError (a full parser
 * would need code generation, which Workers forbid), but unbalanced
 * delimiters are what truncated model output actually produces.
 */
export function checkJsSyntax(js: string): string | null {
  const lineOf = (idx: number) => js.slice(0, idx).split("\n").length
  type Frame = { ch: "(" | "[" | "{"; line: number }
  const stack: Array<Frame | { tpl: true; line: number }> = []
  let str: { q: "'" | '"' | "`"; line: number } | null = null
  let lineComment = false
  let blockComment = false
  let escaped = false
  // Previous significant char, for regex-vs-division. Empty at start.
  let prev = ""
  const REGEX_AFTER = "=(:,[!&|?{};~^<>+-*%"

  const isTpl = (f: Frame | { tpl: true; line: number }): f is { tpl: true; line: number } =>
    (f as { tpl: true }).tpl === true

  let i = 0
  const n = js.length
  while (i < n) {
    const ch = js[i]!
    const next = i + 1 < n ? js[i + 1]! : ""

    if (lineComment) {
      if (ch === "\n") lineComment = false
      i++
      continue
    }
    if (blockComment) {
      if (ch === "*" && next === "/") {
        blockComment = false
        i += 2
        continue
      }
      i++
      continue
    }
    if (str) {
      if (escaped) {
        escaped = false
        i++
        continue
      }
      if (ch === "\\") {
        escaped = true
        i++
        continue
      }
      if (ch === str.q) {
        str = null
        i++
        prev = "s"
        continue
      }
      // Template interpolation opens code mode.
      if (str.q === "`" && ch === "$" && next === "{") {
        stack.push({ tpl: true, line: lineOf(i) })
        str = null
        i += 2
        continue
      }
      // A raw newline inside a single/double-quoted string ends it illegally.
      if ((str.q === "'" || str.q === '"') && ch === "\n") {
        return `unterminated string starting at line ${str.line} — close the quote before the line break.`
      }
      i++
      continue
    }

    // Code mode.
    if (ch === "/" && next === "/") {
      lineComment = true
      i += 2
      continue
    }
    if (ch === "/" && next === "*") {
      blockComment = true
      i += 2
      continue
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      str = { q: ch, line: lineOf(i) }
      i++
      continue
    }
    // Regex literal vs division: a `/` opens a regex when the previous
    // significant token cannot end an expression.
    if (ch === "/") {
      const tail = js.slice(Math.max(0, i - 12), i)
      const wordBefore = /(?:^|[^A-Za-z0-9_$])(return|typeof|instanceof|in|of|do|else|new|delete|void|yield|await)\s*$/.test(tail)
      if (prev === "" || wordBefore || REGEX_AFTER.includes(prev)) {
        // Skip to the closing unescaped `/` outside `[]`, then flags.
        let k = i + 1
        let inClass = false
        let esc = false
        while (k < n) {
          const c = js[k]!
          if (esc) esc = false
          else if (c === "\\") esc = true
          else if (c === "[") inClass = true
          else if (c === "]") inClass = false
          else if (c === "/" && !inClass) break
          else if (c === "\n") break
          k++
        }
        if (k < n && js[k] === "/") {
          let e = k + 1
          while (e < n && /[a-z]/i.test(js[e]!)) e++
          i = e
          prev = "s"
          continue
        }
        return `unterminated regex starting at line ${lineOf(i)} — close the / before the line break.`
      }
      i++
      prev = "/"
      continue
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      stack.push({ ch, line: lineOf(i) })
      i++
      prev = ch
      continue
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      const want = ch === ")" ? "(" : ch === "]" ? "[" : "{"
      const top = stack[stack.length - 1]
      if (!top) {
        return `unexpected "${ch}" at line ${lineOf(i)} with nothing open — delete it or open ${want} first.`
      }
      if (isTpl(top)) {
        if (ch !== "}") {
          return `unexpected "${ch}" at line ${lineOf(i)} inside \${} — close the template expression with } first.`
        }
        stack.pop()
        str = { q: "`", line: lineOf(i) }
        i++
        prev = "s"
        continue
      }
      if (top.ch !== want) {
        return `mismatched "${ch}" at line ${lineOf(i)} — closes ${top.ch} opened at line ${top.line}. Fix the nesting.`
      }
      stack.pop()
      i++
      prev = ch
      continue
    }
    if (/\s/.test(ch)) {
      i++
      continue
    }
    prev = /[A-Za-z0-9_$.]/.test(ch) ? "w" : ch
    i++
  }

  if (str) {
    return str.q === "`"
      ? `unterminated template literal starting at line ${str.line} — close the backtick.`
      : `unterminated string starting at line ${str.line} — close the quote.`
  }
  if (blockComment) return "unterminated /* comment — close it with */."
  const open = stack[stack.length - 1]
  if (open) {
    if (isTpl(open)) return `unclosed \${} expression starting at line ${open.line}.`
    return `unclosed "${open.ch}" opened at line ${open.line} — the js part ends before it closes (truncated output: rewrite the tail).`
  }
  return null
}

/** Comments + string literals blanked (length-preserving) for identifier scans. */
function stripStrings(src: string): string {
  const isWord = (c: string) => /[\w$]/.test(c)
  let out = ""
  let i = 0
  const n = src.length
  while (i < n) {
    const ch = src[i]!
    const next = i + 1 < n ? src[i + 1]! : ""
    if (ch === "/" && next === "/") {
      let k = i
      while (k < n && src[k] !== "\n") k++
      out += " ".repeat(k - i)
      i = k
      continue
    }
    if (ch === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2)
      const k = end === -1 ? n : end + 2
      out += src.slice(i, k).replace(/[^\n]/g, " ")
      i = k
      continue
    }
    if (ch === "`") {
      const re = /`(?:\\.|[^`\\])*`/g
      re.lastIndex = i
      const m = re.exec(src)
      if (m && m.index === i) {
        out += m[0].replace(/[^\n]/g, " ")
        i += m[0].length
      } else {
        let k = i + 1
        while (k < n && src[k] !== "\n" && src[k] !== "`") k++
        const end = src[k] === "`" ? k + 1 : k
        out += " ".repeat(end - i)
        i = end
      }
      continue
    }
    if (ch === "'" || ch === '"') {
      let j = i - 1
      while (j >= 0 && (src[j] === " " || src[j] === "\t")) j--
      const prev = j >= 0 ? src[j]! : ";"
      if (isWord(prev) && isWord(next)) {
        out += ch
        i++
        continue
      }
      let k = i + 1
      let closed = false
      while (k < n) {
        if (src[k] === "\\") {
          k += 2
          continue
        }
        if (src[k] === "\n" || src[k] === ch) {
          closed = src[k] === ch
          break
        }
        k++
      }
      const end = closed ? k + 1 : k
      out += " ".repeat(end - i)
      i = end
      continue
    }
    out += ch
    i++
  }
  return out
}

export function checkComposition(code: string): Check[] {
  const out: Check[] = []
  const src = (code ?? "").trim()

  if (!src) {
    return [{ level: "error", message: "The bundle is empty." }]
  }

  const parsed = parseBundle(code)
  if (parsed.legacy) {
    return [
      {
        level: "error",
        message:
          "Legacy Remotion TSX — the player no longer mounts Remotion code. " +
          "Regenerate this cut as a web bundle with quick_start (or write_composition with html/css/js parts). " +
          "Do not edit the TSX; nothing about it is reusable in the iframe.",
      },
    ]
  }
  if (!parsed.ok || !parsed.bundle) {
    return [
      {
        level: "error",
        message:
          `Not a web bundle (${parsed.error ?? "unparseable"}). ` +
          `Write one with write_composition as { html, css, js, duration }: ` +
          `markup for #wm-stage, a scoped stylesheet, and a script defining function render(t, ctx).`,
      },
    ]
  }
  const b = parsed.bundle
  const { html, css, js } = b
  const meta = b.meta

  // --- size caps ---------------------------------------------------------
  for (const [name, part] of [["html", html], ["css", css], ["js", js]] as const) {
    if (part.length > MAX_PART) {
      out.push({
        level: "error",
        message:
          `${name} part is ${part.length} chars (cap ${MAX_PART}). ` +
          `Split detail into fewer elements or generate repeated items with a loop in render().`,
      })
    }
  }

  // --- JS must parse -------------------------------------------------------
  // The sandbox evaluates the js part with `new Function`. A syntax error
  // there kills the whole driver block at parse time (the classic
  // "about:srcdoc Uncaught SyntaxError"), so no audit report is ever posted
  // and the turn stalls on pending. Catch it here instead — with a pure
  // scanner, because Cloudflare Workers disallow code generation from
  // strings (`new Function`/`eval` throw there), so the check itself must
  // never evaluate. Reports the first mismatch with its line number.
  if (js.trim()) {
    const syntaxError = checkJsSyntax(js)
    if (syntaxError) {
      out.push({
        level: "error",
        message:
          `JS syntax error — ${syntaxError} ` +
          `Fix the brackets/parens/quotes near that line; keep render(t, ctx) ` +
          `short and simple, one statement per line, no clever nesting.`,
      })
    }
  }

  // --- render contract ----------------------------------------------------
  const jsClean = stripStrings(js)
  if (!/function\s+render\s*\(\s*t\b/.test(jsClean) && !/\brender\s*=\s*(function\s*\(\s*t\b|\(\s*t\b[^)]*\)\s*=>)/.test(jsClean)) {
    out.push({
      level: "error",
      message:
        "No render(t, ctx) entry point. The driver calls render(t, ctx) every frame — " +
        "define `function render(t, ctx) { ... }` that sets inline styles/DOM from t. " +
        "Optional: `function init(ctx) { ... }` runs once before frame 0.",
    })
  }
  if (/<script[\s>]/i.test(html)) {
    out.push({
      level: "error",
      message:
        "A <script> tag in the html part is stripped at build and never runs. " +
        "Put all logic in the js part as render(t, ctx) — the driver evaluates it after helpers load.",
    })
  }
  // Raw-text scan (NOT the string-stripped copy): `<!--` is an HTML-parser
  // hazard wherever it appears, including inside JS strings and comments.
  // The runtime neutralizes it, so this is guidance, not a block.
  if (/<!--/.test(js)) {
    out.push({
      level: "warn",
      message:
        "HTML-looking `<!--` sequence in bundle JS (advisory): write plain `// Section: x` " +
        "comments instead — it complicates the preview document for no benefit.",
    })
  }
  if (/^\s*import\s/m.test(jsClean) || /^\s*export\s/m.test(jsClean)) {
    out.push({
      level: "error",
      message:
        "The js part is a plain script, not a module: no import/export statements. " +
        "Helpers (interpolate, Easing, spring, rand, el/q/qa) arrive on ctx; " +
        "third-party libs load via meta.assets scripts (pinned https CDN).",
    })
  }

  // --- determinism: the clock is t, nothing else ---------------------------
  if (/\bDate\.now\s*\(/.test(jsClean) || /\bperformance\.now\s*\(/.test(jsClean)) {
    out.push({
      level: "error",
      message:
        "Date.now()/performance.now() is wall-clock time — every scrub and the export would show different frames. " +
        "Derive everything from t (seconds) and ctx.frame instead.",
    })
  }
  if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(jsClean)) {
    out.push({
      level: "error",
      message:
        "eval/new Function is refused — generated code runs in other people's browsers. " +
        "Write the logic directly in render(t, ctx).",
    })
  }
  if (/\bonClick\s*=|\bonMouse\w+\s*=|\bonPointer\w+\s*=|addEventListener\s*\(/.test(jsClean + stripStrings(html))) {
    out.push({
      level: "error",
      message:
        "Interactive handlers (onClick/addEventListener) never fire in an export — snapshots step t with no pointer. " +
        "Remove them; animate from t instead so preview and export agree.",
    })
  }
  if (/\bsetInterval\s*\(/.test(jsClean)) {
    out.push({
      level: "error",
      message:
        "setInterval drives wall-clock animation that scrub and export cannot reproduce. " +
        "Delete it — the driver already calls render(t, ctx) every frame.",
    })
  }
  if (/\bsetTimeout\s*\(/.test(jsClean)) {
    out.push({
      level: "warn",
      message:
        "setTimeout found in bundle JS (advisory): one-shot setup is harmless, but anything that mutates styles on a timer " +
        "desyncs scrub/export. Keep all visual state a pure function of t.",
    })
  }
  if (/\bMath\.random\s*\(/.test(jsClean)) {
    out.push({
      level: "error",
      message:
        "Math.random() is non-deterministic — every scrub and export pass would differ. " +
        "Use ctx.rand(seed) (seeded, stable) instead.",
    })
  }
  if (/\blocalStorage\b|\bsessionStorage\b|\bdocument\.cookie\b/.test(jsClean)) {
    out.push({
      level: "warn",
      message:
        "Storage/cookie access in bundle JS (advisory): the sandbox is an opaque origin, so reads always miss. " +
        "Keep the cut stateless — all state derives from t.",
    })
  }

  // --- network: https-only, capped -----------------------------------------
  const urls: string[] = []
  for (const m of `${html}\n${css}\n${js}`.matchAll(/https?:\/\/[^\s"'()<>]+/g)) urls.push(m[0])
  const insecure = urls.filter((u) => u.startsWith("http://"))
  if (insecure.length > 0) {
    out.push({
      level: "error",
      message:
        `Insecure URL (${insecure[0]!.slice(0, 80)}...) — the sandbox CSP allows https only. ` +
        `Switch it to https or inline the asset as data:.`,
    })
  }
  const assets = meta.assets ?? {}
  const assetUrls = [...(assets.styles ?? []), ...(assets.scripts ?? [])]
  if (assetUrls.length > MAX_ASSETS) {
    out.push({
      level: "error",
      message:
        `meta.assets lists ${assetUrls.length} external files (cap ${MAX_ASSETS}). ` +
        `Keep only the libraries the cut truly needs (GSAP/Lottie/Three); inline the rest.`,
    })
  }
  for (const u of assetUrls) {
    if (!u.startsWith("https://")) {
      out.push({
        level: "error",
        message: `meta.assets entry "${u.slice(0, 80)}" must be an https CDN URL.`,
      })
      break
    }
  }
  if (/<img[^>]+src\s*=\s*["']https?:\/\//i.test(html) && !/crossOrigin/i.test(`${html}${js}`)) {
    out.push({
      level: "warn",
      message:
        "A remote <img> without crossOrigin=\"anonymous\" (advisory): it previews fine but may not paint in export " +
        "snapshots (foreignObject taint rules). Add crossOrigin=\"anonymous\" when the host serves CORS.",
    })
  }

  // --- type scale and layout discipline --------------------------------------
  const sizeRe = /font-size\s*:\s*(\d+(?:\.\d+)?)\s*px/gi
  for (const m of `${css}\n${html}`.matchAll(sizeRe)) {
    const size = Number(m[1])
    const near = lineOf(`${css}\n${html}`, (m.index ?? 0))
    if (size < MIN_FONT) {
      out.push({
        level: "error",
        message: `font-size ${size}px is under the ${MIN_FONT}px floor — unreadable as video. Body is 32-44px, caption 24-28px.`,
      })
      void near
      break
    } else if (size > MAX_FONT) {
      out.push({
        level: "error",
        message: `font-size ${size}px is over the ${MAX_FONT}px ceiling on a 1080p frame — it fills the canvas. Hero is 130-200px.`,
      })
      break
    }
  }
  // JS-set font sizes (el.style.fontSize = N / fontSize: N in JS objects).
  const jsSizeRe = /fontSize\s*["']?\s*[:=]\s*["']?(\d+(?:\.\d+)?)/g
  for (const m of js.matchAll(jsSizeRe)) {
    const size = Number(m[1])
    if (size > 0 && size < MIN_FONT) {
      out.push({
        level: "error",
        message: `JS sets fontSize ${size}px (under the ${MIN_FONT}px floor) — unreadable as video.`,
      })
      break
    } else if (size > MAX_FONT) {
      out.push({
        level: "error",
        message: `JS sets fontSize ${size}px (over the ${MAX_FONT}px ceiling) — it fills the canvas.`,
      })
      break
    }
  }
  for (const m of `${css}\n${html}\n${js}`.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    const stack = (m[1] ?? "").split(",")[0]!.trim().replace(/^['"]+|['"]+$/g, "")
    if (/^(system-ui|sns-serif|sans-serif|serif|Arial|Helvetica|Inter|Roboto)$/i.test(stack)) {
      out.push({
        level: "error",
        message:
          `font-family "${stack}" is a page default — never a deliberate motion choice. ` +
          `Use a Google Fonts family (Unbounded, Bricolage Grotesque, Fraunces, Space Grotesk, Caveat...) — ` +
          `the runtime auto-loads any cited family, no import needed.`,
      })
      break
    }
  }

  // Absolute offsets inside the safe margin get cropped by most encoders.
  // The lookbehind keeps margin-/padding-/border- properties out: only a
  // bare left/top/right/bottom declaration positions an element.
  for (const m of `${css}\n${html}`.matchAll(/(?<![-\w])(?:left|top|right|bottom)\s*:\s*(-?\d+)/g)) {
    const v = Number(m[1])
    if (v !== 0 && Math.abs(v) < SAFE_MARGIN && Math.abs(v) < 1080 * 0.02) {
      out.push({
        level: "warn",
        message: `Position ${v}px sits inside the ${SAFE_MARGIN}px safe margin — encoders crop it. Use ${SAFE_MARGIN}px or a percentage.`,
      })
      break
    }
  }

  // --- motion quality heuristics (advisory, except the two basic blocks) -----
  {
    const srcAll = `${css}\n${html}\n${js}`
    const interpCalls = (js.match(/interpolate\s*\(/g) ?? []).length
    const easings = (js.match(/Easing\.|easing\s*:/g) ?? []).length
    const springs = (js.match(/\bspring\s*\(/g) ?? []).length
    const keyframes = (css.match(/@keyframes/g) ?? []).length
    const hasTransform = /translate|scale|rotate|skew|clip-path|clipPath/i.test(srcAll)
    const hasOpacity = /opacity/i.test(srcAll)
    const hasLoop =
      /\.map\s*\(|\.forEach\s*\(|for\s*\(/.test(js) || /data-repeat|data-count/i.test(html)

    if (interpCalls > 0 && easings === 0 && springs === 0 && keyframes === 0) {
      out.push({
        level: "warn",
        message: `All ${interpCalls} interpolate() call(s) use default linear timing — linear motion reads as robotic. Give each move an easing (ctx.Easing.easeOut) or a ctx.spring().`,
      })
    } else if (interpCalls > 0 && springs === 0 && keyframes === 0) {
      out.push({
        level: "warn",
        message: "Nothing settles — no ctx.spring() in the bundle. At least one element should arrive with a spring or an overshoot so the cut has a landing.",
      })
    }
    if (hasOpacity && !hasTransform) {
      out.push({
        level: "warn",
        message: "The cut animates opacity only. Fading is the weakest kind of change — add translate, scale or rotate so elements have direction.",
      })
    }
    if (hasLoop && !/delay|stagger|index\s*[*+-]|i\s*[*+-]\s*[\d.]+/i.test(srcAll)) {
      out.push({
        level: "warn",
        message: "A list builds items with no stagger. Offset each item's start time (e.g. t - (start + i * 0.12)) to turn a block appearance into a cascade.",
      })
    }
    // CSS animations run on wall-clock: scrub/export cannot reproduce them
    // unless they are bound to t (negative-delay trick driven from JS).
    if (/@keyframes/i.test(css) && !/animationDelay|animation-delay/i.test(`${js}${css}`)) {
      out.push({
        level: "warn",
        message:
          "CSS @keyframes without a t-driven animation-delay (advisory): keyframes run on wall-clock, so scrub and export drift from preview. " +
          "Prefer JS inline styles from t, or bind animation-delay to t (negative delay) from render().",
      })
    }
    if (!hasTransform && !hasOpacity && keyframes === 0 && js.trim().length > 0) {
      out.push({
        level: "warn",
        message: "No animated property detected (translate/scale/rotate/opacity/clip-path, JS or CSS). Static layers read as a still image.",
      })
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
 * Feasibility check BEFORE codegen. Pure function so both the tool and the
 * prompt path share one rule set.
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
      issues.push(`Beat ${i} ends at frame ${b.to}, past the ${maxFrames}-frame (30s) limit.`)
      fixes.push(`Tighten beat ${i} to end at or before frame ${maxFrames} (30s).`)
    }
    if (!b.what || b.what.trim().length < 12) {
      issues.push(`Beat ${i} names no real props or easing ("${b.what || "empty"}").`)
      fixes.push(`Name the props and easing, e.g. 'translateY 54→0, easeOut, spring settle'.`)
    }
    const next = sorted[i + 1]
    if (next && next.from < b.to - 1) {
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

/**
 * Timing/duration/frame-budget solver. Returns a valid retiming or an
 * impossibility report — never throws.
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

/** URL → sandbox map: what a bundle may load, and what to use instead. */
export function dependencyResolve(imports: string[]): {
  ok: boolean
  resolved: Array<{ source: string; status: "ok" | "replace"; hint: string }>
} {
  const PINNED_LIBS = new Set([
    "https://cdn.jsdelivr.net/npm/gsap",
    "https://cdn.jsdelivr.net/npm/three",
    "https://cdn.jsdelivr.net/npm/lottie-web",
    "https://unpkg.com/gsap",
    "https://unpkg.com/three",
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
  ])
  const resolved = imports.map((source) => {
    const s = source.trim()
    if (/^(gsap|three|lottie-web)$/.test(s)) {
      return {
        source: s,
        status: "ok" as const,
        hint: `Load from a pinned https CDN in meta.assets.scripts (e.g. cdn.jsdelivr.net/npm/${s}@<version>), then drive it from render(t, ctx) — never its own clock.`,
      }
    }
    if (s.startsWith("https://")) {
      const allowed = [...PINNED_LIBS].some((p) => s.startsWith(p))
      return {
        source: s,
        status: (allowed ? "ok" : "replace") as "ok" | "replace",
        hint: allowed
          ? "Allowed in meta.assets (styles/scripts) or as an <img>/<video> src with crossOrigin."
          : "Prefer a pinned CDN host (jsdelivr/unpkg) or Google Fonts. Arbitrary hosts break export snapshots when they refuse CORS.",
      }
    }
    if (/^(react|remotion|@remotion\/)/.test(s)) {
      return {
        source: s,
        status: "replace" as const,
        hint: "No framework imports in bundle JS — it is a plain script. Markup goes in the html part, motion in render(t, ctx) with the ctx helpers.",
      }
    }
    return {
      source: s,
      status: "replace" as const,
      hint: "Bundle JS takes no imports. Declare https CDN files in meta.assets, fonts by family name, images as https URLs with crossOrigin.",
    }
  })
  return { ok: resolved.every((r) => r.status === "ok"), resolved }
}

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Web motion bundle — the artifact contract that replaces Remotion TSX.
 *
 * One cut = one JSON bundle stored as a string in the same `code` column the
 * Remotion source used (no DB migration). The browser builds a sandboxed
 * iframe document from it; the agent writes it through the same tool shapes
 * (write_composition / edit_file / read_file) with per-part addressing.
 *
 * Time model: every animation is a pure function of `t` (seconds). The
 * iframe driver owns the clock (rAF loop, seek, speed, loop) and calls the
 * bundle's `render(t, ctx)` every frame — the exact analogue of Remotion's
 * `useCurrentFrame()` derivation, without the Remotion dependency.
 */

export const BUNDLE_VERSION = 1

/** Canvas contract — identical numbers to the old Remotion CANVAS. */
export const CANVAS = { width: 1920, height: 1080, fps: 30, maxFrames: 900 } as const

export interface BundleMeta {
  title: string
  /** Seconds of cut. */
  duration: number
  fps: number
  width: number
  height: number
  /** Extra Google Font families to load beyond what CSS parsing finds. */
  fonts?: string[]
  /** Pinned https CDN assets injected before the bundle JS runs. */
  assets?: { styles?: string[]; scripts?: string[] }
}

export interface WebBundle {
  version: number
  /** Inner markup mounted into #wm-stage. No <html>/<head>/<body>. */
  html: string
  /** Scoped stylesheet for the markup above. */
  css: string
  /**
   * Plain script defining `function render(t, ctx)` and optionally
   * `function init(ctx)`. No imports/exports — helpers come from ctx.
   */
  js: string
  meta: BundleMeta
}

export class BundleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BundleError"
  }
}

/** Size caps: protect the DO row, the iframe postMessage channel, and parse time. */
export const MAX_PART = 60_000
export const MAX_ASSETS = 6

const GENERIC_FONTS = new Set([
  "sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui",
  "ui-sans-serif", "ui-serif", "ui-monospace", "sans", "inherit", "initial", "unset",
])

export function defaultMeta(partial: Partial<BundleMeta> = {}): BundleMeta {
  return {
    title: partial.title ?? "Untitled cut",
    duration: clampNum(partial.duration ?? 5, 2, 30),
    fps: partial.fps ?? CANVAS.fps,
    width: partial.width ?? CANVAS.width,
    height: partial.height ?? CANVAS.height,
    ...(partial.fonts ? { fonts: partial.fonts.slice(0, 12) } : {}),
    ...(partial.assets ? { assets: partial.assets } : {}),
  }
}

function clampNum(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, n))
}

export function serializeBundle(b: WebBundle): string {
  return JSON.stringify({
    version: BUNDLE_VERSION,
    html: b.html,
    css: b.css,
    js: b.js,
    meta: b.meta,
  })
}

export interface ParsedBundle {
  ok: boolean
  bundle: WebBundle | null
  /** True when the string is legacy Remotion TSX, not a bundle. */
  legacy: boolean
  error: string | null
}

/**
 * Parses the stored `code` string. Old rows hold Remotion TSX — those parse
 * as legacy (the Stage shows a regenerate notice instead of crashing).
 */
export function parseBundle(code: string): ParsedBundle {
  const src = (code ?? "").trim()
  if (!src) return { ok: false, bundle: null, legacy: false, error: "empty" }
  if (/^\s*(import\s|export\s+default|<\w)/.test(src) || /from\s+["']remotion["']/.test(src)) {
    return { ok: false, bundle: null, legacy: true, error: "legacy Remotion cut" }
  }
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(src) as Record<string, unknown>
  } catch {
    // Bare-HTML fallback: a model that wrote raw markup instead of JSON.
    if (/^<[\w!]/.test(src)) {
      return {
        ok: true,
        bundle: { version: BUNDLE_VERSION, html: src, css: "", js: "", meta: defaultMeta() },
        legacy: false,
        error: null,
      }
    }
    return { ok: false, bundle: null, legacy: false, error: "not a bundle" }
  }
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, bundle: null, legacy: false, error: "not a bundle" }
  }
  const meta = (raw.meta ?? {}) as Partial<BundleMeta>
  const bundle: WebBundle = {
    version: typeof raw.version === "number" ? raw.version : BUNDLE_VERSION,
    html: typeof raw.html === "string" ? raw.html : "",
    css: typeof raw.css === "string" ? raw.css : "",
    js: typeof raw.js === "string" ? raw.js : "",
    meta: defaultMeta({
      title: typeof meta.title === "string" ? meta.title : undefined,
      duration: typeof meta.duration === "number" ? meta.duration : undefined,
      fps: typeof meta.fps === "number" ? meta.fps : undefined,
      width: typeof meta.width === "number" ? meta.width : undefined,
      height: typeof meta.height === "number" ? meta.height : undefined,
      fonts: Array.isArray(meta.fonts) ? (meta.fonts as string[]).filter((f) => typeof f === "string") : undefined,
      assets: meta.assets as BundleMeta["assets"],
    }),
  }
  if (!bundle.html.trim() && !bundle.js.trim()) {
    return { ok: false, bundle: null, legacy: false, error: "bundle has no markup or script" }
  }
  return { ok: true, bundle, legacy: false, error: null }
}

/** Total frames for a bundle (beat timeline + transport share this). */
export function bundleFrames(b: WebBundle): number {
  return Math.max(30, Math.round(b.meta.duration * b.meta.fps))
}

/** Families cited in CSS/JS that need a Google Fonts stylesheet. */
export function citedFamilies(b: WebBundle): string[] {
  const found = new Set<string>()
  const cssRe = /font-family\s*:\s*([^;}]+)/gi
  const scan = (text: string) => {
    let m: RegExpExecArray | null
    while ((m = cssRe.exec(text)) !== null) {
      for (const raw of (m[1] ?? "").split(",")) {
        const name = raw.trim().replace(/^['"]+|['"]+$/g, "")
        if (!name || GENERIC_FONTS.has(name.toLowerCase())) continue
        if (/^[A-Za-z0-9 \-']{1,40}$/.test(name)) found.add(name)
      }
    }
  }
  scan(b.css)
  scan(b.html)
  // fontFamily: "X" literals inside the JS part.
  const jsRe = /fontFamily\s*:\s*["'`]([^"'`]+)["'`]/g
  let m: RegExpExecArray | null
  while ((m = jsRe.exec(b.js)) !== null) {
    const name = (m[1] ?? "").trim()
    if (name && !GENERIC_FONTS.has(name.toLowerCase()) && /^[A-Za-z0-9 \-']{1,40}$/.test(name)) {
      found.add(name)
    }
  }
  for (const f of b.meta.fonts ?? []) {
    if (!GENERIC_FONTS.has(f.toLowerCase())) found.add(f)
  }
  return [...found].slice(0, 12)
}

export function partSizes(code: string): { html: number; css: number; js: number } | null {
  const p = parseBundle(code)
  if (!p.ok || !p.bundle) return null
  return { html: p.bundle.html.length, css: p.bundle.css.length, js: p.bundle.js.length }
}

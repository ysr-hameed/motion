/**
 * Web motion bundle — the artifact contract (mirrors frontend/src/web/types.ts).
 *
 * One cut = one JSON bundle stored in the existing `code` column (no schema
 * migration). Rows written before the engine switch hold Remotion TSX and
 * are reported as legacy so the agent regenerates them instead of editing
 * syntax the player can no longer mount.
 */

export const BUNDLE_VERSION = 1
export const MAX_PART = 60_000
export const MAX_ASSETS = 6

export interface BundleMeta {
  title: string
  duration: number
  fps: number
  width: number
  height: number
  fonts?: string[]
  assets?: { styles?: string[]; scripts?: string[] }
}

export interface WebBundle {
  version: number
  html: string
  css: string
  js: string
  meta: BundleMeta
}

export type BundlePart = "html" | "css" | "js"

export function defaultMeta(partial: Partial<BundleMeta> = {}): BundleMeta {
  const num = (v: unknown, fb: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fb
  return {
    title: typeof partial.title === "string" ? partial.title.slice(0, 120) : "Untitled cut",
    duration: Math.min(30, Math.max(2, Math.round(num(partial.duration, 5)))),
    fps: num(partial.fps, 30),
    width: num(partial.width, 1920),
    height: num(partial.height, 1080),
    ...(Array.isArray(partial.fonts)
      ? { fonts: partial.fonts.filter((f) => typeof f === "string").slice(0, 12) as string[] }
      : {}),
    ...(partial.assets ? { assets: partial.assets } : {}),
  }
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
  legacy: boolean
  error: string | null
}

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
      fonts: Array.isArray(meta.fonts) ? (meta.fonts as string[]) : undefined,
      assets: meta.assets as BundleMeta["assets"],
    }),
  }
  if (!bundle.html.trim() && !bundle.js.trim()) {
    return { ok: false, bundle: null, legacy: false, error: "bundle has no markup or script" }
  }
  return { ok: true, bundle, legacy: false, error: null }
}

/** Combined source for heuristics that scan "the cut" as one text. */
export function combinedSource(b: WebBundle): string {
  return `${b.html}\n${b.css}\n${b.js}`
}

/** Line/byte summary for tool results and version lists. */
export function partSummary(b: WebBundle): {
  htmlLines: number
  cssLines: number
  jsLines: number
  bytes: number
} {
  const lines = (s: string) => (s ? s.split("\n").length : 0)
  return {
    htmlLines: lines(b.html),
    cssLines: lines(b.css),
    jsLines: lines(b.js),
    bytes: b.html.length + b.css.length + b.js.length,
  }
}

/** First lines of the JS part for the chat tool log. */
export function jsSnippet(b: WebBundle, lines = 10): string {
  return b.js.split("\n").slice(0, lines).join("\n")
}

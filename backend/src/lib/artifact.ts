/**
 * Artifact — what a version IS.
 *
 * Two kinds, one stored column:
 *
 *   { kind: "code", code, durationInFrames, fps, width, height }
 *   { kind: "doc",  doc }   ← legacy JSON MotionDoc, READ-ONLY
 *
 * Code is the only kind anything writes. The doc kind exists so cuts made
 * before the code renderer keep playing; nothing generates it any more.
 *
 * Deliberately schema-free: there is no zod, no enum, no allowlist. A
 * composition is TypeScript, so the only limit on what a cut can do is
 * the Remotion API itself. Validation is "does it compile and render",
 * which the client answers for real instead of us guessing from a shape.
 */

/** The stage a composition renders into. Shared by every agent prompt. */
export interface Canvas {
  width: number
  height: number
  fps: number
  durationInFrames: number
}

export interface CodeArtifact extends Canvas {
  kind: "code"
  /** TSX source. Default-exports a React component. */
  code: string
}

export interface LegacyDocArtifact {
  kind: "doc"
  doc: unknown
}

export type Artifact = CodeArtifact | LegacyDocArtifact

export type AspectFormat = "16:9" | "9:16" | "1:1"

/** Stage sizes per aspect. fps is chosen by the user, not the brief. */
export const CANVAS: Record<AspectFormat, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
}

/** Render-guard rails. Long enough for any real cut, short enough to be watchable. */
export const MIN_FRAMES = 15
export const MAX_FRAMES = 1800
export const MIN_FPS = 24
export const MAX_FPS = 60

export function isCodeArtifact(a: unknown): a is CodeArtifact {
  if (typeof a !== "object" || a === null) return false
  const o = a as Record<string, unknown>
  return o.kind === "code" && typeof o.code === "string" && o.code.trim().length > 0
}

export function isLegacyDocArtifact(a: unknown): a is LegacyDocArtifact {
  if (typeof a !== "object" || a === null) return false
  const o = a as Record<string, unknown>
  return o.kind === "doc" && typeof o.doc === "object" && o.doc !== null
}

/**
 * Reads a stored value as an artifact. Anything that predates the tagged
 * union is a bare MotionDoc — those keep playing under the legacy
 * renderer, so a missing tag means "doc", not "broken".
 */
export function asArtifact(raw: unknown): Artifact | null {
  if (isCodeArtifact(raw)) return normalizeCode(raw)
  if (isLegacyDocArtifact(raw)) return raw
  // Pre-tag rows: a bare {version, canvas, layers} object.
  if (typeof raw === "object" && raw !== null) {
    const o = raw as Record<string, unknown>
    if (Array.isArray(o.layers) && typeof o.canvas === "object" && o.canvas !== null) {
      return { kind: "doc", doc: raw }
    }
  }
  return null
}

const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.min(hi, Math.max(lo, n))
}

/** Coerces a model-authored artifact into renderable bounds. */
export function normalizeCode(a: CodeArtifact): CodeArtifact {
  const width = clampInt(a.width, 240, 3840, 1920)
  const height = clampInt(a.height, 240, 3840, 1080)
  return {
    kind: "code",
    code: a.code,
    durationInFrames: clampInt(a.durationInFrames, MIN_FRAMES, MAX_FRAMES, 150),
    fps: clampInt(a.fps, MIN_FPS, MAX_FPS, 30),
    width,
    height,
  }
}

/**
 * Canvas for a brief, honouring an explicit 16:9 / 9:16 / 1:1 in the
 * prompt over the format the user picked in the UI.
 */
export function resolveFormat(
  brief: string,
  fallback: string
): AspectFormat {
  const hit = brief.match(/9\s*:\s*16|vertical|reel|shorts?|tiktok|story/i)
    ? "9:16"
    : brief.match(/1\s*:\s*1|square/i)
      ? "1:1"
      : brief.match(/16\s*:\s*9|horizontal|landscape|YouTube/i)
        ? "16:9"
        : null
  if (hit) return hit
  return fallback === "9:16" || fallback === "1:1" ? fallback : "16:9"
}

export function canvasFor(
  format: AspectFormat,
  durationSecs: number,
  fps: number
): Canvas {
  const { width, height } = CANVAS[format]
  const safeFps = Math.min(MAX_FPS, Math.max(MIN_FPS, Math.round(fps) || 30))
  const secs = Math.min(MAX_FRAMES / safeFps, Math.max(1, durationSecs))
  return {
    width,
    height,
    fps: safeFps,
    durationInFrames: clampInt(secs * safeFps, MIN_FRAMES, MAX_FRAMES, 150),
  }
}

/** Short human summary used in prompts and chat ("180f @30 · 1920x1080"). */
export function describeArtifact(a: Artifact): string {
  if (a.kind === "doc") return "legacy JSON document"
  return `${a.durationInFrames}f @${a.fps} · ${a.width}x${a.height}`
}

/** Line count — the token-cost signal the editor uses to pick a strategy. */
export function codeSize(a: Artifact): number {
  return a.kind === "code" ? a.code.split("\n").length : 0
}

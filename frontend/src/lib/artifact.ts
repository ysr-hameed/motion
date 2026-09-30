/**
 * Artifact — mirrors backend/src/lib/artifact.ts.
 *
 * `code` is what everything produces now. `doc` is the pre-code JSON
 * MotionDoc, kept read-only so versions made before the code editor
 * still play.
 */

export interface Canvas {
  width: number
  height: number
  fps: number
  durationInFrames: number
}

export interface CodeArtifact extends Canvas {
  kind: "code"
  code: string
}

export interface LegacyDocArtifact {
  kind: "doc"
  doc: unknown
}

export type Artifact = CodeArtifact | LegacyDocArtifact

export const ASPECTS = ["16:9", "9:16", "1:1"] as const
export type Aspect = (typeof ASPECTS)[number]

/** Fallback stage for a legacy doc, which carries only a format string. */
const LEGACY_DIMS: Record<string, { w: number; h: number }> = {
  "16:9": { w: 1280, h: 720 },
  "9:16": { w: 720, h: 1280 },
  "1:1": { w: 960, h: 960 },
}

export function isCodeArtifact(a: unknown): a is CodeArtifact {
  if (typeof a !== "object" || a === null) return false
  const o = a as Record<string, unknown>
  return o.kind === "code" && typeof o.code === "string" && o.code.trim().length > 0
}

/**
 * Reads any stored value as an artifact. Rows written before the tagged
 * union are a bare MotionDoc, so a missing tag means "legacy doc" rather
 * than "broken" — history keeps playing.
 */
export function asArtifact(raw: unknown): Artifact | null {
  if (isCodeArtifact(raw)) return raw as CodeArtifact
  if (typeof raw !== "object" || raw === null) return null
  const o = raw as Record<string, unknown>
  if (o.kind === "doc" && typeof o.doc === "object" && o.doc !== null) {
    return { kind: "doc", doc: o.doc }
  }
  if (Array.isArray(o.layers) && typeof o.canvas === "object" && o.canvas !== null) {
    return { kind: "doc", doc: raw }
  }
  return null
}

/** Everything the player needs, for either artifact kind. */
export function artifactCanvas(a: Artifact, fallbackFps = 30): Canvas {
  if (a.kind === "code") {
    return {
      width: a.width,
      height: a.height,
      fps: a.fps || fallbackFps,
      durationInFrames: a.durationInFrames,
    }
  }
  const doc = a.doc as { canvas?: { format?: string; durationSecs?: number } }
  const format = doc?.canvas?.format ?? "16:9"
  const dims = LEGACY_DIMS[format] ?? LEGACY_DIMS["16:9"]!
  const secs = Number(doc?.canvas?.durationSecs ?? 5) || 5
  return {
    width: dims.w,
    height: dims.h,
    fps: fallbackFps,
    durationInFrames: Math.max(15, Math.round(secs * fallbackFps)),
  }
}

/** Short label for the chat and the version pills. */
export function describeArtifact(a: Artifact): string {
  if (a.kind === "doc") return "legacy document"
  const secs = (a.durationInFrames / (a.fps || 30)).toFixed(1)
  return `${secs}s · ${a.width}×${a.height}`
}

import type { MotionDoc } from "./motion-types"

const HEX = /^#[0-9a-fA-F]{6}$/
const FORMATS = ["16:9", "9:16", "1:1"]
const TYPES = [
  "text",
  "rect",
  "image",
  "particles",
  "waveform",
  "countdown",
  "lower-third",
  "eqbars",
  "gradient",
  "ring",
  "ticker",
  "glow",
  "confetti",
  "barchart",
  "linechart",
  "stat",
  "audio",
  "icon",
]

/**
 * Tolerant shape guard for MotionDoc. The backend enforces the strict
 * zod schema; the renderer only needs enough shape to not crash —
 * unknown layers are skipped, bad values fall back to defaults.
 */
export function isMotionDoc(doc: unknown): doc is MotionDoc {
  if (typeof doc !== "object" || doc === null) return false
  const d = doc as Record<string, unknown>
  if (d.version !== 1) return false
  const canvas = d.canvas as Record<string, unknown> | undefined
  if (
    !canvas ||
    !FORMATS.includes(canvas.format as string) ||
    typeof canvas.durationSecs !== "number"
  )
    return false
  if (typeof d.bg !== "string" || !HEX.test(d.bg)) return false
  if (!Array.isArray(d.layers) || d.layers.length === 0) return false
  return d.layers.every(
    (l) =>
      typeof l === "object" &&
      l !== null &&
      typeof (l as { id?: unknown }).id === "string" &&
      TYPES.includes((l as { type?: string }).type ?? "")
  )
}

export interface LayerContext {
  /** Local frame (global minus startFrame, >= 0). */
  frame: number
  globalFrame: number
  fps: number
  durationFrames: number
  resolved: import("../engine/keyframes").ResolvedProps
  /** Enter progress 0..1 (spring/fade/slide). */
  enterT: number
  /** Enter scale (1 when no spring enter). */
  enterScale: number
  /** Exit multiplier 1..0. */
  exitT: number
}

const BODY_STACK = "'Space Grotesk', sans-serif"

/**
 * Typeface for a layer: any Google Fonts family (auto-loaded by
 * lib/fonts) wins, otherwise the house display/body stacks.
 */
export function familyOf(p: {
  font?: string
  fontFamily?: string
}): string {
  const custom = (p.fontFamily ?? "").trim()
  if (/^[A-Za-z0-9 ]{1,40}$/.test(custom)) return `'${custom}', ${BODY_STACK}`
  return (p.font ?? "display") === "body" ? BODY_STACK : `'Unbounded', ${BODY_STACK}`
}

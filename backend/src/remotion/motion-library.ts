/**
 * AGENT_UPGRADE_PLAN Phase 2: advanced motion design system.
 *
 * Professional animation as data, not taste: every preset names its easing,
 * duration and transform so the model copies numbers instead of inventing
 * curves. Pure and deterministic — safe inside the paced turn.
 */

export interface MotionPreset {
  /** What the beat feels like in one line. */
  feel: string
  /** Exact easing snippet to paste. */
  easing: string
  /** Duration in frames at 30fps. */
  duration: number
  /** The transform story, from → to. */
  transform: string
  /** Spring config snippet, when the preset lands with a spring. */
  spring?: { damping: number; mass: number; stiffness: number }
  /** Peak overshoot (1.08 = peaks at 108%, settles to 100%). */
  overshoot?: number
  /** Frames of crossfade into the next beat. */
  overlap?: number
  /** Per-layer offset in frames. */
  stagger?: number
  /** Frames to hold the end state before cutting. */
  holdFrames?: number
}

export const MotionPresets: Record<string, MotionPreset> = {
  heroEntrance: {
    feel: "Confident arrival with anticipation and settle",
    easing: "Easing.bezier(0.16, 1, 0.3, 1)",
    duration: 60,
    transform: "translateY(40) + scale(0.95) → translateY(0) + scale(1)",
    spring: { damping: 18, mass: 0.8, stiffness: 120 },
  },
  punchIn: {
    feel: "Snappy emphasis that overshoots then lands",
    easing: "Easing.bezier(0.8, 0, 0.2, 1)",
    duration: 24,
    transform: "scale(0.8) + opacity(0) → scale(1) + opacity(1)",
    overshoot: 1.08,
  },
  slideReveal: {
    feel: "Editorial wipe with a masked edge",
    easing: "Easing.bezier(0.16, 1, 0.3, 1)",
    duration: 45,
    transform: "translateX(-30) + clipPath inset(0 100% 0 0) → translateX(0) + inset(0 0 0 0)",
  },
  seamlessHandoff: {
    feel: "Invisible beat change — next starts before previous ends",
    easing: "Easing.bezier(0, 0, 0.2, 1)",
    duration: 30,
    transform: "opacity(1) → opacity(0) crossed with opacity(0) → opacity(1)",
    overlap: 15,
    stagger: 3,
  },
  elasticSettle: {
    feel: "Playful landing with visible overshoot",
    easing: "Easing.bezier(0.16, 1, 0.3, 1)",
    duration: 40,
    transform: "scale(1.12) → scale(1)",
    spring: { damping: 15, mass: 1.2, stiffness: 100 },
    overshoot: 1.12,
  },
  fadeToBlack: {
    feel: "Resolved ending that holds before the cut",
    easing: "Easing.bezier(0.4, 0, 1, 1)",
    duration: 30,
    transform: "opacity(1) → opacity(0)",
    holdFrames: 10,
  },
}

export type MotionPresetId = keyof typeof MotionPresets

/** Beat type → preset, so load_motion_preset answers in one call. */
const BEAT_PRESET: Record<string, MotionPresetId> = {
  entrance: "heroEntrance",
  transition: "seamlessHandoff",
  settle: "elasticSettle",
  exit: "fadeToBlack",
  emphasis: "punchIn",
}

export const BEAT_TYPES = Object.keys(BEAT_PRESET)

export function presetForBeat(beatType: string): { id: MotionPresetId; preset: MotionPreset } {
  const id = BEAT_PRESET[beatType.toLowerCase()] ?? "heroEntrance"
  return { id, preset: MotionPresets[id] }
}

/** Ready-to-paste snippet for a preset starting at a frame. */
export function presetSnippet(id: MotionPresetId, startFrame: number): string {
  const p = MotionPresets[id]
  const end = startFrame + p.duration
  const lines = [
    `// ${id}: ${p.feel} (frames ${startFrame}→${end})`,
    `const progress = interpolate(frame, [${startFrame}, ${end}], [0, 1], { easing: ${p.easing} });`,
  ]
  if (p.spring) {
    lines.push(
      `const settle = spring({ frame: frame - ${startFrame}, fps: 30, config: { damping: ${p.spring.damping}, mass: ${p.spring.mass}, stiffness: ${p.spring.stiffness} } });`
    )
  }
  if (p.overlap !== undefined) {
    lines.push(`// Handoff: start the next beat ${p.overlap}f before frame ${end} (overlap, never a hard cut).`)
  }
  if (p.holdFrames !== undefined) {
    lines.push(`// Ending: hold the final state ${p.holdFrames}f past frame ${end} so the cut resolves.`)
  }
  lines.push(`// Transform: ${p.transform}`)
  return lines.join("\n")
}

export interface SpringConfig {
  damping: number
  mass: number
  stiffness: number
}

export const SpringPresets = {
  /** Fast UI arrivals. */
  snappy: { damping: 18, mass: 0.5, stiffness: 180 },
  /** Playful overshoot landings. */
  bouncy: { damping: 12, mass: 1.0, stiffness: 120 },
  /** Default hero arrivals. */
  smooth: { damping: 22, mass: 0.8, stiffness: 100 },
  /** Slow, premium settles. */
  gentle: { damping: 26, mass: 1.2, stiffness: 80 },
  /** High-energy impacts. */
  dramatic: { damping: 10, mass: 1.5, stiffness: 140 },
} satisfies Record<string, SpringConfig>

export type SpringPresetId = keyof typeof SpringPresets

/** Multi-stage spring: 3-frame stagger per element, the cascade default. */
export function cascadeSpring(
  count: number,
  baseDelay: number,
  preset: SpringPresetId = "snappy"
): Array<{ index: number; delay: number; spring: SpringConfig }> {
  return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, i) => ({
    index: i,
    delay: baseDelay + i * 3,
    spring: SpringPresets[preset],
  }))
}

export interface PatternBeat {
  beat: string
  preset: MotionPresetId
  delay: number
}

/** Preset combinations for the briefs that arrive most often. */
export const MotionPatterns = {
  productReveal: [
    { beat: "anticipation", preset: "heroEntrance", delay: 0 },
    { beat: "reveal", preset: "punchIn", delay: 60 },
    { beat: "settle", preset: "elasticSettle", delay: 84 },
  ],
  textSequence: [
    { beat: "kicker", preset: "slideReveal", delay: 0 },
    { beat: "headline", preset: "heroEntrance", delay: 20 },
    { beat: "subhead", preset: "slideReveal", delay: 45 },
  ],
} satisfies Record<string, PatternBeat[]>

export type MotionPatternId = keyof typeof MotionPatterns

export type TextAnimationStyle = "charByChar" | "wordByWord" | "maskReveal"

/**
 * Ready-to-paste text animation for a headline. Staggers are baked in
 * (2f per character, 5f per word) so the model does not hand-roll timing.
 */
export function textAnimationSnippet(
  style: TextAnimationStyle,
  text: string,
  startFrame: number
): string {
  const safe = text.replace(/`/g, "'").slice(0, 120)
  const literal = JSON.stringify(safe)
  if (style === "wordByWord") {
    return [
      `// wordByWord: ${literal} from frame ${startFrame} (snappy spring per word)`,
      `{${literal}.split(" ").map((word, i) => (`,
      `  <span key={i} style={{ display: "inline-block", marginRight: 16, opacity: spring({ frame: frame - (${startFrame} + i * 5), fps: 30, config: { damping: 18, mass: 0.5, stiffness: 180 } }) }}>`,
      `    {word}`,
      `  </span>`,
      `))}`,
    ].join("\n")
  }
  if (style === "maskReveal") {
    const end = startFrame + 45
    return [
      `// maskReveal: ${literal} frames ${startFrame}→${end}`,
      `<div style={{ clipPath: interpolate(frame, [${startFrame}, ${end}], ["inset(0 100% 0 0)", "inset(0 0 0 0)"], { easing: Easing.bezier(0.16, 1, 0.3, 1) }) }}>`,
      `  {${literal}}`,
      `</div>`,
    ].join("\n")
  }
  return [
    `// charByChar: ${literal} from frame ${startFrame} (2f stagger per character)`,
    `{${literal}.split("").map((char, i) => {`,
    `  const t = interpolate(frame, [${startFrame} + i * 2, ${startFrame} + i * 2 + 15], [20, 0], { easing: Easing.bezier(0.16, 1, 0.3, 1) });`,
    `  return <span key={i} style={{ display: "inline-block", opacity: interpolate(frame, [${startFrame} + i * 2, ${startFrame} + i * 2 + 10], [0, 1]), translate: \`0 \${t}px\` }}>{char}</span>;`,
    `})}`,
  ].join("\n")
}

/**
 * AGENT_UPGRADE_PLAN Phase 2: advanced motion design system.
 *
 * Professional animation as data, not taste: every preset names its easing,
 * duration and transform so the model copies numbers instead of inventing
 * curves. Pure and deterministic — safe inside the paced turn.
 *
 * Web-bundle dialect: snippets assume they run inside `render(t, ctx)` with
 * `const f = ctx.frame` in scope. Motion reads `f` (integer frames),
 * springs read seconds (`ctx.spring(t - startSec, {...})`), easing is
 * `ctx.Easing.bezier(...)`, interpolation `ctx.interpolate(...)` (clamped
 * by default — no extrapolate options needed).
 */

export interface MotionPreset {
  /** What the beat feels like in one line. */
  feel: string
  /** Exact easing snippet to paste (web dialect: ctx.Easing.*). */
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
    easing: "ctx.Easing.bezier(0.16, 1, 0.3, 1)",
    duration: 60,
    transform: "translateY(40) + scale(0.95) → translateY(0) + scale(1)",
    spring: { damping: 18, mass: 0.8, stiffness: 120 },
  },
  punchIn: {
    feel: "Snappy emphasis that overshoots then lands",
    easing: "ctx.Easing.bezier(0.8, 0, 0.2, 1)",
    duration: 24,
    transform: "scale(0.8) + opacity(0) → scale(1) + opacity(1)",
    overshoot: 1.08,
  },
  slideReveal: {
    feel: "Editorial wipe with a masked edge",
    easing: "ctx.Easing.bezier(0.16, 1, 0.3, 1)",
    duration: 45,
    transform: "translateX(-30) + clipPath inset(0 100% 0 0) → translateX(0) + inset(0 0 0 0)",
  },
  seamlessHandoff: {
    feel: "Invisible beat change — next starts before previous ends",
    easing: "ctx.Easing.bezier(0, 0, 0.2, 1)",
    duration: 30,
    transform: "opacity(1) → opacity(0) crossed with opacity(0) → opacity(1)",
    overlap: 15,
    stagger: 3,
  },
  elasticSettle: {
    feel: "Playful landing with visible overshoot",
    easing: "ctx.Easing.bezier(0.16, 1, 0.3, 1)",
    duration: 40,
    transform: "scale(1.12) → scale(1)",
    spring: { damping: 15, mass: 1.2, stiffness: 100 },
    overshoot: 1.12,
  },
  fadeToBlack: {
    feel: "Resolved ending that holds before the cut",
    easing: "ctx.Easing.bezier(0.4, 0, 1, 1)",
    duration: 30,
    transform: "opacity(1) → opacity(0)",
    holdFrames: 10,
  },

  // --- Extended beat vocabulary (Issue 9 fix) --------------------------------
  // The original five covered entrance/exit/transition/settle/emphasis.
  // Real compositions need: reveal, anticipation, cascade, counter-motion,
  // hold, parallax, and morph. Requesting an unmapped beat type previously
  // fell back to heroEntrance, which was wrong for every one of these cases.

  clipReveal: {
    feel: "Masked content becoming visible — clip-path wipe, not a fade",
    easing: "ctx.Easing.bezier(0.16, 1, 0.3, 1)",
    duration: 45,
    transform: "clipPath inset(0 100% 0 0) → inset(0 0 0 0)",
    overlap: 0,
  },
  anticipation: {
    feel: "Pre-movement scale-down before the main entrance — adds weight",
    easing: "ctx.Easing.bezier(0.4, 0, 1, 1)",
    duration: 12,
    transform: "scale(1) → scale(0.94) then scale(0.94) → scale(1.06)",
    spring: { damping: 20, mass: 0.6, stiffness: 200 },
    overshoot: 1.06,
  },
  cascade: {
    feel: "Per-word/per-char stagger — content that reads as it arrives",
    easing: "ctx.Easing.bezier(0.16, 1, 0.3, 1)",
    duration: 15,
    transform: "translateY(20) + opacity(0) → translateY(0) + opacity(1) per item",
    stagger: 3,
  },
  textCascade: {
    feel: "Per-character spring cascade — headline that feels alive",
    easing: "ctx.Easing.bezier(0.16, 1, 0.3, 1)",
    duration: 20,
    transform: "translateY(30) + opacity(0) → translateY(0) + opacity(1) per char, 2f stagger",
    spring: { damping: 18, mass: 0.5, stiffness: 180 },
    stagger: 2,
  },
  counterMotion: {
    feel: "Secondary element moves opposite to primary — creates depth",
    easing: "ctx.Easing.bezier(0.16, 1, 0.3, 1)",
    duration: 45,
    transform: "primary: translateX(-40) → translateX(0); secondary: translateX(20) → translateX(-10)",
    stagger: 0,
  },
  hold: {
    feel: "Element held at rest while the composition breathes",
    easing: "ctx.Easing.bezier(0.4, 0, 0.2, 1)",
    duration: 30,
    transform: "opacity(1) — no movement, just presence",
    holdFrames: 30,
  },
  parallax: {
    feel: "Layers moving at different speeds as a viewport shifts — depth",
    easing: "ctx.Easing.bezier(0.25, 0.1, 0.25, 1)",
    duration: 60,
    transform: "background: translateX(0)→(-20), mid: translateX(0)→(-40), fg: translateX(0)→(-80)",
    stagger: 0,
  },
  morph: {
    feel: "Shape or colour transition from state A to state B",
    easing: "ctx.Easing.bezier(0.4, 0, 0.2, 1)",
    duration: 40,
    transform: "interpolateColors or borderRadius/clip-path morph across the beat",
    overlap: 8,
  },
  idleDrift: {
    feel: "The frame keeps breathing after the landing — 3px sine drift, never frozen",
    easing: "ctx.Easing.bezier(0.4, 0, 0.2, 1)",
    duration: 60,
    transform: "translateY(0) → translateY(±3) sine loop after settle frame",
    holdFrames: 60,
  },
  punchZoom: {
    feel: "Whole-scene push-in: felt as intent, invisible as movement",
    easing: "ctx.Easing.bezier(0.25, 0.1, 0.25, 1)",
    duration: 90,
    transform: "scale(1) → scale(1.04) across the full beat",
    overlap: 0,
  },
}

export type MotionPresetId = keyof typeof MotionPresets

/** Beat type → preset mapping. Maps natural language beat names to preset IDs.
 * The original five are preserved; eight new types fix Issue 9 (unmapped beats
 * previously fell back to heroEntrance, which was wrong for reveal, cascade, etc).
 */
const BEAT_PRESET: Record<string, MotionPresetId> = {
  // Original five
  entrance: "heroEntrance",
  transition: "seamlessHandoff",
  settle: "elasticSettle",
  exit: "fadeToBlack",
  emphasis: "punchIn",
  // Extended vocabulary
  reveal: "clipReveal",
  anticipation: "anticipation",
  cascade: "cascade",
  "text-cascade": "textCascade",
  counter: "counterMotion",
  "counter-motion": "counterMotion",
  hold: "hold",
  pause: "hold",
  parallax: "parallax",
  morph: "morph",
  blend: "morph",
  idle: "idleDrift",
  drift: "idleDrift",
  breathe: "idleDrift",
  breathing: "idleDrift",
  zoom: "punchZoom",
  "push-in": "punchZoom",
  punch: "punchZoom",
}

export const BEAT_TYPES = Object.keys(BEAT_PRESET)

export function presetForBeat(beatType: string): { id: MotionPresetId; preset: MotionPreset } {
  const id = BEAT_PRESET[beatType.toLowerCase()] ?? "heroEntrance"
  return { id, preset: MotionPresets[id] }
}

/** Ready-to-paste snippet for a preset starting at a frame.
 *
 * Web dialect: paste inside `render(t, ctx)` with `const f = ctx.frame`
 * in scope. Springs take seconds (`t - startSec`); windows read frames.
 * ctx.interpolate clamps by default — no extrapolate options needed.
 */
export function presetSnippet(id: MotionPresetId, startFrame: number): string {
  const p = MotionPresets[id]
  const end = startFrame + p.duration
  const s0 = (startFrame / 30).toFixed(2)

  // Specialized snippets for new beat types ---------------------------------

  if (id === "clipReveal") {
    return [
      `// clipReveal: ${p.feel} (frames ${startFrame}→${end})`,
      `const revealProgress = ctx.interpolate(f, [${startFrame}, ${end}], [0, 1], { easing: ${p.easing} });`,
      `// Apply to the element's style:`,
      `// el.style.clipPath = "inset(0 " + ((1 - revealProgress) * 100) + "% 0 0)"`,
    ].join("\n")
  }

  if (id === "cascade" || id === "textCascade") {
    const stagger = p.stagger ?? 3
    const springCfg = p.spring
      ? `{ damping: ${p.spring.damping}, mass: ${p.spring.mass}, stiffness: ${p.spring.stiffness} }`
      : `{ damping: 18, mass: 0.5, stiffness: 180 }`
    return [
      `// ${id}: ${p.feel} (start frame ${startFrame}, ${stagger}f stagger per item)`,
      `// items is your array; i is the item index`,
      `const itemT = (i) => t - (${startFrame} + i * ${stagger}) / 30;`,
      `const itemSpring = (i) => ctx.spring(itemT(i), ${springCfg});`,
      `// Per item, per frame:`,
      `// el.style.opacity = Math.max(0, Math.min(1, itemSpring(i)))`,
      `// el.style.translate = "0 " + ctx.interpolate(f, [${startFrame} + i * ${stagger}, ${startFrame} + i * ${stagger} + ${p.duration}], [20, 0]) + "px"`,
    ].join("\n")
  }

  if (id === "counterMotion") {
    return [
      `// counterMotion: ${p.feel} (frames ${startFrame}→${end})`,
      `const motionProgress = ctx.interpolate(f, [${startFrame}, ${end}], [0, 1], { easing: ${p.easing} });`,
      `// Primary element (hero/headline):`,
      `// el.style.translate = ctx.interpolate(motionProgress, [0, 1], [-40, 0]) + "px 0"`,
      `// Secondary element (sub/label) — moves opposite:`,
      `// el2.style.translate = ctx.interpolate(motionProgress, [0, 1], [20, -10]) + "px 0"`,
    ].join("\n")
  }

  if (id === "parallax") {
    return [
      `// parallax: ${p.feel} (frames ${startFrame}→${end})`,
      `const scrollProgress = ctx.interpolate(f, [${startFrame}, ${end}], [0, 1], { easing: ${p.easing} });`,
      `// Background layer (slowest): el.style.translate = (scrollProgress * -20) + "px 0"`,
      `// Mid layer: el.style.translate = (scrollProgress * -40) + "px 0"`,
      `// Foreground layer (fastest): el.style.translate = (scrollProgress * -80) + "px 0"`,
    ].join("\n")
  }

  if (id === "idleDrift") {
    return [
      `// idleDrift: ${p.feel} (holds from frame ${startFrame})`,
      `// Deterministic sine of t — identical every scrub and export.`,
      `const breathe = t > ${s0} ? Math.sin((t - ${s0}) * 2.4) * 3 : 0;`,
      `// Add to the settled translate: el.style.translate = "0 " + (baseY + breathe) + "px"`,
    ].join("\n")
  }

  if (id === "punchZoom") {
    return [
      `// punchZoom: ${p.feel} (frames ${startFrame}→${end})`,
      `const push = ctx.interpolate(f, [${startFrame}, ${end}], [1, 1.04], { easing: ${p.easing} });`,
      `// Apply on the scene wrapper: el.style.scale = String(push)`,
    ].join("\n")
  }

  if (id === "anticipation") {
    const preEnd = startFrame + Math.round(p.duration * 0.4)
    const mainEnd = startFrame + p.duration
    const preSec = (preEnd / 30).toFixed(2)
    return [
      `// anticipation: ${p.feel} (frames ${startFrame}→${mainEnd})`,
      `// Phase 1: compress (${startFrame}→${preEnd})`,
      `const compress = ctx.interpolate(f, [${startFrame}, ${preEnd}], [1, 0.94], { easing: ctx.Easing.bezier(0.4, 0, 1, 1) });`,
      `// Phase 2: release with overshoot (${preEnd}→${mainEnd})`,
      `const release = ctx.spring(t - ${preSec}, { damping: ${p.spring!.damping}, mass: ${p.spring!.mass}, stiffness: ${p.spring!.stiffness} });`,
      `// Combine: el.style.scale = f < ${preEnd} ? compress : 0.94 + release * 0.12`,
    ].join("\n")
  }

  // Default generic snippet for all other presets ---------------------------

  const lines = [
    `// ${id}: ${p.feel} (frames ${startFrame}→${end})`,
    `const progress = ctx.interpolate(f, [${startFrame}, ${end}], [0, 1], { easing: ${p.easing} });`,
  ]
  if (p.spring) {
    lines.push(
      `const settle = ctx.spring(t - ${s0}, { damping: ${p.spring.damping}, mass: ${p.spring.mass}, stiffness: ${p.spring.stiffness} });`
    )
  }
  if (p.overlap !== undefined && p.overlap > 0) {
    lines.push(`// Handoff: start the next beat ${p.overlap}f before frame ${end} (overlap, never a hard cut).`)
  }
  if (p.holdFrames !== undefined) {
    lines.push(`// Ending: hold the final state ${p.holdFrames}f past frame ${end} so the cut resolves.`)
  }
  if (p.stagger !== undefined && p.stagger > 0) {
    lines.push(`// Stagger: offset each item by i * ${p.stagger} frames: t - (${startFrame} + i * ${p.stagger}) / 30.`)
  }
  lines.push(`// Transform: ${p.transform}`)
  return lines.join("\n")
}

/**
 * Keyframe sequence: the motion-graphic workhorse. A single A→B
 * interpolate reads as a slide; three or more stops read as choreography
 * (anticipation → action → overshoot → settle). Emits a ready-to-paste
 * multi-stop interpolate: copy it, never hand-roll timing values.
 *
 * Example: keyframeSnippet("heroScale", [15, 30, 60], [0.94, 1.08, 1])
 * gives compress → overshoot → land across frames 15→60.
 */
export function keyframeSnippet(
  prop: string,
  frames: number[],
  values: number[],
  _easings?: string[]
): string {
  const n = Math.min(frames.length, values.length)
  const f = frames.slice(0, n)
  const v = values.slice(0, n)
  // One easing per call (the runtime takes a single easing fn): ease-out
  // carries the action, the overshoot value itself carries the anticipation.
  const lines = [
    `// keyframes: ${prop} across ${n} stops (frames ${f[0]}→${f[n - 1]})`,
    `const ${prop}Keys = ctx.interpolate(f, [${f.join(", ")}], [${v.join(", ")}], { easing: ctx.Easing.easeOut });`,
  ]
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

export type TextAnimationStyle = "charByChar" | "wordByWord" | "maskReveal" | "counter"

/**
 * Ready-to-paste text animation for a headline. Staggers are baked in
 * (2f per character, 5f per word) so the model does not hand-roll timing.
 * "counter" is the Stargazer mechanic: an odometer that eases 0→N with a
 * spring overshoot on arrival — stats, milestones, subscriber counts.
 *
 * Web dialect: build the spans once in init() (or lazily in render with a
 * childElementCount guard), then set inline styles per frame in render().
 */
export function textAnimationSnippet(
  style: TextAnimationStyle,
  text: string,
  startFrame: number
): string {
  if (style === "counter") {
    const target = Math.max(1, Math.round(Number(text.replace(/[^0-9.]/g, "")) || 1000))
    const end = startFrame + 60
    const endSec = (end / 30).toFixed(2)
    return [
      `// counter: 0 → ${target.toLocaleString("en-US")} over frames ${startFrame}→${end} (Stargazer mechanic)`,
      `const countRaw = ctx.interpolate(f, [${startFrame}, ${end}], [0, ${target}], { easing: ctx.Easing.easeOut });`,
      `const countSettle = ctx.spring(t - ${endSec}, { damping: 12, mass: 1, stiffness: 120 });`,
      `const countShown = Math.round(countRaw * (f < ${end} ? 1 : Math.min(1.04, 1 + countSettle * 0.04)));`,
      `// Render: el.textContent = countShown.toLocaleString("en-US") — tabular-nums via font-variant-numeric so digits don't jitter.`,
      `// Pair with a scale punch on arrival: el.style.scale = 1 + Math.max(0, countSettle) * 0.08 for the 10 frames after ${end}.`,
    ].join("\n")
  }
  const safe = text.replace(/`/g, "'").slice(0, 120)
  const literal = JSON.stringify(safe)
  if (style === "wordByWord") {
    return [
      `// wordByWord: ${literal} from frame ${startFrame} (snappy spring per word)`,
      `// init(): split into spans once — <span class="w" data-i="0..n">word</span> inside #headline`,
      `// render(), per span i:`,
      `// const s = ctx.spring(t - (${startFrame} + i * 5) / 30, { damping: 18, mass: 0.5, stiffness: 180 });`,
      `// span.style.opacity = Math.max(0, Math.min(1, s)); span.style.marginRight = "16px"; span.style.display = "inline-block";`,
    ].join("\n")
  }
  if (style === "maskReveal") {
    const end = startFrame + 45
    return [
      `// maskReveal: ${literal} frames ${startFrame}→${end}`,
      `// Interpolate a NUMBER 0→1, then compute the inset string.`,
      `const maskProgress = ctx.interpolate(f, [${startFrame}, ${end}], [0, 1], { easing: ctx.Easing.easeOut });`,
      `// maskEl.style.clipPath = "inset(0 " + ((1 - maskProgress) * 100) + "% 0 0)"`,
    ].join("\n")
  }
  return [
    `// charByChar: ${literal} from frame ${startFrame} (2f stagger per character)`,
    `// init(): one <span> per char inside #headline. render(), per char i:`,
    `// const d = ${startFrame} + i * 2;`,
    `// const y = ctx.interpolate(f, [d, d + 15], [20, 0], { easing: ctx.Easing.easeOut });`,
    `// span.style.translate = "0 " + y + "px"; span.style.opacity = ctx.interpolate(f, [d, d + 10], [0, 1]);`,
  ].join("\n")
}

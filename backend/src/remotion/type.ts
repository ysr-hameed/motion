/**
 * The type scale contract for a 1920x1080 frame.
 *
 * The agent had no scale reference at all, so it guessed: headlines that filled
 * a third of the frame and captions nobody could read. These numbers are what
 * motion typography actually uses at 1080p, and they are enforced in two places
 * — stated in the prompt as guidance, checked in validate.ts as an error — so
 * guessing gets corrected in the same turn rather than on the third attempt.
 */
export const TYPE_SCALE = {
  /** Hero / main title. */
  hero: [130, 200],
  /** Secondary line under a hero. */
  sub: [64, 96],
  /** Body copy and labels. */
  body: [32, 44],
  /** Captions and fine print — still legible on a phone. */
  caption: [24, 28],
  /** Eyebrows and kickers. */
  kicker: [20, 24],
} as const

/** Nothing below this is legible as video. Nothing above it fills the frame. */
export const MIN_FONT = 18
export const MAX_FONT = 320

/** Keep type off the very edge of the frame, where encoders crop it. */
export const SAFE_MARGIN = 96

/** Display type wants tight leading; body wants open. */
export const DISPLAY_LINE_HEIGHT = [0.9, 1.1]

/**
 * The catalogue a composition can reach, kept in sync with the browser's font
 * registry by the build script. The keys are what `Fonts.<key>.family` expects.
 */
export interface FontNote {
  key: string
  role: string
  note: string
}

/**
 * Font faces that read as a deliberate choice, so the model does not default to
 * `system-ui`. Kept short on purpose: this list goes inline in the prompt, and
 * the full catalogue is one load_skill away.
 */
export const DISPLAY_FACES = [
  "anton",
  "bebasNeue",
  "archivoBlack",
  "syne",
  "unbounded",
  "bricolage",
  "fraunces",
  "instrumentSerif",
  "bodoni",
  "newsreader",
] as const

/** Neutral and mono faces, for UI-ish overlays and data. */
export const TEXT_FACES = ["karla", "archivo", "manrope", "outfit", "spaceGrotesk", "spaceMono", "chivo"] as const

/**
 * AGENT_UPGRADE_PLAN Phase 2: typography presets.
 *
 * Lockups that already pair size, tracking, leading and weight, so the model
 * picks a voice instead of assembling one from numbers.
 */
export interface TypeRole {
  size: number
  tracking: number
  lineHeight: number
  weight: number
  uppercase?: boolean
  opacity?: number
}

export const TypographyPresets = {
  heroLockup: {
    kicker: { size: 28, tracking: 0.15, lineHeight: 1.4, weight: 600, uppercase: true, opacity: 0.7 },
    headline: { size: 140, tracking: -0.02, lineHeight: 0.95, weight: 700 },
    subhead: { size: 48, tracking: 0, lineHeight: 1.3, weight: 400 },
  },
  editorial: {
    headline: { size: 120, tracking: -0.01, lineHeight: 1.0, weight: 500 },
    body: { size: 40, tracking: 0.01, lineHeight: 1.5, weight: 400 },
    caption: { size: 28, tracking: 0.05, lineHeight: 1.4, weight: 400, opacity: 0.8 },
  },
  bold: {
    headline: { size: 160, tracking: -0.03, lineHeight: 0.9, weight: 900 },
    subhead: { size: 52, tracking: 0.02, lineHeight: 1.2, weight: 700 },
  },
} satisfies Record<string, Record<string, TypeRole>>

export type TypographyPresetId = keyof typeof TypographyPresets

/**
 * Longer copy gets smaller type: under 20 chars takes the max, over 60 the
 * base, linear between. Keeps headlines inside the safe margin.
 */
export function adaptiveTextSize(text: string, role: "hero" | "sub" | "body"): number {
  const [base, max] = TYPE_SCALE[role]
  const chars = text.trim().length
  if (chars < 20) return max
  if (chars > 60) return base
  return Math.round(max - ((chars - 20) / 40) * (max - base))
}

/** One line per face for the prompt. */
export function faceLine(): string {
  return [
    `display: ${DISPLAY_FACES.join(", ")}`,
    `text/UI: ${TEXT_FACES.join(", ")}`,
  ].join("\n")
}
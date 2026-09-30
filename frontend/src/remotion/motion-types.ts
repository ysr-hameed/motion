/**
 * MotionDoc types — mirrors backend/src/lib/motion-schema.ts.
 * Nested shape: layers carry `props` (visuals) + `anim` (motion).
 * Keep both in sync (same field names, same caps).
 */

/**
 * Renderer easing ids — must stay in sync with the backend compiler
 * (backend/src/lib/motion/easing.ts RENDERER_EASINGS). Legacy five first;
 * compiler profiles map onto the extended set. Unknown ids fall back to
 * "out" at resolve time, so old docs always render.
 */
export type EasingKind =
  | "linear"
  | "in"
  | "out"
  | "in-out"
  | "spring"
  | "outQuad"
  | "outCubic"
  | "outQuart"
  | "outQuint"
  | "outExpo"
  | "outCirc"
  | "inOutQuad"
  | "inOutCubic"
  | "outBack"
  | "outElastic"

export type LayerType =
  | "text"
  | "rect"
  | "image"
  | "particles"
  | "waveform"
  | "countdown"
  | "lower-third"
  | "eqbars"
  | "gradient"
  | "ring"
  | "ticker"
  | "glow"
  | "confetti"
  | "barchart"
  | "linechart"
  | "stat"
  | "audio"
  | "icon"

export interface Animatable {
  x?: number
  y?: number
  opacity?: number
  scale?: number
  rotation?: number
  skewX?: number
  skewY?: number
  blur?: number
  rotateX?: number
  rotateY?: number
  color?: string
}

export interface Keyframe {
  frame: number
  props: Animatable
  easing?: EasingKind
}

export interface LayerAnim {
  startFrame?: number
  keyframes?: Keyframe[]
  enter?: "spring" | "fade" | "slide"
  damping?: number
  exitFadeFrames?: number
  loop?: boolean
}

export interface LayerProps {
  /** Icon registry name (icon layers): search, cursor, pointer, close, menu, play, pause, heart, star, bell, check, arrow-right, plus, home, user, send. */
  name?: string
  text?: string
  font?: "display" | "body"
  /** Any Google Fonts family name (auto-loaded at render). */
  fontFamily?: string
  /** Type voice for text layers. */
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize"
  lineHeight?: number
  /** Layer fusion with the stage behind it. */
  blendMode?: "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten"
  borderColor?: string
  borderWidth?: number
  grayscale?: number
  sepia?: number
  brightness?: number
  contrast?: number
  saturate?: number
  backdropBlur?: number
  strokeWidth?: number
  shadowBlur?: number
  shadowOffsetY?: number
  fontStyle?: "normal" | "italic"
  weight?: number
  size?: number
  color?: string
  align?: "left" | "center" | "right"
  letterSpacing?: number
  stroke?: string
  shadow?: string
  fx?: "none" | "typewriter" | "wave" | "glitch" | "pop"
  fxSpeed?: number
  w?: number
  h?: number
  radius?: number
  src?: string
  fit?: "cover" | "contain"
  count?: number
  speed?: number
  bars?: number
  height?: number
  from?: number
  title?: string
  sub?: string
  accent?: string
  thickness?: number
  gap?: number
  progress?: number
  gradientFrom?: string
  gradientTo?: string
  angle?: number
  blur?: number
  drift?: number
  volume?: number
  offsetSecs?: number
  colors?: string[]
  gravity?: number
  direction?: "up" | "down" | "left" | "right"
  duration?: number
  /** Chart data (barchart/linechart): 2-12 values. */
  values?: number[]
  /** Chart x labels, one per value. */
  labels?: string[]
  /** Stat count-up target. */
  target?: number
  /** Stat affixes, e.g. prefix "$", suffix "M". */
  prefix?: string
  suffix?: string
  /** Stat decimals 0-2. */
  decimals?: number
}

export interface Layer {
  id: string
  type: LayerType
  props?: LayerProps
  anim?: LayerAnim
  /**
   * Motion intent (DSL) — the edit surface. The backend compiler turns it
   * into anim keyframes before render; the renderer ignores this field.
   * Present on AI-composed docs, absent on legacy docs.
   */
  motion?: {
    enter?: Record<string, number | string>
    emphasis?: Record<string, number | string>
    exit?: Record<string, number | string>
    ambient?: Record<string, number | string>
  }
}

export interface MotionDoc {
  version: 1
  canvas: { format: "16:9" | "9:16" | "1:1"; fps: 30; durationSecs: number }
  bg: string
  layers: Layer[]
}

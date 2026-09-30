import { Easing, interpolate, interpolateColors, spring } from "remotion"
import type { EasingKind, Keyframe } from "../motion-types"

export function easingFn(kind: EasingKind | undefined) {
  switch (kind) {
    case "linear":
      return Easing.linear
    case "in":
      return Easing.in(Easing.ease)
    case "in-out":
      return Easing.inOut(Easing.ease)
    case "spring":
      return Easing.out(Easing.back(1.4))
    case "outQuad":
      return Easing.out(Easing.quad)
    case "outCubic":
      return Easing.out(Easing.cubic)
    case "outQuart":
      return Easing.out(Easing.poly(4))
    case "outQuint":
      return Easing.out(Easing.poly(5))
    case "outExpo":
      return Easing.out(Easing.exp)
    case "outCirc":
      return Easing.out(Easing.circle)
    case "inOutQuad":
      return Easing.inOut(Easing.quad)
    case "inOutCubic":
      return Easing.inOut(Easing.cubic)
    case "outBack":
      return Easing.out(Easing.back(1.2))
    case "outElastic":
      return Easing.out(Easing.elastic(1))
    case "out":
    default:
      return Easing.out(Easing.ease)
  }
}

export interface ResolvedProps {
  x: number
  y: number
  opacity: number
  scale: number
  rotation: number
  skewX: number
  skewY: number
  blur: number
  rotateX: number
  rotateY: number
  color: string | null
}

/**
 * Resolve animatable props at a frame by walking sorted keyframes.
 * Numbers interpolate with the *target* keyframe's easing; colors
 * step at keyframe boundaries via interpolateColors.
 */
export function resolveKeyframes(
  keyframes: Keyframe[] | undefined,
  frame: number,
  baseColor: string
): ResolvedProps {
  const out: ResolvedProps = {
    x: 0,
    y: 0,
    opacity: 1,
    scale: 1,
    rotation: 0,
    skewX: 0,
    skewY: 0,
    blur: 0,
    rotateX: 0,
    rotateY: 0,
    color: null,
  }
  const kfs = [...(keyframes ?? [])].sort((a, b) => a.frame - b.frame)
  if (kfs.length === 0) return out

  type NumKey =
    | "x"
    | "y"
    | "opacity"
    | "scale"
    | "rotation"
    | "skewX"
    | "skewY"
    | "blur"
    | "rotateX"
    | "rotateY"
  const keys: NumKey[] = [
    "x",
    "y",
    "opacity",
    "scale",
    "rotation",
    "skewX",
    "skewY",
    "blur",
    "rotateX",
    "rotateY",
  ]
  for (const key of keys) {
    const stops: Array<{ frame: number; value: number; easing: EasingKind }> = [
      {
        frame: 0,
        value: key === "opacity" || key === "scale" ? 1 : 0,
        easing: "out",
      },
      ...kfs
        .filter((k) => typeof k.props[key] === "number")
        .map((k) => ({
          frame: k.frame,
          value: k.props[key] as number,
          easing: k.easing ?? ("out" as EasingKind),
        })),
    ]
    if (stops.length === 1) {
      out[key] = stops[0].value
      continue
    }
    // find surrounding stops
    let i = 0
    while (i < stops.length - 1 && stops[i + 1].frame <= frame) i++
    if (frame <= stops[0].frame) {
      out[key] = stops[0].value
    } else if (i >= stops.length - 1) {
      out[key] = stops[stops.length - 1].value
    } else {
      const a = stops[i]
      const b = stops[i + 1]
      // spring easing can't interpolate arbitrary ranges — fall back to out
      const ease =
        b.easing === "spring" ? Easing.out(Easing.ease) : easingFn(b.easing)
      out[key] = interpolate(frame, [a.frame, b.frame], [a.value, b.value], {
        easing: ease,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    }
  }

  // color: last keyframe at or before frame wins
  let color: string | null = null
  for (const k of kfs) {
    if (k.frame <= frame && k.props.color) color = k.props.color
  }
  if (color && /^#[0-9a-fA-F]{6}$/.test(color)) {
    // smooth blend from base across 6 frames for polish
    const hit = kfs.filter((k) => k.frame <= frame && k.props.color).pop()
    if (hit && frame - hit.frame < 6) {
      try {
        out.color = interpolateColors(frame - hit.frame, [0, 6], [
          baseColor,
          color,
        ])
      } catch {
        out.color = color
      }
    } else {
      out.color = color
    }
  }
  return out
}

export function springIn(
  frame: number,
  fps: number,
  damping = 13
): { scale: number; opacity: number } {
  const s = spring({ frame, fps, config: { damping, stiffness: 160 } })
  return { scale: s, opacity: frame < 0 ? 0 : Math.min(1, frame / 6 + 0.2) }
}

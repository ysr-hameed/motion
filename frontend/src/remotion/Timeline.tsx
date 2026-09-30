import { AbsoluteFill, Sequence, interpolate, spring } from "remotion"
import type { CSSProperties } from "react"
import { resolveKeyframes } from "./engine/keyframes"
import type { Layer, MotionDoc } from "./motion-types"
import type { LayerContext } from "./layers/types"
import { TextLayer } from "./layers/TextLayer"
import { RectLayer } from "./layers/RectLayer"
import { ImageLayer } from "./layers/ImageLayer"
import { ParticlesLayer } from "./layers/ParticlesLayer"
import { WaveformLayer } from "./layers/WaveformLayer"
import { CountdownLayer } from "./layers/CountdownLayer"
import { LowerThirdLayer } from "./layers/LowerThirdLayer"
import { EqBarsLayer } from "./layers/EqBarsLayer"
import { GradientLayer } from "./layers/GradientLayer"
import { RingLayer } from "./layers/RingLayer"
import { TickerLayer } from "./layers/TickerLayer"
import { GlowLayer } from "./layers/GlowLayer"
import { ConfettiLayer } from "./layers/ConfettiLayer"
import { AudioLayer } from "./layers/AudioLayer"
import { BarChartLayer } from "./layers/BarChartLayer"
import { LineChartLayer } from "./layers/LineChartLayer"
import { StatLayer } from "./layers/StatLayer"
import { IconLayer } from "./layers/IconLayer"

/**
 * Central effects wrapper: skew/blur/3D/filter/blend resolve here so no
 * layer component needs its own copy. Only mounts when actually used.
 */
function EffectLayer({ layer, ctx }: { layer: Layer; ctx: LayerContext }) {
  const { skewX, skewY, blur, rotateX, rotateY } = ctx.resolved
  const p = layer.props ?? {}
  const blend = p.blendMode
  const filters: string[] = []
  if (blur > 0) filters.push(`blur(${blur}px)`)
  if (typeof p.brightness === "number" && p.brightness !== 1)
    filters.push(`brightness(${p.brightness})`)
  if (typeof p.contrast === "number" && p.contrast !== 1)
    filters.push(`contrast(${p.contrast})`)
  if (typeof p.saturate === "number" && p.saturate !== 1)
    filters.push(`saturate(${p.saturate})`)
  const has3d = rotateX !== 0 || rotateY !== 0
  const transforms: string[] = []
  if (rotateX) transforms.push(`rotateX(${rotateX}deg)`)
  if (rotateY) transforms.push(`rotateY(${rotateY}deg)`)
  if (skewX || skewY) transforms.push(`skew(${skewX}deg, ${skewY}deg)`)
  const backdrop =
    typeof p.backdropBlur === "number" && p.backdropBlur > 0
      ? `blur(${Math.min(40, p.backdropBlur)}px)`
      : undefined
  if (
    transforms.length === 0 &&
    filters.length === 0 &&
    !backdrop &&
    (!blend || blend === "normal")
  )
    return <RenderLayer layer={layer} ctx={ctx} />
  const inner = (
    <div
      className="w-fit"
      style={{
        transform: transforms.length > 0 ? transforms.join(" ") : undefined,
        filter: filters.length > 0 ? filters.join(" ") : undefined,
        backdropFilter: backdrop,
        WebkitBackdropFilter: backdrop,
        mixBlendMode:
          blend && blend !== "normal"
            ? (blend as CSSProperties["mixBlendMode"])
            : undefined,
      }}
    >
      <RenderLayer layer={layer} ctx={ctx} />
    </div>
  )
  return has3d ? (
    <div style={{ perspective: "1000px" }} className="w-fit">
      {inner}
    </div>
  ) : (
    inner
  )
}

function RenderLayer({ layer, ctx }: { layer: Layer; ctx: LayerContext }) {  switch (layer.type) {
    case "text":
      return <TextLayer layer={layer} ctx={ctx} />
    case "rect":
      return <RectLayer layer={layer} ctx={ctx} />
    case "image":
      return <ImageLayer layer={layer} ctx={ctx} />
    case "particles":
      return <ParticlesLayer layer={layer} ctx={ctx} />
    case "waveform":
      return <WaveformLayer layer={layer} ctx={ctx} />
    case "countdown":
      return <CountdownLayer layer={layer} ctx={ctx} />
    case "lower-third":
      return <LowerThirdLayer layer={layer} ctx={ctx} />
    case "eqbars":
      return <EqBarsLayer layer={layer} ctx={ctx} />
    case "gradient":
      return <GradientLayer layer={layer} ctx={ctx} />
    case "ring":
      return <RingLayer layer={layer} ctx={ctx} />
    case "ticker":
      return <TickerLayer layer={layer} ctx={ctx} />
    case "glow":
      return <GlowLayer layer={layer} ctx={ctx} />
    case "confetti":
      return <ConfettiLayer layer={layer} ctx={ctx} />
    case "barchart":
      return <BarChartLayer layer={layer} ctx={ctx} />
    case "linechart":
      return <LineChartLayer layer={layer} ctx={ctx} />
    case "stat":
      return <StatLayer layer={layer} ctx={ctx} />
    case "audio":
      return <AudioLayer layer={layer} ctx={ctx} />
    case "icon":
      return <IconLayer layer={layer} ctx={ctx} />
    default:
      return null
  }
}

function baseColorOf(layer: Layer): string {
  const p = layer.props ?? {}
  switch (layer.type) {
    case "gradient":
      return p.gradientFrom ?? p.color ?? "#7f1d1d"
    case "glow":
      return p.color ?? "#dc2626"
    case "confetti":
      return p.colors?.[0] ?? p.color ?? "#ffffff"
    case "image":
    case "audio":
      return "#ffffff"
    case "lower-third":
      return p.accent ?? p.color ?? "#ffffff"
    default:
      return p.color ?? "#ffffff"
  }
}

/**
 * Turns a MotionDoc into a Remotion timeline: one Sequence per layer,
 * enter/exit envelopes computed centrally, keyframes resolved per frame.
 */
export function Timeline({
  doc,
  frame,
  fps,
  durationFrames,
}: {
  doc: MotionDoc
  frame: number
  fps: number
  durationFrames: number
}) {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: doc.bg,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {doc.layers.map((layer) => {
        const anim = layer.anim ?? {}
        const start = Math.max(0, anim.startFrame ?? 0)
        const local = frame - start
        if (local < 0) return null

        const resolved = resolveKeyframes(
          anim.keyframes,
          local,
          baseColorOf(layer)
        )

        // enter envelope
        let enterT = 1
        let enterScale = 1
        const enter = anim.enter
        if (enter && local < 20) {
          if (enter === "spring") {
            enterScale = spring({
              frame: local,
              fps,
              config: { damping: 13, stiffness: 160 },
            })
            enterT = Math.min(1, local / 6 + 0.2)
          } else {
            enterT = interpolate(local, [0, 14], [0, 1], {
              extrapolateRight: "clamp",
            })
          }
        }

        // exit envelope
        let exitT = 1
        const lastFrames = anim.exitFadeFrames ?? 0
        if (lastFrames > 0) {
          exitT = interpolate(
            frame,
            [durationFrames - lastFrames, durationFrames - 1],
            [1, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          )
        }

        const ctx: LayerContext = {
          frame: local,
          globalFrame: frame,
          fps,
          durationFrames,
          resolved,
          enterT,
          enterScale,
          exitT,
        }

        return (
          <Sequence
            key={layer.id}
            from={start}
            durationInFrames={durationFrames - start}
            layout="none"
          >
            <EffectLayer layer={layer} ctx={ctx} />
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}

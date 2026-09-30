import type { LayerContext } from "./types"
import type { Layer } from "../motion-types"

const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

const FALLBACKS = ["#ffffff", "#dc2626", "#fbbf24", "#22d3ee"]

/**
 * Confetti burst: colored rects tumble down (or up) with rotation.
 */
export function ConfettiLayer({
  layer,
  ctx,
}: {
  layer: Layer
  ctx: LayerContext
}) {
  const p = layer.props ?? {}
  const count = Math.min(60, Math.max(1, Math.round(p.count ?? 24)))
  const palette =
    p.colors && p.colors.length > 0 ? p.colors : FALLBACKS
  const gravity = p.gravity ?? 0.8
  const up = p.direction === "up"
  const pieces = Array.from({ length: count }, (_, i) => {
    const x = rand(i * 3.1) * 100
    const span = 130
    const prog = ((rand(i * 7.3) * span + ctx.frame * gravity * (up ? -1 : 1)) % span + span) % span
    const y = up ? 100 - prog : prog - 15
    return {
      x,
      y,
      w: 6 + rand(i * 5.7) * 10,
      h: 8 + rand(i * 9.4) * 14,
      rot: ctx.frame * (1 + rand(i * 2.2) * 3) * (i % 2 ? 1 : -1),
      color: palette[i % palette.length],
      o: 0.6 + rand(i * 4.9) * 0.4,
    }
  })
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        opacity: ctx.resolved.opacity * ctx.enterT * ctx.exitT,
      }}
    >
      {pieces.map((d, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${d.x}%`,
            top: `${d.y}%`,
            width: d.w,
            height: d.h,
            borderRadius: 2,
            backgroundColor: d.color,
            opacity: d.o,
            transform: `rotate(${d.rot}deg)`,
          }}
        />
      ))}
    </div>
  )
}

import type { LayerContext } from "./types"
import type { Layer } from "../motion-types"

export function EqBarsLayer({
  layer,
  ctx,
}: {
  layer: Layer
  ctx: LayerContext
}) {
  const p = layer.props ?? {}
  const count = Math.min(64, Math.max(1, Math.round(p.bars ?? 16)))
  const color = ctx.resolved.color ?? p.color ?? "#ffffff"
  const bars = Array.from({ length: count }, (_, i) => {
    const h = 12 + 68 * Math.abs(Math.sin(ctx.frame * 0.3 + i * 0.9))
    return h
  })
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 6,
        height: 90,
        opacity: ctx.resolved.opacity * ctx.enterT * ctx.exitT,
        transform: `translate(${ctx.resolved.x}px, ${ctx.resolved.y}px)`,
      }}
    >
      {bars.map((h, i) => (
        <div
          key={i}
          style={{
            width: 7,
            height: h,
            borderRadius: 999,
            backgroundColor: color,
          }}
        />
      ))}
    </div>
  )
}

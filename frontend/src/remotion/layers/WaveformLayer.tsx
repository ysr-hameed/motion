import type { LayerContext } from "./types"
import type { Layer } from "../motion-types"

export function WaveformLayer({
  layer,
  ctx,
}: {
  layer: Layer
  ctx: LayerContext
}) {
  const p = layer.props ?? {}
  const count = Math.min(64, Math.max(1, Math.round(p.bars ?? 32)))
  const color = ctx.resolved.color ?? p.color ?? "#ffffff"
  const bars = Array.from({ length: count }, (_, i) => {
    const h = 18 + 82 * Math.abs(Math.sin(ctx.frame * 0.22 + i * 0.55))
    return Math.max(4, h)
  })
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        gap: 8,
        height: 120,
        opacity: ctx.resolved.opacity * ctx.enterT * ctx.exitT,
        transform: `translate(${ctx.resolved.x}px, ${ctx.resolved.y}px) scale(${ctx.resolved.scale * ctx.enterScale})`,
      }}
    >
      {bars.map((h, i) => (
        <div
          key={i}
          style={{
            width: 9,
            height: h,
            borderRadius: 999,
            backgroundColor: color,
            opacity: 0.9,
          }}
        />
      ))}
    </div>
  )
}

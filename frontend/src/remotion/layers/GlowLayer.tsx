import type { LayerContext } from "./types"
import type { Layer } from "../motion-types"

/**
 * Soft ambient glow blob that drifts. Pure atmosphere — sits
 * behind hero layers.
 */
export function GlowLayer({ layer, ctx }: { layer: Layer; ctx: LayerContext }) {
  const p = layer.props ?? {}
  const size = p.w ?? 480
  const color = ctx.resolved.color ?? p.color ?? "#dc2626"
  const drift = p.drift ?? 0.6
  const t = ctx.frame / ctx.fps
  const x = Math.sin(t * drift) * 90 + (ctx.resolved.x ?? 0)
  const y = Math.cos(t * drift * 0.8) * 70 + (ctx.resolved.y ?? 0)
  return (
    <div
      style={{
        position: "absolute",
        left: `calc(50% + ${x - size / 2}px)`,
        top: `calc(50% + ${y - size / 2}px)`,
        width: size,
        height: p.h ?? size,
        borderRadius: 999,
        background: `radial-gradient(circle, ${color} 0%, transparent 65%)`,
        filter: `blur(${p.blur ?? 60}px)`,
        opacity: (ctx.resolved.opacity ?? 0.55) * ctx.enterT * ctx.exitT,
        transform: `scale(${ctx.resolved.scale * ctx.enterScale})`,
      }}
    />
  )
}

import type { LayerContext } from "./types"
import type { Layer } from "../motion-types"

/**
 * Full-bleed animated gradient wash. Loops forever; drift controls
 * how fast the gradient angle breathes.
 */
export function GradientLayer({
  layer,
  ctx,
}: {
  layer: Layer
  ctx: LayerContext
}) {
  const p = layer.props ?? {}
  const from = p.gradientFrom ?? p.color ?? "#7f1d1d"
  const to = p.gradientTo ?? "#09090b"
  const baseAngle = p.angle ?? 135
  const drift = p.drift ?? 0.5
  const angle = baseAngle + Math.sin(ctx.frame * 0.02 * drift) * 25
  return (
    <div
      style={{
        position: "absolute",
        inset: -40,
        background: `linear-gradient(${angle}deg, ${from}, ${to})`,
        opacity: (ctx.resolved.opacity ?? 1) * ctx.enterT * ctx.exitT,
      }}
    />
  )
}

import type { LayerContext } from "./types"
import { familyOf } from "./types"
import type { Layer } from "../motion-types"

/**
 * Count-up stat: 0 → target over the first half of the composition,
 * with prefix/suffix/decimals (e.g. $ 12.4 M). The earnings-graph
 * companion: pair with barchart/linechart for data stories.
 */
export function StatLayer({
  layer,
  ctx,
}: {
  layer: Layer
  ctx: LayerContext
}) {
  const p = layer.props ?? {}
  const target = typeof p.target === "number" ? p.target : 100
  const decimals =
    typeof p.decimals === "number"
      ? Math.min(2, Math.max(0, Math.round(p.decimals)))
      : 0
  const prefix = typeof p.prefix === "string" ? p.prefix : ""
  const suffix = typeof p.suffix === "string" ? p.suffix : ""
  const size = p.size ?? 140
  // Ease-out count over ~55% of the runtime, then hold.
  const t = Math.max(0, Math.min(1, ctx.frame / Math.max(1, ctx.durationFrames * 0.55)))
  const eased = 1 - Math.pow(1 - t, 3)
  const shown = (target * eased).toFixed(decimals)
  const grouped = Number(shown).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  return (
    <div
      style={{
        opacity: ctx.resolved.opacity * ctx.enterT * ctx.exitT,
        transform: `translate(${ctx.resolved.x}px, ${ctx.resolved.y}px) scale(${ctx.resolved.scale * ctx.enterScale})`,
        textAlign: "center",
      }}
    >
      <div
        style={{
          color: ctx.resolved.color ?? p.color ?? "#ffffff",
          fontSize: size,
          fontWeight: Math.min(900, Math.max(100, p.weight ?? 800)),
          lineHeight: 1.05,
          fontFamily: familyOf(p),
          letterSpacing: p.letterSpacing ?? 0,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {prefix}
        {grouped}
        {suffix}
      </div>
      {typeof p.sub === "string" && p.sub.length > 0 && (
        <div
          style={{
            marginTop: 10,
            color: "rgba(255,255,255,0.7)",
            fontSize: Math.max(16, Math.round(size * 0.22)),
            fontWeight: 600,
            fontFamily: familyOf(p),
          }}
        >
          {p.sub}
        </div>
      )}
    </div>
  )
}

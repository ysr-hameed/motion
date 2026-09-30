import type { LayerContext } from "./types"
import type { Layer } from "../motion-types"

export function RectLayer({ layer, ctx }: { layer: Layer; ctx: LayerContext }) {
  const p = layer.props ?? {}
  const r = ctx.resolved
  const borderWidth =
    typeof p.borderWidth === "number"
      ? Math.min(20, Math.max(0, p.borderWidth))
      : 0
  return (
    <div
      style={{
        width: p.w ?? 200,
        height: p.h ?? 200,
        backgroundColor: r.color ?? p.color ?? "#ffffff",
        borderRadius: 8,
        border:
          borderWidth > 0
            ? `${borderWidth}px solid ${p.borderColor ?? "#ffffff"}`
            : undefined,
        opacity: r.opacity * ctx.enterT * ctx.exitT,
        transform: `translate(${r.x}px, ${r.y}px) scale(${r.scale * ctx.enterScale}) rotate(${r.rotation}deg)`,
      }}
    />
  )
}

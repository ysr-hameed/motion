import { Img } from "remotion"
import type { LayerContext } from "./types"
import type { Layer } from "../motion-types"

export function ImageLayer({
  layer,
  ctx,
}: {
  layer: Layer
  ctx: LayerContext
}) {
  const p = layer.props ?? {}
  const r = ctx.resolved
  if (!p.src) return null
  const filters: string[] = []
  if (typeof p.grayscale === "number" && p.grayscale > 0)
    filters.push(`grayscale(${Math.min(1, p.grayscale)})`)
  if (typeof p.sepia === "number" && p.sepia > 0)
    filters.push(`sepia(${Math.min(1, p.sepia)})`)
  return (
    <div
      style={{
        opacity: r.opacity * ctx.enterT * ctx.exitT,
        transform: `translate(${r.x}px, ${r.y}px) scale(${r.scale * ctx.enterScale}) rotate(${r.rotation}deg)`,
      }}
    >
      <Img
        src={p.src}
        style={{
          width: p.w ?? 600,
          height: p.h ?? 400,
          objectFit: "cover",
          borderRadius: typeof p.radius === "number" ? p.radius : 0,
          filter: filters.length > 0 ? filters.join(" ") : undefined,
        }}
      />
    </div>
  )
}

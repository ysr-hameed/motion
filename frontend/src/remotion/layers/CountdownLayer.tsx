import { spring } from "remotion"
import type { LayerContext } from "./types"
import { familyOf } from "./types"
import type { Layer } from "../motion-types"

export function CountdownLayer({
  layer,
  ctx,
}: {
  layer: Layer
  ctx: LayerContext
}) {
  const p = layer.props ?? {}
  // `from` is the headline number: count from it down, clamped to the
  // clip length. Falls back to the clip duration when unstated.
  const total =
    typeof p.from === "number"
      ? Math.max(1, Math.round(p.from))
      : typeof p.count === "number"
        ? Math.max(1, Math.round(p.count))
        : Math.max(1, Math.ceil(ctx.durationFrames / ctx.fps))
  const elapsed = Math.floor(ctx.frame / ctx.fps)
  const remaining = Math.max(1, total - elapsed)
  const secFrame = ctx.frame % ctx.fps
  const pop = spring({
    frame: secFrame,
    fps: ctx.fps,
    config: { damping: 11, stiffness: 220 },
  })
  const baseSize = p.size ?? 220
  const size = String(remaining).length > 1 ? Math.round(baseSize * 0.7) : baseSize
  return (
    <div style={{ opacity: ctx.exitT, textAlign: "center" }}>
      <div
        style={{
          color: ctx.resolved.color ?? p.color ?? "#ffffff",
          fontSize: size,
          fontWeight: 800,
          lineHeight: 1,
          fontFamily: familyOf(p),
          fontStyle: p.fontStyle === "italic" ? "italic" : undefined,
          transform: `scale(${pop})`,
        }}
      >
        {remaining}
      </div>
    </div>
  )
}

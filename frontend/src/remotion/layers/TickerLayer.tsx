import type { LayerContext } from "./types"
import { familyOf } from "./types"
import type { Layer } from "../motion-types"

/**
 * Infinite marquee ticker. `duration` = seconds per loop,
 * `direction` picks the travel axis.
 */
export function TickerLayer({
  layer,
  ctx,
}: {
  layer: Layer
  ctx: LayerContext
}) {
  const p = layer.props ?? {}
  const text = `${p.text ?? "SALE"} • `.repeat(6)
  const secs = Math.max(0.5, p.duration ?? 6)
  const t = ((ctx.frame / ctx.fps) % secs) / secs
  const horiz = (p.direction ?? "left") === "left" || (p.direction ?? "left") === "right"
  const sign = (p.direction === "right" || p.direction === "down") ? 1 : -1
  const pct = sign * t * 50
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        opacity: ctx.resolved.opacity * ctx.enterT * ctx.exitT,
      }}
    >
      <div
        style={{
          whiteSpace: "nowrap",
          color: ctx.resolved.color ?? p.color ?? "#ffffff",
          fontSize: p.size ?? 72,
          fontWeight: p.weight ?? 800,
          fontFamily: familyOf(p),
          fontStyle: p.fontStyle === "italic" ? "italic" : undefined,
          textTransform:
            p.textTransform === "uppercase" ||
            p.textTransform === "lowercase" ||
            p.textTransform === "capitalize"
              ? p.textTransform
              : undefined,
          transform: horiz
            ? `translateX(${pct}%)`
            : `translateY(${pct}%)`,
        }}
      >
        {text}
      </div>
    </div>
  )
}

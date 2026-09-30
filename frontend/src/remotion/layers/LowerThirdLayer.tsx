import type { LayerContext } from "./types"
import { familyOf } from "./types"
import type { Layer } from "../motion-types"

export function LowerThirdLayer({
  layer,
  ctx,
}: {
  layer: Layer
  ctx: LayerContext
}) {
  const p = layer.props ?? {}
  const title = p.title ?? "TITLE"
  const accent = ctx.resolved.color ?? p.color ?? "#ffffff"
  const size =
    title.length > 12 ? 44 : title.length > 6 ? 56 : 64
  return (
    <div
      style={{
        position: "absolute",
        left: 64,
        bottom: 96,
        opacity: ctx.resolved.opacity * ctx.enterT * ctx.exitT,
        transform: `translate(${(1 - ctx.enterT) * -480 + ctx.resolved.x}px, ${ctx.resolved.y}px)`,
      }}
    >
      <div
        style={{
          width: 8 + 320 * ctx.enterT,
          height: 10,
          borderRadius: 999,
          backgroundColor: accent,
          marginBottom: 18,
        }}
      />
      <div
        style={{
          color: "#ffffff",
          fontSize: size,
          fontWeight: 800,
          fontFamily: familyOf(p),
          fontStyle: p.fontStyle === "italic" ? "italic" : undefined,
          lineHeight: 1.05,
        }}
      >
        {title}
      </div>
      {typeof p.sub === "string" && p.sub.length > 0 && (
        <div
          style={{
            marginTop: 8,
            color: "rgba(255,255,255,0.72)",
            fontSize: Math.max(15, Math.round(size * 0.42)),
            fontWeight: 600,
            fontFamily: familyOf(p),
            lineHeight: 1.2,
          }}
        >
          {p.sub.slice(0, 80)}
        </div>
      )}
    </div>
  )
}

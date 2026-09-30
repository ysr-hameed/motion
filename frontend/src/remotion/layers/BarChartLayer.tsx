import type { LayerContext } from "./types"
import { familyOf } from "./types"
import type { Layer } from "../motion-types"

/**
 * Animated bar chart. Bars grow with a stagger driven by the enter
 * envelope; the max bar takes the accent color. Labels ride under bars.
 */
export function BarChartLayer({
  layer,
  ctx,
}: {
  layer: Layer
  ctx: LayerContext
}) {
  const p = layer.props ?? {}
  const values = (
    Array.isArray(p.values) ? p.values : [40, 65, 52, 80]
  ).slice(0, 12)
  while (values.length < 2) values.push(50)
  const labels = Array.isArray(p.labels) ? p.labels : []
  const w = p.w ?? 640
  const h = p.h ?? 360
  const color = ctx.resolved.color ?? p.color ?? "#ffffff"
  const accent = p.accent ?? "#00E5FF"
  const max = Math.max(1, ...values)
  const gap = 14
  const bw = Math.max(8, (w - gap * (values.length - 1)) / values.length)
  const labelH = 26

  return (
    <div
      style={{
        width: w,
        opacity: ctx.resolved.opacity * ctx.enterT * ctx.exitT,
        transform: `translate(${ctx.resolved.x}px, ${ctx.resolved.y}px) scale(${ctx.resolved.scale * ctx.enterScale})`,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-end", gap, height: h }}>
        {values.map((v, i) => {
          const grow = Math.max(
            0,
            Math.min(1, ctx.enterT * 1.8 - i * 0.12)
          )
          const bh = Math.max(4, (Math.max(0, v) / max) * (h - labelH) * grow)
          const isMax = v === max
          return (
            <div
              key={i}
              style={{
                width: bw,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  color: isMax ? accent : "rgba(255,255,255,0.75)",
                  fontSize: 20,
                  fontWeight: 800,
                  fontFamily: familyOf(p),
                  opacity: grow,
                }}
              >
                {v}
              </span>
              <div
                style={{
                  width: "100%",
                  height: bh,
                  borderRadius: 8,
                  backgroundColor: isMax ? accent : color,
                  opacity: 0.35 + 0.65 * grow,
                }}
              />
              <span
                style={{
                  height: labelH,
                  color: "rgba(255,255,255,0.65)",
                  fontSize: 15,
                  fontWeight: 600,
                  fontFamily: familyOf(p),
                  whiteSpace: "nowrap",
                }}
              >
                {labels[i] ?? ""}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

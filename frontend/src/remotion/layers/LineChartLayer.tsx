import type { LayerContext } from "./types"
import { familyOf } from "./types"
import type { Layer } from "../motion-types"

/**
 * Animated line chart. The stroke draws itself in via the enter envelope
 * (pathLength trick), the area fills beneath, dots pop per point.
 */
export function LineChartLayer({
  layer,
  ctx,
}: {
  layer: Layer
  ctx: LayerContext
}) {
  const p = layer.props ?? {}
  const values = (
    Array.isArray(p.values) ? p.values : [20, 45, 38, 70, 62, 90]
  ).slice(0, 12)
  while (values.length < 2) values.push(50)
  const labels = Array.isArray(p.labels) ? p.labels : []
  const w = p.w ?? 640
  const h = p.h ?? 360
  const color = ctx.resolved.color ?? p.color ?? "#00E5FF"
  const thickness = p.thickness ?? 6
  const pad = 12
  const max = Math.max(1, ...values)
  const min = Math.min(0, ...values)
  const span = Math.max(1, max - min)
  const pts = values.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(1, values.length - 1)
    const y = pad + (1 - (v - min) / span) * (h - pad * 2 - 30)
    return { x, y, v }
  })
  const line = pts.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x},${pt.y}`).join(" ")
  const area = `${line} L${pts[pts.length - 1]!.x},${h} L${pts[0]!.x},${h} Z`
  const draw = Math.max(0, Math.min(1, ctx.enterT * 1.4))

  return (
    <div
      style={{
        width: w,
        opacity: ctx.resolved.opacity * ctx.enterT * ctx.exitT,
        transform: `translate(${ctx.resolved.x}px, ${ctx.resolved.y}px) scale(${ctx.resolved.scale * ctx.enterScale})`,
      }}
    >
      <svg width={w} height={h} style={{ overflow: "visible" }}>
        <path d={area} fill={color} opacity={0.14 * draw} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100 * (1 - draw)}
        />
        {pts.map((pt, i) => {
          const pop = Math.max(0, Math.min(1, draw * values.length - i))
          if (pop <= 0) return null
          return (
            <g key={i} opacity={pop}>
              <circle cx={pt.x} cy={pt.y} r={7} fill={color} />
              <circle cx={pt.x} cy={pt.y} r={3.5} fill="#0a0a12" />
              {labels[i] && (
                <text
                  x={pt.x}
                  y={h - 6}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.65)"
                  fontSize={15}
                  fontWeight={600}
                  fontFamily={familyOf(p)}
                >
                  {labels[i]}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

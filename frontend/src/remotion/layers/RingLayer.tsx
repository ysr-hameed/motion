import type { LayerContext } from "./types"
import type { Layer } from "../motion-types"

/**
 * Progress ring. `progress` is the static fill 0..1; the whole ring
 * slowly rotates. Keyframe `progress` for animated fills.
 */
export function RingLayer({ layer, ctx }: { layer: Layer; ctx: LayerContext }) {
  const p = layer.props ?? {}
  const size = p.size ?? 200
  const thickness = p.thickness ?? 14
  const progress = p.progress ?? 0.75
  const color = ctx.resolved.color ?? p.color ?? "#ffffff"
  const r = (size - thickness) / 2
  const circ = 2 * Math.PI * r
  const rot = (ctx.frame / ctx.fps) * 30 * (ctx.resolved.rotation ? 0 : 1) + ctx.resolved.rotation
  return (
    <div
      style={{
        opacity: ctx.resolved.opacity * ctx.enterT * ctx.exitT,
        transform: `translate(${ctx.resolved.x}px, ${ctx.resolved.y}px) scale(${ctx.resolved.scale * ctx.enterScale})`,
      }}
    >
      <svg width={size} height={size} style={{ transform: `rotate(${rot}deg)` }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${circ * Math.min(1, Math.max(0, progress))} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
    </div>
  )
}

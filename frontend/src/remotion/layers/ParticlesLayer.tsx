import type { LayerContext } from "./types"
import type { Layer } from "../motion-types"

const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

export function ParticlesLayer({
  layer,
  ctx,
}: {
  layer: Layer
  ctx: LayerContext
}) {
  const p = layer.props ?? {}
  const count = Math.min(60, Math.max(1, Math.round(p.count ?? 20)))
  const size = 8
  const speed = 0.4
  const color = ctx.resolved.color ?? p.color ?? "#ffffff"
  const dots = Array.from({ length: count }, (_, i) => {
    const x = rand(i * 3.7) * 100
    const s = size * (0.5 + rand(i * 9.1))
    const y = ((rand(i * 7.9) * 130 - ctx.frame * speed) % 130 + 130) % 130
    return { x, y, s, o: 0.25 + rand(i * 1.7) * 0.55 }
  })
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: ctx.resolved.opacity * ctx.enterT * ctx.exitT,
      }}
    >
      {dots.map((d, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${d.x}%`,
            top: `${d.y}%`,
            width: d.s,
            height: d.s,
            borderRadius: 999,
            backgroundColor: color,
            opacity: d.o,
          }}
        />
      ))}
    </div>
  )
}

import type { LayerContext } from "./types"
import { familyOf } from "./types"
import type { Layer } from "../motion-types"

function FxText({
  text,
  frame,
  fx,
  fxSpeed,
}: {
  text: string
  frame: number
  fx: string
  fxSpeed: number
}) {
  if (fx === "typewriter") {
    const chars = Math.min(text.length, Math.floor(frame * fxSpeed) + 1)
    return (
      <>
        {text.slice(0, chars)}
        <span style={{ opacity: 0.6 + 0.4 * Math.sin(frame * 0.4) }}>|</span>
      </>
    )
  }
  if (fx === "wave") {
    return (
      <>
        {text.split("").map((ch, i) => (
          <span
            key={i}
            style={{
              display: "inline-block",
              transform: `translateY(${Math.sin(frame * 0.25 * fxSpeed + i * 0.6) * 10}px)`,
            }}
          >
            {ch === " " ? "\u00A0" : ch}
          </span>
        ))}
      </>
    )
  }
  if (fx === "glitch") {
    const tick = Math.floor(frame / 3)
    const dx = ((((tick * 7919) % 100) / 100) - 0.5) * 14
    return (
      <span style={{ position: "relative", display: "inline-block" }}>
        <span style={{ position: "relative" }}>{text}</span>
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            color: "#22d3ee",
            opacity: 0.7,
            transform: `translate(${dx}px, 0)`,
            clipPath: "inset(10% 0 55% 0)",
          }}
        >
          {text}
        </span>
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            color: "#f87171",
            opacity: 0.7,
            transform: `translate(${-dx}px, 0)`,
            clipPath: "inset(60% 0 10% 0)",
          }}
        >
          {text}
        </span>
      </span>
    )
  }
  return <>{text}</>
}

export function TextLayer({ layer, ctx }: { layer: Layer; ctx: LayerContext }) {
  const p = layer.props ?? {}
  const r = ctx.resolved
  const text = p.text ?? "TEXT"
  const baseSize = p.size ?? 120
  const size =
    text.length > 12
      ? Math.round(baseSize * 0.6)
      : text.length > 6
        ? Math.round(baseSize * 0.8)
        : baseSize
  const color = r.color ?? p.color ?? "#ffffff"
  const fx = p.fx ?? "none"
  const weight = Math.min(900, Math.max(100, p.weight ?? 800))
  const strokeWidth =
    typeof p.strokeWidth === "number"
      ? Math.min(8, Math.max(0, p.strokeWidth))
      : p.stroke
        ? 2
        : 0
  const shadowBlur =
    typeof p.shadowBlur === "number"
      ? Math.min(60, Math.max(0, p.shadowBlur))
      : p.shadow
        ? 32
        : 0
  const shadowY =
    typeof p.shadowOffsetY === "number"
      ? Math.min(40, Math.max(-40, p.shadowOffsetY))
      : 6
  const style: React.CSSProperties = {
    color,
    fontSize: size,
    fontWeight: weight,
    lineHeight:
      typeof p.lineHeight === "number"
        ? Math.min(2, Math.max(0.8, p.lineHeight))
        : 1.05,
    fontFamily: familyOf(p),
    fontStyle: p.fontStyle === "italic" ? "italic" : undefined,
    letterSpacing: p.letterSpacing ?? 0,
  }
  if (
    p.textTransform === "uppercase" ||
    p.textTransform === "lowercase" ||
    p.textTransform === "capitalize"
  )
    style.textTransform = p.textTransform
  if (p.stroke && strokeWidth > 0)
    (style as Record<string, string>).WebkitTextStroke =
      `${strokeWidth}px ${p.stroke}`
  if (p.shadow && shadowBlur > 0)
    style.textShadow = `0 ${shadowY}px ${shadowBlur}px ${p.shadow}`
  return (
    <div
      style={{
        opacity: r.opacity * ctx.enterT * ctx.exitT,
        transform: `translate(${r.x}px, ${r.y}px) scale(${r.scale * ctx.enterScale * (fx === "pop" ? 1 + Math.max(0, 1 - ctx.frame / 12) * 0.25 : 1)}) rotate(${r.rotation}deg)`,
        textAlign: p.align ?? "center",
      }}
    >
      <div style={style}>
        {fx === "none" || fx === "pop" ? (
          text
        ) : (
          <FxText
            text={text}
            frame={ctx.frame}
            fx={fx}
            fxSpeed={p.fxSpeed ?? 1}
          />
        )}
      </div>
    </div>
  )
}

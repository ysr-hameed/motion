import { createElement } from "react"
import * as Lucide from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { LayerContext } from "./types"
import type { Layer } from "../motion-types"

/**
 * IconLayer — Lucide glyphs, not hardcoded SVGs.
 * Backend coerces `props.name` to a kebab-case lucide name; any valid
 * lucide icon works (search, cursor, shopping-cart, chevron-down…).
 * Unknown names fall back to Search — never a blank frame.
 */

const REGISTRY: Record<string, LucideIcon> = {
  search: Lucide.Search,
  cursor: Lucide.MousePointer2,
  pointer: Lucide.MousePointer,
  close: Lucide.X,
  menu: Lucide.Menu,
  play: Lucide.Play,
  pause: Lucide.Pause,
  heart: Lucide.Heart,
  star: Lucide.Star,
  bell: Lucide.Bell,
  check: Lucide.Check,
  "arrow-right": Lucide.ArrowRight,
  plus: Lucide.Plus,
  home: Lucide.Home,
  user: Lucide.User,
  send: Lucide.Send,
}

function kebabToPascal(name: string): string {
  return name
    .split("-")
    .map((s) => (s ? s[0]!.toUpperCase() + s.slice(1) : ""))
    .join("")
}

function resolveIcon(name: string): LucideIcon {
  const direct = REGISTRY[name]
  if (direct) return direct
  // Any lucide icon: "shopping-cart" -> ShoppingCart, "chevron-down" -> ChevronDown
  const pascal = kebabToPascal(name)
  const candidate = (Lucide as unknown as Record<string, unknown>)[pascal]
  if (typeof candidate === "function") return candidate as LucideIcon
  return Lucide.Search
}

export function IconLayer({ layer, ctx }: { layer: Layer; ctx: LayerContext }) {
  const p = layer.props ?? {}
  const r = ctx.resolved
  const raw = typeof p.name === "string" ? p.name.trim().toLowerCase() : "search"
  const Icon = resolveIcon(raw || "search")
  const size = typeof p.size === "number" ? Math.min(500, Math.max(8, p.size)) : 96
  const color = r.color ?? p.color ?? "#ffffff"
  return (
    <div
      style={{
        opacity: r.opacity * ctx.enterT * ctx.exitT,
        transform: `translate(${r.x}px, ${r.y}px) scale(${(r.scale ?? 1) * ctx.enterScale}) rotate(${r.rotation ?? 0}deg)`,
        color,
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* createElement, not <Icon />: the glyph is resolved from a registry
          at render time, and JSX would read as "component created during
          render". The registry entries are module constants, so identity is
          stable across frames either way. */}
      {createElement(Icon, { size, color, strokeWidth: 2 })}
    </div>
  )
}

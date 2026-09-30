const SEEN = new Set<string>()
const FONT_RE = /^[A-Za-z0-9 ]{1,40}$/

function houseFonts(): Set<string> {
  return new Set(["Unbounded", "Space Grotesk"])
}

/** Families a doc actually needs from Google Fonts (house stacks excluded). */
export function docFontFamilies(doc: {
  layers?: Array<{ props?: { fontFamily?: unknown } }>
}): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const house = houseFonts()
  for (const l of doc.layers ?? []) {
    const f = l.props?.fontFamily
    if (
      typeof f === "string" &&
      FONT_RE.test(f.trim()) &&
      !house.has(f.trim()) &&
      !seen.has(f.trim())
    ) {
      seen.add(f.trim())
      out.push(f.trim())
    }
  }
  return out
}

/**
 * Injects one Google Fonts stylesheet for the families a doc uses.
 * Idempotent per family for the session; falls back silently offline.
 */
export function ensureDocFonts(doc: {
  layers?: Array<{ props?: { fontFamily?: unknown } }>
}): void {
  if (typeof document === "undefined") return
  const fresh = docFontFamilies(doc).filter((f) => !SEEN.has(f))
  if (fresh.length === 0) return
  fresh.forEach((f) => SEEN.add(f))
  const href =
    "https://fonts.googleapis.com/css2?" +
    fresh.map((f) => `family=${f.replace(/ /g, "+")}:wght@400;700;800;900`).join("&") +
    "&display=swap"
  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = href
  link.dataset.motionFonts = fresh.join(",")
  document.head.appendChild(link)
}

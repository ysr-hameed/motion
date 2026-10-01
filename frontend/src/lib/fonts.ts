const SEEN = new Set<string>()
const FONT_RE = /^[A-Za-z0-9 ]{1,40}$/

/**
 * Faces that never need a Google stylesheet. Space Grotesk ships inside
 * the app bundle (Fontsource), so only it is excluded — every other
 * family, including the legacy display default Unbounded, loads from
 * Google Fonts on demand. (Unbounded used to be excluded here too, on
 * the assumption the UI bundle provided it. It no longer does, so every
 * legacy layer silently fell back to a system font.)
 */
function houseFonts(): Set<string> {
  return new Set(["Space Grotesk"])
}

export interface DocLayer {
  props?: { fontFamily?: unknown; font?: unknown }
}

/**
 * Families a legacy doc actually needs from Google Fonts. Mirrors
 * `familyOf` in remotion/layers: an explicit fontFamily wins, otherwise
 * body layers use the self-hosted stack and everything else defaults to
 * the Unbounded display face.
 */
export function docFontFamilies(doc: { layers?: DocLayer[] }): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const house = houseFonts()
  for (const l of doc.layers ?? []) {
    const custom =
      typeof l.props?.fontFamily === "string" ? l.props.fontFamily.trim() : ""
    let family: string | null = null
    if (FONT_RE.test(custom)) {
      family = custom
    } else if (l.props?.font !== "body") {
      family = "Unbounded"
    }
    if (family && !house.has(family) && !seen.has(family)) {
      seen.add(family)
      out.push(family)
    }
  }
  return out
}

/**
 * Injects one Google Fonts stylesheet for the families a doc uses.
 * Idempotent per family for the session; falls back silently offline.
 * Also kicks off the actual face load so canvas/export paths that don't
 * wait on layout still get the glyphs.
 */
export function ensureDocFonts(doc: { layers?: DocLayer[] }): void {
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
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
  if (fonts) {
    for (const f of fresh) {
      fonts.load(`16px "${f}"`).catch(() => undefined)
      fonts.load(`800 16px "${f}"`).catch(() => undefined)
    }
  }
}

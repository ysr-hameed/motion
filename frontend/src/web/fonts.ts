/**
 * Font resolution for web bundles — no bundler imports.
 *
 * The old Remotion pipeline pre-built 23 Google Fonts faces behind dynamic
 * imports. The web engine loads stylesheets directly from the Google Fonts
 * CSS API instead: any family the bundle cites (or names in meta.fonts)
 * gets a <link>, verified with document.fonts.check inside the iframe.
 */

export const DISPLAY_FACES = [
  "Anton", "Bebas Neue", "Archivo Black", "Syne", "Unbounded",
  "Bricolage Grotesque", "Fraunces", "Instrument Serif", "Bodoni Moda",
  "Dancing Script", "Caveat", "Pacifico", "Great Vibes", "Satisfy",
  "Shadows Into Light",
] as const

export const TEXT_FACES = [
  "Karla", "Archivo", "Manrope", "Outfit", "Space Grotesk", "Space Mono", "Chivo",
] as const

export function cssUrl(family: string): string {
  return `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@400;700;900&display=swap`
}

export function fontLinks(families: string[]): string[] {
  return [...new Set(families)].slice(0, 12).map(cssUrl)
}

/** One line per face for the agent prompt. */
export function faceLine(): string {
  return [`display: ${DISPLAY_FACES.join(", ")}`, `text/UI: ${TEXT_FACES.join(", ")}`].join("\n")
}

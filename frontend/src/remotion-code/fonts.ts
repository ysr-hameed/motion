
/**
 * The type palette.
 *
 * The AI is told never to reach for Inter, Roboto or a bare sans-serif
 * stack — those are what a page uses when nobody chose. But a composition
 * runs in a browser and in a Web Worker, neither of which can resolve a
 * bare `import "@remotion/google-fonts/X"` that a bundler never saw. So
 * the faces are set up here, once, and handed to a composition as ready
 * family names.
 *
 * WHY `getInfo()` AND NOT `loadFont()`
 *
 * `loadFont()` embeds the woff2 as a base64 data URL. That is the right
 * call for a Node render — it is self-contained and deterministic — but it
 * costs 268 KB per family. Preloading 23 of them put 3.5 MB in the client
 * bundle, which is not a trade anyone should make for nicer type.
 *
 * `getInfo()` hands back the Google Fonts stylesheet URL, which is a few
 * hundred bytes. Injecting that one `<link>` costs nothing to ship, the
 * browser caches and reuses it, and the family resolves by name exactly as
 * a web page's does. The trade is that the first paint of a face waits on
 * the network — which is why `ensureFontsLoaded` below holds the render
 * open until the faces the composition actually asked for are ready.
 *
 * A deliberately shortlist rather than all 1,500 Google Fonts: a curated
 * set a director chooses from produces better pairings than a menu, and
 * every extra face is a request.
 */
export interface Face {
  /** The CSS family name to put in `fontFamily`. */
  family: string
  role: "display" | "editorial" | "geometric" | "neutral" | "mono" | "character"
  note: string
  /** Google Fonts stylesheet URL, once loaded. */
  href: string
}

/**
 * One loader per face, each behind a dynamic import.
 *
 * The full `getInfo()` set is 348 KB — real, but not something to ship to
 * every visitor for a cut that might cite two faces. Loading per family
 * means a composition that says `Fonts.anton.family` fetches Anton and
 * nothing else, and the chunk is cached after the first cut.
 */
const LOADERS: Record<string, () => Promise<{ fontFamily: string; url: string }>> = {
  anton: () => import("@remotion/google-fonts/Anton").then((m) => m.getInfo()),
  bebasNeue: () => import("@remotion/google-fonts/BebasNeue").then((m) => m.getInfo()),
  archivoBlack: () => import("@remotion/google-fonts/ArchivoBlack").then((m) => m.getInfo()),
  syne: () => import("@remotion/google-fonts/Syne").then((m) => m.getInfo()),
  unbounded: () => import("@remotion/google-fonts/Unbounded").then((m) => m.getInfo()),
  bricolage: () => import("@remotion/google-fonts/BricolageGrotesque").then((m) => m.getInfo()),
  fraunces: () => import("@remotion/google-fonts/Fraunces").then((m) => m.getInfo()),
  instrumentSerif: () => import("@remotion/google-fonts/InstrumentSerif").then((m) => m.getInfo()),
  bodoni: () => import("@remotion/google-fonts/BodoniModa").then((m) => m.getInfo()),
  newsreader: () => import("@remotion/google-fonts/Newsreader").then((m) => m.getInfo()),
  crimson: () => import("@remotion/google-fonts/CrimsonPro").then((m) => m.getInfo()),
  spectral: () => import("@remotion/google-fonts/Spectral").then((m) => m.getInfo()),
  spaceGrotesk: () => import("@remotion/google-fonts/SpaceGrotesk").then((m) => m.getInfo()),
  chivo: () => import("@remotion/google-fonts/Chivo").then((m) => m.getInfo()),
  archivo: () => import("@remotion/google-fonts/Archivo").then((m) => m.getInfo()),
  manrope: () => import("@remotion/google-fonts/Manrope").then((m) => m.getInfo()),
  outfit: () => import("@remotion/google-fonts/Outfit").then((m) => m.getInfo()),
  epilogue: () => import("@remotion/google-fonts/Epilogue").then((m) => m.getInfo()),
  publicSans: () => import("@remotion/google-fonts/PublicSans").then((m) => m.getInfo()),
  karla: () => import("@remotion/google-fonts/Karla").then((m) => m.getInfo()),
  spaceMono: () => import("@remotion/google-fonts/SpaceMono").then((m) => m.getInfo()),
  bungee: () => import("@remotion/google-fonts/Bungee").then((m) => m.getInfo()),
  righteous: () => import("@remotion/google-fonts/Righteous").then((m) => m.getInfo()),
}

/** Static metadata — no network, no import. Drives the prompt catalogue. */
const CATALOGUE: Record<string, { role: Face["role"]; note: string }> = {
  anton: { role: "display", note: "Heavy condensed sans. Unmissable, slightly brutal." },
  bebasNeue: { role: "display", note: "Tall condensed caps. Posters, sport, retail." },
  archivoBlack: { role: "display", note: "Grotesque black. Confident and modern." },
  syne: { role: "display", note: "Wide, characterful. Fashion and editorial." },
  unbounded: { role: "display", note: "Geometric and strange. Tech with a voice." },
  bricolage: { role: "display", note: "Variable grotesque with quirks. Modern default." },
  fraunces: { role: "display", note: "Soft-serif with optical sizing. Warm and premium." },
  instrumentSerif: { role: "display", note: "High-contrast serif. Elegant, editorial." },
  bodoni: { role: "display", note: "Didone. Fashion, luxury, high contrast." },
  newsreader: { role: "editorial", note: "Readable serif with real personality." },
  crimson: { role: "editorial", note: "Classic text serif. Long-form warmth." },
  spectral: { role: "editorial", note: "Screen-first serif with sharp detail." },
  spaceGrotesk: { role: "geometric", note: "Technical grotesque. Data and product." },
  chivo: { role: "geometric", note: "Grotesque with tight rhythm. UI with character." },
  archivo: { role: "geometric", note: "Workhorse grotesque. Clean and modern." },
  manrope: { role: "geometric", note: "Semi-geometric, friendly. Product and SaaS." },
  outfit: { role: "neutral", note: "Simple geometric. Quiet background type." },
  epilogue: { role: "neutral", note: "Humanist sans. Comfortable at length." },
  publicSans: { role: "neutral", note: "Neutral, unremarkable — and that is the point." },
  karla: { role: "neutral", note: "Grotesque with quirky details. Body and labels." },
  spaceMono: { role: "mono", note: "Distinctive mono. Timestamps and telemetry." },
  bungee: { role: "character", note: "Piled block letters. Loud, playful, street." },
  righteous: { role: "character", note: "Rounded geometric. Friendly and retro." },
}

const resolved = new Map<string, Face>()

/** Generic stacks that never need loading. */
const GENERIC = new Set([
  "sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui",
  "ui-sans-serif", "ui-serif", "ui-monospace", "ui-rounded", "math",
  "sans", "fangsong", "inherit", "initial", "unset",
])

/**
 * Google family name (lowercased) → catalogue key. Resolves literal
 * `fontFamily: '"Unbounded", system-ui, sans-serif'` stacks that never
 * mention the Fonts.* registry.
 */
const FAMILY_TO_KEY: Record<string, string> = {
  anton: "anton",
  "bebas neue": "bebasNeue",
  "archivo black": "archivoBlack",
  syne: "syne",
  unbounded: "unbounded",
  "bricolage grotesque": "bricolage",
  fraunces: "fraunces",
  "instrument serif": "instrumentSerif",
  "bodoni moda": "bodoni",
  newsreader: "newsreader",
  "crimson pro": "crimson",
  spectral: "spectral",
  "space grotesk": "spaceGrotesk",
  chivo: "chivo",
  archivo: "archivo",
  manrope: "manrope",
  outfit: "outfit",
  epilogue: "epilogue",
  "public sans": "publicSans",
  karla: "karla",
  "space mono": "spaceMono",
  bungee: "bungee",
  righteous: "righteous",
}

function makeFace(name: string, role: Face["role"], note: string): Face {
  return { family: name, role, note, href: "" }
}

/** `Fonts.anton.family` and friends, populated as faces load. */
export const FONTS: Record<string, Face> = {}
for (const [key, meta] of Object.entries(CATALOGUE)) {
  // Placeholder: the real family name arrives with the loader. It matches
  // the key for every family Remotion exposes, and is corrected on load.
  FONTS[key] = makeFace(key, meta.role, meta.note)
}

/** Loads the faces a source cites and registers them under `FONTS`. */
export async function loadFontsFor(source: string): Promise<string[]> {
  const keys = new Set<string>()
  for (const m of source.matchAll(/Fonts\.(\w+)\.family/g)) {
    if (CATALOGUE[m[1]!]) keys.add(m[1]!)
  }
  if (keys.size === 0) return []
  const wanted = [...keys]
  await Promise.all(
    wanted.map(async (key) => {
      try {
        const info = await LOADERS[key]!()
        FONTS[key] = { family: info.fontFamily, role: CATALOGUE[key]!.role, note: CATALOGUE[key]!.note, href: info.url }
        resolved.set(info.fontFamily, FONTS[key]!)
      } catch {
        // Leave the placeholder. The composition still renders, in a
        // fallback face, rather than failing to mount at all.
      }
    })
  )
  return wanted.map((k) => FONTS[k]!.family)
}

const injected = new Set<string>()

function hasDocument(): boolean {
  return typeof document !== "undefined" && !!document.head
}

/** Adds one Google Fonts stylesheet to the document, once per family. */
function inject(f: Face): void {
  if (!f.href || !hasDocument() || injected.has(f.href)) return
  injected.add(f.href)
  const pre = document.createElement("link")
  pre.rel = "preconnect"
  pre.href = "https://fonts.gstatic.com"
  pre.crossOrigin = "anonymous"
  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = f.href
  document.head.append(pre, link)
}

/**
 * Makes sure every face a composition referenced is loaded before the
 * first frame is captured.
 *
 * A cut that uses two faces costs two requests rather than twenty-three.
 * Unknown family names are ignored — they may be system fonts, and waiting
 * on a stylesheet that was never linked would hang the render.
 */
export async function ensureFontsLoaded(source: string): Promise<void> {
  await loadFontsFor(source)

  const families = new Set<string>()
  for (const m of source.matchAll(/Fonts\.(\w+)\.family/g)) {
    if (CATALOGUE[m[1]!]) families.add(FONTS[m[1]!]!.family)
  }
  // Literal stacks — `fontFamily: '"Unbounded", system-ui, sans-serif'`.
  // These never mention the registry, so the old code skipped them and
  // the composition silently rendered in a fallback face. Each known
  // family is loaded on demand exactly like a registry reference.
  for (const m of source.matchAll(/fontFamily:\s*["'`]([^"'`]+)["'`]/g)) {
    for (const raw of m[1]!.split(",")) {
      const name = raw.trim().replace(/^['"]+|['"]+$/g, "")
      if (!name || GENERIC.has(name.toLowerCase())) continue
      if (resolved.has(name)) {
        families.add(name)
        continue
      }
      // Self-hosted UI face — no stylesheet needed, just await it below.
      if (name === "Space Grotesk") {
        families.add(name)
        continue
      }
      const key = FAMILY_TO_KEY[name.toLowerCase()]
      if (key && LOADERS[key] && CATALOGUE[key]) {
        try {
          const info = await LOADERS[key]!()
          FONTS[key] = {
            family: info.fontFamily,
            role: CATALOGUE[key]!.role,
            note: CATALOGUE[key]!.note,
            href: info.url,
          }
          resolved.set(info.fontFamily, FONTS[key]!)
          families.add(info.fontFamily)
        } catch {
          // Leave it out — the composition renders in a fallback face
          // rather than failing to mount at all.
        }
      }
    }
  }
  if (families.size === 0) return

  for (const family of families) {
    const f = resolved.get(family)
    if (f) inject(f)
  }

  const doc = hasDocument() ? (document as Document & { fonts?: FontFaceSet }) : null
  if (!doc?.fonts) return
  await Promise.all(
    [...families].map((family) =>
      doc!.fonts!.load(`16px "${family}"`).catch(() => undefined)
    )
  )
}

/** The catalogue, as prompt text. Drives which face the model reaches for. */
export function fontCatalogue(): string {
  return Object.entries(CATALOGUE)
    .map(([key, meta]) => `- Fonts.${key}.family — ${meta.role} — ${meta.note}`)
    .join("\n")
}

/** Every key the catalogue offers. */
export function fontNames(): string[] {
  return Object.keys(CATALOGUE)
}

/**
 * Phase 1 asset helpers (IMPLEMENTATION_PLAN.md §2.1).
 *
 * Deterministic and key-free: no Unsplash/Pexels secret is required to return
 * something useful. Live CDN search is a Phase 4 upgrade; until then these
 * return curated source URLs + the exact guidance the model needs to use them
 * (staticFile vs remote URL, sizing, attribution), so a turn never stalls on
 * a missing integration.
 */

export interface AssetSuggestion {
  url: string
  label: string
  attribution: string
  note: string
}

const CURATED: Record<string, AssetSuggestion[]> = {
  image: [
    {
      url: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1920&q=80&auto=format&fit=crop",
      label: "Tech workspace — dark, product-friendly",
      attribution: "Unsplash (check photo page for author)",
      note: "1920px wide; use Img with crossOrigin for canvas use.",
    },
    {
      url: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1920&q=80&auto=format&fit=crop",
      label: "Neon gradient — energetic background",
      attribution: "Unsplash (check photo page for author)",
      note: "Works as a full-bleed AbsoluteFill background at 0.25 opacity.",
    },
  ],
  video: [
    {
      url: "https://cdn.coverr.co/videos/coverr-abstract-gradient-5241/1080p.mp4",
      label: "Abstract gradient loop (Coverr)",
      attribution: "Coverr — free for commercial use, link appreciated",
      note: "Loop with <Loop>; trim client-side with start/end frames, not re-encode.",
    },
  ],
  audio: [
    {
      url: "https://cdn.pixabay.com/audio/2022-10-25-22-07-05-110_everlasting-124bpm.mp3",
      label: "Upbeat electronic bed (placeholder — replace with licensed track)",
      attribution: "Placeholder only — license before publishing",
      note: "Verify duration ≥ cut length; add 15-frame fade-out at end.",
    },
  ],
}

export function suggestAssets(
  query: string,
  type: "image" | "video" | "audio" = "image"
): { query: string; results: AssetSuggestion[]; warning: string } {
  const q = query.trim().toLowerCase() || "background"
  const results = (CURATED[type] ?? CURATED.image).map((r) => ({
    ...r,
    note: `${r.note} Matched for "${q}" from the offline catalogue — swap in a licensed ${type} before export.`,
  }))
  return {
    query: q,
    results,
    warning:
      "Offline catalogue (no CDN key configured). These are composition-safe placeholders; " +
      "run asset_optimize + confirm licensing before cdn_publish.",
  }
}

export function optimizeAsset(
  url: string,
  format: "webp" | "avif" | "mp4" | "original" = "webp",
  quality = 80
): { original: string; optimized: string; guidance: string } {
  const q = Math.min(100, Math.max(10, Math.round(quality)))
  let optimized = url
  try {
    const u = new URL(url)
    if (u.hostname.includes("images.unsplash.com")) {
      u.searchParams.set("w", "1920")
      u.searchParams.set("q", String(q))
      u.searchParams.set("auto", "format")
      u.searchParams.set("fit", "crop")
      if (format === "webp" || format === "avif") u.searchParams.set("fm", format)
      optimized = u.toString()
    }
  } catch {
    // Relative or staticFile() path — nothing to rewrite, keep as-is.
  }
  return {
    original: url,
    optimized,
    guidance:
      `Quality ${q}, target 1920px wide for a 1080p canvas. ` +
      `Remote images need crossOrigin="anonymous" on Img; prefer R2 staticFile() for export. ` +
      `If the source is under 1080p, upscale will soften — use vector/logo art instead.`,
  }
}

const MOOD_FONTS: Record<string, { display: string; text: string; css: string }> = {
  modern: {
    display: "unbounded",
    text: "manrope",
    css: "fontFamily: Fonts.unbounded.family (hero) + Fonts.manrope.family (body)",
  },
  playful: {
    display: "bricolage",
    text: "karla",
    css: "fontFamily: Fonts.bricolage.family (hero) + Fonts.karla.family (body)",
  },
  elegant: {
    display: "instrumentSerif",
    text: "newsreader",
    css: "fontFamily: Fonts.instrumentSerif.family (hero) + Fonts.newsreader.family (body)",
  },
  bold: {
    display: "anton",
    text: "archivo",
    css: "fontFamily: Fonts.anton.family (hero) + Fonts.archivo.family (body)",
  },
  tech: {
    display: "spaceGrotesk",
    text: "spaceMono",
    css: "fontFamily: Fonts.spaceGrotesk.family (hero) + Fonts.spaceMono.family (labels)",
  },
}

/**
 * Ground truth for any font/style name the user or brief mentions.
 *
 * Keys resolve against the curated registry first (exact key, CSS family
 * name, or lowercase), then style words (handwritten → caveat family of
 * choices), then the CamelCase rule the player itself applies
 * (playfairDisplay → "Playfair Display", loaded on demand). Anything left
 * is reported unknown with the closest curated fallback — never a guess
 * the render cannot honour.
 */
export function resolveFont(name: string): {
  ok: boolean
  key: string | null
  snippet: string | null
  curated: boolean
  note: string
} {
  const raw = name.trim()
  const lower = raw.toLowerCase().replace(/[_-]+/g, " ")
  const nospace = lower.replace(/\s+/g, "")
  const curatedKeys = [
    "anton", "bebasNeue", "archivoBlack", "syne", "unbounded", "bricolage",
    "fraunces", "instrumentSerif", "bodoni", "newsreader", "crimson", "spectral",
    "spaceGrotesk", "chivo", "archivo", "manrope", "outfit", "epilogue",
    "publicSans", "karla", "spaceMono", "bungee", "righteous",
    "dancingScript", "caveat", "pacifico", "greatVibes", "satisfy", "shadowsIntoLight",
  ]
  const familyNames: Record<string, string> = {
    anton: "Anton", bebasneue: "Bebas Neue", archoblack: "Archivo Black",
    syne: "Syne", unbounded: "Unbounded", bricolage: "Bricolage Grotesque",
    "bricolagegrotesque": "Bricolage Grotesque", fraunces: "Fraunces",
    instrumentserif: "Instrument Serif", bodoni: "Bodoni Moda",
    bodonimoda: "Bodoni Moda", newsreader: "Newsreader", crimson: "Crimson Pro",
    crimsonpro: "Crimson Pro", spectral: "Spectral", spacegrotesk: "Space Grotesk",
    chivo: "Chivo", archivo: "Archivo", manrope: "Manrope", outfit: "Outfit",
    epilogue: "Epilogue", publicsans: "Public Sans", karla: "Karla",
    spacemono: "Space Mono", bungee: "Bungee", righteous: "Righteous",
    dancingscript: "Dancing Script", caveat: "Caveat", pacifico: "Pacifico",
    greatvibes: "Great Vibes", satisfy: "Satisfy", shadowsintolight: "Shadows Into Light",
  }
  const direct =
    curatedKeys.find((k) => k === raw || k.toLowerCase() === nospace) ??
    curatedKeys.find((k) => (familyNames[k.toLowerCase()] ?? "").toLowerCase() === lower)
  if (direct) {
    return {
      ok: true,
      key: direct,
      snippet: `fontFamily: Fonts.${direct}.family`,
      curated: true,
      note: `${familyNames[direct.toLowerCase()] ?? direct} is curated — preloaded, zero risk.`,
    }
  }
  const styleMap: Array<[RegExp, string]> = [
    [/hand|script|cursive|marker|signatur|wedding|romantic|love|formal.*script|fancy.*writ/i, "caveat"],
    [/mono|code|terminal|typewriter/i, "spaceMono"],
    [/serif|editorial|classic|book|roman/i, "fraunces"],
    [/bold|black|heavy|poster|sport/i, "anton"],
    [/round|soft|friend|playful|bubbly/i, "bricolage"],
    [/tech|futur|geometr|digit/i, "spaceGrotesk"],
  ]
  for (const [re, key] of styleMap) {
    if (re.test(raw)) {
      return {
        ok: true,
        key,
        snippet: `fontFamily: Fonts.${key}.family`,
        curated: true,
        note:
          `"${raw}" is a style, not a family — closest curated match is ${key}` +
          (key === "caveat" ? " (size at 1.4x: scripts render small)." : ".") +
          ` Use exactly this snippet.`,
      }
    }
  }
  // CamelCase on-demand rule (mirrors the player's guessFamily): any
  // Playfair-Display-shaped key loads from Google Fonts automatically.
  const camel = raw.replace(/[\s_-]+(.)/g, (_, c: string) => (c as string).toUpperCase()).replace(/^./, (c) => c.toLowerCase()).replace(/[^A-Za-z0-9]/g, "")
  if (/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(camel)) {
    return {
      ok: true,
      key: camel,
      snippet: `fontFamily: Fonts.${camel}.family`,
      curated: false,
      note:
        `${camel} is not curated but loads on demand from Google Fonts (verified ` +
        `at render; an unknown name falls back instead of failing). Confirm it ` +
        `in read_render_report's fonts status before claiming it worked.`,
    }
  }
  return {
    ok: false,
    key: null,
    snippet: null,
    curated: false,
    note: `"${raw}" is not a usable font name. Closest curated fallbacks: caveat (handwritten), fraunces (serif), anton (bold). Pick one via font_suggest.`,
  }
}

export function suggestFonts(
  mood = "modern",
  brand?: string,
  style?: string
): { mood: string; display: string; text: string; css: string; note: string } {
  const key = mood.trim().toLowerCase()
  const pick = MOOD_FONTS[key] ?? MOOD_FONTS.modern!
  // A user-named style ("handwritten", "mono", "serif") OVERRIDES the mood
  // pairing for the display face: an explicit user ask always wins taste.
  // Script faces render small — the note carries the 1.4x size compensation.
  const s = (style ?? "").toLowerCase()
  if (/hand|script|cursive|marker|signatur|wedding|romantic|love/.test(s)) {
    const script =
      /elegant|luxury|wedding|romantic|love|formal/.test(`${s} ${key}`) ? "greatVibes"
      : /bold|retro|fun|playful|logo/.test(`${s} ${key}`) ? "pacifico"
      : /danc|casual|bounc/.test(s) ? "dancingScript"
      : "caveat"
    return {
      mood: key,
      display: script,
      text: /elegant|romantic|love/.test(`${s} ${key}`) ? "newsreader" : "karla",
      css: `fontFamily: Fonts.${script}.family (hero) + text face (body)`,
      note:
        `User asked for "${style}" — display is ${script}, no substitutes. ` +
        `Script faces render ~30% smaller than sans at the same px: size the hero ` +
        `at 1.4x the normal hero px (e.g. 200px instead of 140px) and add a slight ` +
        `rotate (-2deg) for an authentic hand. Never system-ui/Arial — Fonts.* ` +
        `is already in scope, no import needed.`,
    }
  }
  if (/mono|code|terminal|typewriter/.test(s)) {
    return {
      mood: key,
      display: "spaceMono",
      text: "spaceMono",
      css: `fontFamily: Fonts.spaceMono.family everywhere`,
      note: `User asked for "${style}" — code/typewriter cuts are all-mono (spaceMono). Never proportional faces here.`,
    }
  }
  if (/serif|editorial|classic|book/.test(s)) {
    return {
      mood: key,
      display: "fraunces",
      text: "newsreader",
      css: `fontFamily: Fonts.fraunces.family (hero) + Fonts.newsreader.family (body)`,
      note: `User asked for "${style}" — display is fraunces, no substitutes.`,
    }
  }
  return {
    mood: key,
    ...pick,
    note:
      `Pairing for "${key}"${brand ? ` matching brand "${brand}"` : ""}. ` +
      `Display for hero only, text face for everything else. ` +
      `Never system-ui/Arial — Fonts.* is already in scope, no import needed.`,
  }
}

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
      note: "1920px wide; use <img> with crossOrigin=\"anonymous\" so export snapshots paint.",
    },
    {
      url: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1920&q=80&auto=format&fit=crop",
      label: "Neon gradient — energetic background",
      attribution: "Unsplash (check photo page for author)",
      note: "Works as a full-bleed #wm-stage background at 0.25 opacity.",
    },
  ],
  video: [
    {
      url: "https://cdn.coverr.co/videos/coverr-abstract-gradient-5241/1080p.mp4",
      label: "Abstract gradient loop (Coverr)",
      attribution: "Coverr — free for commercial use, link appreciated",
      note: "Loop with the `loop` attribute; show/hide by t windows in render(), do not re-encode.",
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
      `Remote images need crossOrigin="anonymous" on <img>; same-host or R2 URLs paint best in export. ` +
      `If the source is under 1080p, upscale will soften — use vector/logo art instead.`,
  }
}

const MOOD_FONTS: Record<string, { display: string; text: string; css: string }> = {
  modern: {
    display: "Unbounded",
    text: "Manrope",
    css: "font-family: 'Unbounded' (hero) + 'Manrope' (body) — the runtime auto-loads cited families",
  },
  playful: {
    display: "Bricolage Grotesque",
    text: "Karla",
    css: "font-family: 'Bricolage Grotesque' (hero) + 'Karla' (body) — the runtime auto-loads cited families",
  },
  elegant: {
    display: "Instrument Serif",
    text: "Newsreader",
    css: "font-family: 'Instrument Serif' (hero) + 'Newsreader' (body) — the runtime auto-loads cited families",
  },
  bold: {
    display: "Anton",
    text: "Archivo",
    css: "font-family: 'Anton' (hero) + 'Archivo' (body) — the runtime auto-loads cited families",
  },
  tech: {
    display: "Space Grotesk",
    text: "Space Mono",
    css: "font-family: 'Space Grotesk' (hero) + 'Space Mono' (labels) — the runtime auto-loads cited families",
  },
}

/**
 * Ground truth for any font/style name the user or brief mentions.
 *
 * Names resolve against the curated catalogue first (CSS family name or
 * lowercase), then style words (handwritten → Caveat family of choices).
 * Any other well-formed family name loads on demand straight from Google
 * Fonts — the sandbox runtime fetches a stylesheet for every cited family,
 * so anything left is reported unknown with the closest curated fallback,
 * never a guess the render cannot honour. The snippet is always plain CSS,
 * never a registry reference.
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
    const family = familyNames[direct.toLowerCase()] ?? direct
    return {
      ok: true,
      key: direct,
      snippet: `font-family: '${family}'`,
      curated: true,
      note: `${family} is curated — auto-loaded by the runtime, zero risk. Cite it in CSS and it renders in preview and export.`,
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
      const family = familyNames[key.toLowerCase()] ?? key
      return {
        ok: true,
        key,
        snippet: `font-family: '${family}'`,
        curated: true,
        note:
          `"${raw}" is a style, not a family — closest curated match is ${family}` +
          (key === "caveat" ? " (size at 1.4x: scripts render small)." : ".") +
          ` Use exactly this snippet.`,
      }
    }
  }
  // On-demand rule (mirrors the runtime): any well-formed family name loads
  // straight from the Google Fonts CSS API.
  const family = raw
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
  if (/^[A-Za-z][A-Za-z0-9 ']{0,39}$/.test(family)) {
    return {
      ok: true,
      key: family,
      snippet: `font-family: '${family}'`,
      curated: false,
      note:
        `${family} is not curated but loads on demand from Google Fonts (verified ` +
        `at render; an unknown name falls back instead of failing). Confirm it ` +
        `in read_render_report's fonts status before claiming it worked.`,
    }
  }
  return {
    ok: false,
    key: null,
    snippet: null,
    curated: false,
    note: `"${raw}" is not a usable font name. Closest curated fallbacks: Caveat (handwritten), Fraunces (serif), Anton (bold). Pick one via font_suggest.`,
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
      /elegant|luxury|wedding|romantic|love|formal/.test(`${s} ${key}`) ? "Great Vibes"
      : /bold|retro|fun|playful|logo/.test(`${s} ${key}`) ? "Pacifico"
      : /danc|casual|bounc/.test(s) ? "Dancing Script"
      : "Caveat"
    return {
      mood: key,
      display: script,
      text: /elegant|romantic|love/.test(`${s} ${key}`) ? "Newsreader" : "Karla",
      css: `font-family: '${script}' (hero) + text face (body)`,
      note:
        `User asked for "${style}" — display is ${script}, no substitutes. ` +
        `Script faces render ~30% smaller than sans at the same px: size the hero ` +
        `at 1.4x the normal hero px (e.g. 200px instead of 140px) and add a slight ` +
        `rotate (-2deg) for an authentic hand. Never system-ui/Arial — cite the ` +
        `family in CSS and the runtime loads it, no import needed.`,
    }
  }
  if (/mono|code|terminal|typewriter/.test(s)) {
    return {
      mood: key,
      display: "Space Mono",
      text: "Space Mono",
      css: `font-family: 'Space Mono' everywhere`,
      note: `User asked for "${style}" — code/typewriter cuts are all-mono (Space Mono). Never proportional faces here.`,
    }
  }
  if (/serif|editorial|classic|book/.test(s)) {
    return {
      mood: key,
      display: "Fraunces",
      text: "Newsreader",
      css: `font-family: 'Fraunces' (hero) + 'Newsreader' (body)`,
      note: `User asked for "${style}" — display is Fraunces, no substitutes.`,
    }
  }
  return {
    mood: key,
    ...pick,
    note:
      `Pairing for "${key}"${brand ? ` matching brand "${brand}"` : ""}. ` +
      `Display for hero only, text face for everything else. ` +
      `Never system-ui/Arial — cite the family in CSS and the runtime loads it, no import needed.`,
  }
}

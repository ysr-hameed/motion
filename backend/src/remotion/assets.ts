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

export function suggestFonts(
  mood = "modern",
  brand?: string
): { mood: string; display: string; text: string; css: string; note: string } {
  const key = mood.trim().toLowerCase()
  const pick = MOOD_FONTS[key] ?? MOOD_FONTS.modern!
  return {
    mood: key,
    ...pick,
    note:
      `Pairing for "${key}"${brand ? ` matching brand "${brand}"` : ""}. ` +
      `Display for hero only, text face for everything else. ` +
      `Never system-ui/Arial — Fonts.* is already in scope, no import needed.`,
  }
}

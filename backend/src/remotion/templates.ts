/**
 * Phase 2 template system (IMPLEMENTATION_PLAN.md §6.4).
 * 10 professional templates with smart placeholders, style variants,
 * responsive timing, and pre-optimized export guidance. The tool does not
 * write code — it returns a fully customized SPEC the model turns into a
 * composition with write_composition, so templates stay deterministic and
 * the agent stays the only writer.
 */

export interface Template {
  id: string
  name: string
  beats: string[]
  variants: string[]
  defaultFrames: number
  exportNote: string
}

export const TEMPLATES: Template[] = [
  { id: "product-reveal", name: "Product Reveal", beats: ["Anticipation build", "Logo/product entrance with overshoot", "Feature beats with overlap", "Resolve on hero frame"], variants: ["15s", "30s", "60s"], defaultFrames: 450, exportNote: "IG Story 1080×1920 + YouTube 1920×1080" },
  { id: "social-ad", name: "Social Media Ad", beats: ["Hook in first 15 frames", "Offer with punchy type", "Proof/social signal", "CTA resolve"], variants: ["IG", "TikTok", "YT Shorts"], defaultFrames: 450, exportNote: "Vertical 1080×1920 primary, square 1:1 alt" },
  { id: "logo-animation", name: "Logo Animation", beats: ["Anticipation (scale 0.9)", "Entrance with spring overshoot", "Settle + glow/tagline"], variants: ["10 styles: punch, mask, glitch, orbit…"], defaultFrames: 150, exportNote: "Transparent-friendly; PNG sequence for overlays" },
  { id: "explainer-intro", name: "Explainer Intro", beats: ["Problem statement", "Turn with transition", "Solution reveal", "Title resolve"], variants: ["30s", "60s", "90s"], defaultFrames: 900, exportNote: "16:9, captions on (subtitle_generate)" },
  { id: "event-promo", name: "Event Promo", beats: ["Date punch", "Lineup/details stagger", "Countdown feel", "Save-the-date resolve"], variants: ["Countdown", "Save-the-Date"], defaultFrames: 450, exportNote: "Vertical + square bundle" },
  { id: "tutorial-intro", name: "Tutorial Intro", beats: ["Channel sting", "Topic title mask-reveal", "What-you-learn stagger"], variants: ["YouTube", "Course platform"], defaultFrames: 300, exportNote: "16:9 with lower-third safe margins" },
  { id: "app-demo", name: "App Demo", beats: ["Device frame entrance", "Feature walkthrough (3 beats)", "Gesture overlays", "Store-badge resolve"], variants: ["Feature showcase", "UI walkthrough"], defaultFrames: 600, exportNote: "16:9 + vertical crops for ads" },
  { id: "brand-story", name: "Brand Story", beats: ["Origin frame", "Craft/process beats", "Values typography", "Logo resolve"], variants: ["60s", "90s", "120s (multi-cut)"], defaultFrames: 900, exportNote: "16:9, ProRes for archival" },
  { id: "quote-card", name: "Quote Card", beats: ["Attribution kicker", "Animated typography (per-char)", "Author resolve"], variants: ["Minimal", "Bold", "Editorial"], defaultFrames: 240, exportNote: "Square 1:1 primary" },
  { id: "podcast-intro", name: "Podcast Intro/Outro", beats: ["Waveform build", "Show title reveal", "Host/guest stagger"], variants: ["Intro", "Outro"], defaultFrames: 300, exportNote: "16:9 + audiogram square" },
]

export function applyTemplate(
  templateId: string,
  context: { product?: string; brand?: string; mood?: string; platform?: string; seconds?: number }
): { ok: boolean; spec?: object; error?: string } {
  const t = TEMPLATES.find((x) => x.id === templateId)
  if (!t) return { ok: false, error: `Unknown template "${templateId}". Available: ${TEMPLATES.map((x) => x.id).join(", ")}` }
  const totalFrames = Math.min(900, Math.max(60, Math.round((context.seconds ?? t.defaultFrames / 30) * 30)))
  const per = Math.floor(totalFrames / t.beats.length)
  const beats = t.beats.map((what, i) => ({
    from: i * per,
    to: i === t.beats.length - 1 ? totalFrames : (i + 1) * per - 15,
    what: `${what} — ${context.mood ?? "modern"} tone${context.product ? ` for ${context.product}` : ""}`,
  }))
  return {
    ok: true,
    spec: {
      template: t.name,
      variant: t.variants[0],
      totalFrames,
      beats,
      placeholders: {
        product: context.product ?? "[product — fill from brief]",
        brand: context.brand ?? "[brand — upload logo or placeholder]",
        palette: context.mood ? `curated ${context.mood} palette (see font_suggest + color_extract)` : "curated palette",
        platform: context.platform ?? "1920×1080 default",
      },
      export: t.exportNote,
      note: "Smart placeholders auto-filled from context; retimed to content length; personalized copy goes through copy_generate in Phase 4.",
    },
  }
}

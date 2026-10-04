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

export interface GoldenStarter {
  code: string
  plan: { title: string; intent: string; beats: Array<{ from: number; to: number; what: string }>; ending: string }
}

/**
 * 50x fix: full working compositions, not specs.
 *
 * The old template path returned a SPEC the model still had to turn into
 * code — every turn reinvented structure, easing, stagger and clamps from
 * scratch on a weak model, which is why cuts read as cheap and often broke.
 * A golden starter is a complete, validator-clean file the model copies and
 * retitles in ONE write_composition call: spring landing, bezier easing,
 * clamped extrapolation, stagger, Fonts.* family, Lucide namespace.
 */
function goldenProductReveal(product: string, headline: string): GoldenStarter {
  const words = JSON.stringify(headline)
  const code = [
    'import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion"',
    'import * as Lucide from "lucide-react"',
    "",
    'const BG = "#0E0F13"',
    'const INK = "#F2F3F7"',
    'const ACCENT = "#FFB340"',
    "",
    "export default function ProductReveal() {",
    "  const frame = useCurrentFrame()",
    "  const { fps } = useVideoConfig()",
    "",
    "  // Beat 1 — anticipation: dip before the entrance (frames 0-12).",
    "  const anticipate = interpolate(frame, [0, 12], [1, 0.94], {",
    "    easing: Easing.bezier(0.4, 0, 1, 1),",
    '    extrapolateLeft: "clamp",',
    '    extrapolateRight: "clamp",',
    "  })",
    "",
    "  // Beat 2 — hero entrance with spring settle (from frame 12).",
  "  const land = spring({ frame: frame - 12, fps, config: { damping: 18, mass: 0.8, stiffness: 120 } })",
  "  const heroZoom = frame < 12 ? anticipate : 0.94 + land * 0.06",
    "  const heroY = interpolate(frame, [12, 72], [46, 0], {",
    "    easing: Easing.bezier(0.16, 1, 0.3, 1),",
    '    extrapolateLeft: "clamp",',
    '    extrapolateRight: "clamp",',
    "  })",
    "  const heroOpacity = interpolate(frame, [12, 30], [0, 1], {",
    '    extrapolateLeft: "clamp",',
    '    extrapolateRight: "clamp",',
    "  })",
    "",
    "  // Beat 3 — headline cascade, overlapping the settle (stagger 4f/word).",
    `  const words: string[] = ${words}.split(" ")`,
    "",
    "  // Beat 4 — resolve: badge fades in, cut holds.",
    "  const badgeIn = interpolate(frame, [90, 120], [0, 1], {",
    "    easing: Easing.bezier(0.16, 1, 0.3, 1),",
    '    extrapolateLeft: "clamp",',
    '    extrapolateRight: "clamp",',
    "  })",
    "",
    "  return (",
    '    <AbsoluteFill style={{ backgroundColor: BG, fontFamily: Fonts.unbounded.family }}>',
    "      <AbsoluteFill",
    "        style={{",
    '          background: "radial-gradient(1100px 640px at 50% 38%, rgba(255,179,64,0.12), transparent 70%)",',
    "        }}",
    "      />",
    "      <div",
    "        style={{",
    '          position: "absolute",',
    '          left: "50%",',
    '          top: "30%",',
  "          translate: '-50% ' + heroY + 'px',",
  "          scale: String(heroZoom),",
    "          opacity: heroOpacity,",
    "          zIndex: 10,",
    '          textAlign: "center",',
    "        }}",
    "      >",
    "        <div style={{ display: flex, alignItems: center, justifyContent: center, gap: 14 }}>",
    '          <Lucide.Zap size={40} color={ACCENT} />',
    `          <div style={{ fontSize: 84, lineHeight: 1, fontWeight: 800, color: INK }}>${product}</div>`,
    "        </div>",
    '        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 26 }}>',
    "          {words.map((w, i) => {",
    "            const d = 60 + i * 4",
    "            const s = spring({ frame: frame - d, fps, config: { damping: 18, mass: 0.5, stiffness: 180 } })",
    "            const y = interpolate(frame, [d, d + 18], [22, 0], {",
    "              easing: Easing.bezier(0.16, 1, 0.3, 1),",
    '              extrapolateLeft: "clamp",',
    '              extrapolateRight: "clamp",',
    "            })",
    "            return (",
    "              <span",
    "                key={i}",
    "                style={{",
    '                  display: "inline-block",',
    "                  fontSize: 40,",
    "                  lineHeight: 1.2,",
    "                  fontFamily: Fonts.manrope.family,",
    "                  color: INK,",
    "                  translate: '0 ' + y + 'px',",
    "                  opacity: s,",
    "                  marginRight: 12,",
    "                }}",
    "              >",
    "                {w}",
    "              </span>",
    "            )",
    "          })}",
    "        </div>",
    "      </div>",
    "      <div",
    "        style={{",
    '          position: "absolute",',
    '          left: "50%",',
    "          bottom: 96,",
    "          translate: '-50% 0',",
    "          opacity: badgeIn,",
    "          zIndex: 20,",
    "          fontSize: 22,",
    "          letterSpacing: 6,",
    "          fontFamily: Fonts.manrope.family,",
    "          color: ACCENT,",
    "        }}",
    "      >",
    "        SCROLL FOR MORE",
    "      </div>",
    "    </AbsoluteFill>",
    "  )",
    "}",
    "",
  ].join("\n")
  return {
    code,
    plan: {
      title: product + " reveal",
      intent: "Anticipation dip, spring hero landing, staggered headline cascade, resolved hold.",
      beats: [
        { from: 0, to: 12, what: "anticipation compress scale 1→0.94, Easing.bezier(0.4,0,1,1)" },
        { from: 12, to: 72, what: "hero entrance translateY 46→0 scale spring(18,0.8,120)" },
        { from: 60, to: 130, what: "headline cascade per-word spring stagger 4f" },
        { from: 90, to: 150, what: "badge resolve opacity 0→1, hold" },
      ],
      ending: "Hero and headline resolved, badge held.",
    },
  }
}

function goldenLogoSting(brand: string): GoldenStarter {
  const code = [
    'import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion"',
    'import * as Lucide from "lucide-react"',
    "",
    "export default function LogoSting() {",
    "  const frame = useCurrentFrame()",
    "  const { fps } = useVideoConfig()",
    "  const pop = spring({ frame: frame - 8, fps, config: { damping: 12, mass: 1, stiffness: 120 } })",
    "  const glow = interpolate(frame, [8, 60], [0, 1], {",
    "    easing: Easing.bezier(0.16, 1, 0.3, 1),",
    '    extrapolateLeft: "clamp",',
    '    extrapolateRight: "clamp",',
    "  })",
    "  const ring = interpolate(frame, [8, 50], [0.6, 1], {",
    "    easing: Easing.bezier(0.16, 1, 0.3, 1),",
    '    extrapolateLeft: "clamp",',
    '    extrapolateRight: "clamp",',
    "  })",
    "  return (",
    '    <AbsoluteFill style={{ backgroundColor: "#0B0C10", fontFamily: Fonts.anton.family, alignItems: "center", justifyContent: "center" }}>',
    "      <div style={{ scale: String(0.6 + pop * 0.4 * ring), opacity: glow, zIndex: 10, textAlign: center }}>",
    "        <div style={{ display: flex, justifyContent: center, marginBottom: 18 }}>",
    '          <Lucide.Sparkles size={54} color="#FFB340" />',
    "        </div>",
    `        <div style={{ fontSize: 120, lineHeight: 1, color: "#F2F3F7" }}>${brand}</div>`,
    "      </div>",
    "    </AbsoluteFill>",
    "  )",
    "}",
    "",
  ].join("\n")
  return {
    code,
    plan: {
      title: brand + " sting",
      intent: "Logo punches in with overshoot, glow resolves, hold.",
      beats: [
        { from: 0, to: 8, what: "anticipation hold on dark stage" },
        { from: 8, to: 60, what: "logo pop scale spring(12,1,120) + glow opacity 0→1" },
      ],
      ending: "Logo resolved at full scale with glow.",
    },
  }
}

function goldenQuoteCard(quote: string): GoldenStarter {
  const words = JSON.stringify(quote)
  const code = [
    'import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion"',
    "",
    "export default function QuoteCard() {",
    "  const frame = useCurrentFrame()",
    "  const { fps } = useVideoConfig()",
    `  const words: string[] = ${words}.split(" ")`,
    "  const bar = interpolate(frame, [0, 40], [0, 1], {",
    "    easing: Easing.bezier(0.16, 1, 0.3, 1),",
    '    extrapolateLeft: "clamp",',
    '    extrapolateRight: "clamp",',
    "  })",
    "  return (",
    '    <AbsoluteFill style={{ backgroundColor: "#101014", fontFamily: Fonts.newsreader.family, padding: 120 }}>',
    '      <div style={{ width: 8 + bar * 120, height: 8, backgroundColor: "#FFB340", marginBottom: 32, zIndex: 10 }} />',
    "      <div>",
    "        {words.map((w, i) => {",
    "          const d = 20 + i * 5",
    "          const s = spring({ frame: frame - d, fps, config: { damping: 18, mass: 0.5, stiffness: 180 } })",
    "          return (",
    '            <span key={i} style={{ display: "inline-block", opacity: s, translate: "0 " + y + "px", fontSize: 56, lineHeight: 1.35, color: "#F2F3F7", marginRight: 14 }}>',
    "              {w}",
    "            </span>",
    "          )",
    "        })}",
    "      </div>",
    "    </AbsoluteFill>",
    "  )",
    "}",
    "",
  ].join("\n")
  return {
    code,
    plan: {
      title: "Quote card",
      intent: "Accent bar wipes, quote cascades word by word with springs.",
      beats: [
        { from: 0, to: 40, what: "accent bar wipe scaleX 0→1, Easing.bezier(0.16,1,0.3,1)" },
        { from: 20, to: 140, what: "quote cascade per-word spring stagger 5f" },
      ],
      ending: "Full quote resolved, bar held.",
    },
  }
}

/** Golden starter by template id — full code, never a spec. Falls back to product-reveal. */
export function goldenStarter(
  templateId: string,
  context: { product?: string; brand?: string; headline?: string; quote?: string } = {}
): GoldenStarter {
  const id = templateId.toLowerCase()
  if (id.includes("logo")) return goldenLogoSting(context.brand ?? "SlyxUp")
  if (id.includes("quote")) return goldenQuoteCard(context.quote ?? context.headline ?? "Motion that lands every time")
  return goldenProductReveal(
    context.product ?? context.brand ?? "SlyxUp",
    context.headline ?? "Motion that lands"
  )
}

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
  // 50x fix: ship the golden file alongside the spec, so the model copies
  // working code instead of inventing structure from a beat list.
  const golden = goldenStarter(templateId, { product: context.product, brand: context.brand })
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
      note: "Copy goldenCode with write_composition (or quick_start to plan+write in one call), then retitle/recolor with edit_file. Do NOT write from scratch when a golden exists.",
      goldenCode: golden.code,
      goldenPlan: golden.plan,
    },
  }
}

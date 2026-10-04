/**
 * Single golden starter — no template catalogue.
 *
 * There is exactly one proven, validator-clean composition (spring landing,
 * bezier easing, clamped extrapolation, stagger, Fonts.* family, Lucide
 * namespace). quick_start publishes it with the brief's words and the agent
 * refines it with edit_file. Per-brief variety comes from the model, not
 * from a menu of starters.
 */

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

/** The single golden starter — full code, never a spec. No template menu. */
export function goldenStarter(
  context: { product?: string; brand?: string; headline?: string } = {}
): GoldenStarter {
  return goldenProductReveal(
    context.product ?? context.brand ?? "SlyxUp",
    context.headline ?? "Motion that lands"
  )
}



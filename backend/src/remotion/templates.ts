/**
 * Golden starter generator — no template catalogue.
 *
 * The old single static golden made every first response look identical
 * (same colors, same fonts, same layout): fast, but basic. This builds the
 * starter from design tokens instead — palette + font pair + layout variant
 * picked deterministically from the brief — so the first paint is already
 * art-directed, and no two briefs open the same way.
 *
 * Overlap-proof by construction: text lives in ONE flex column in normal
 * flow (never sibling absolutes sharing coordinates), type sizes adapt to
 * copy length, and every layer carries a distinct z-index. The static
 * validator confirms it: the matrix test asserts zero errors AND zero
 * warnings across moods and durations.
 */

export interface GoldenStarter {
  code: string
  plan: { title: string; intent: string; beats: Array<{ from: number; to: number; what: string }>; ending: string }
}

export interface StarterContext {
  product?: string
  brand?: string
  headline?: string
  mood?: string
  /** Seconds of cut. Defaults to 5. */
  seconds?: number
  /** Framing hint from /create. Recorded in the plan; canvas stays 1920x1080. */
  framing?: string
}

interface Tokens {
  bg: string
  ink: string
  accent: string
  glow: string
  display: string
  text: string
  palette: string
  kicker: string
  badge: string
  icon: string
  damping: number
}

const PALETTES: Record<string, Omit<Tokens, "palette">> = {
  cinematic: {
    bg: "#0B0C10", ink: "#F2F3F7", accent: "#FFB340", glow: "rgba(255,179,64,0.12)",
    display: "unbounded", text: "manrope",
    kicker: "A MOTION CUT", badge: "WATCH TO THE END", icon: "Zap", damping: 18,
  },
  energetic: {
    bg: "#101014", ink: "#F4F2EC", accent: "#FF5A5A", glow: "rgba(255,90,90,0.14)",
    display: "anton", text: "archivo",
    kicker: "TURN IT UP", badge: "DON'T BLINK", icon: "Flame", damping: 14,
  },
  playful: {
    bg: "#1B1035", ink: "#F4F2EC", accent: "#FF7AD9", glow: "rgba(255,122,217,0.14)",
    display: "bricolage", text: "karla",
    kicker: "FRESH DROP", badge: "STAY FOR THE DROP", icon: "Sparkles", damping: 12,
  },
  minimal: {
    bg: "#F4F2EC", ink: "#141414", accent: "#E4572E", glow: "rgba(228,87,46,0.10)",
    display: "syne", text: "newsreader",
    kicker: "N°01 — INTRO", badge: "SCROLL", icon: "Star", damping: 22,
  },
  elegant: {
    bg: "#111214", ink: "#EFE9DC", accent: "#D8B56B", glow: "rgba(216,181,107,0.12)",
    display: "instrumentSerif", text: "newsreader",
    kicker: "MAISON", badge: "DISCOVER", icon: "Crown", damping: 26,
  },
  tech: {
    bg: "#0B0E14", ink: "#E8EEF7", accent: "#5AC8FA", glow: "rgba(90,200,250,0.12)",
    display: "spaceGrotesk", text: "spaceMono",
    kicker: "SYS.BOOT // V2", badge: "INITIALIZING", icon: "Play", damping: 20,
  },
}

function tokensFor(mood: string | undefined): Tokens {
  const m = (mood ?? "").toLowerCase()
  // Romantic briefs get the elegant stage with a script hero.
  if (/romantic|wedding|signature|handwrit|love|valentine/.test(m)) {
    return { ...PALETTES.elegant!, palette: "elegant", display: "dancingScript", kicker: "WITH LOVE", badge: "FOREVER" }
  }
  let key = "cinematic"
  if (/energetic|bold|sport|hype|hustle/.test(m)) key = "energetic"
  else if (/playful|fun|quirky|kid|party/.test(m)) key = "playful"
  else if (/minimal|clean|quiet/.test(m)) key = "minimal"
  else if (/elegant|luxury|prestige|editorial|serif|fashion/.test(m)) key = "elegant"
  else if (/tech|futur|saas|data|ai\b|robot|cyber/.test(m)) key = "tech"
  return { ...PALETTES[key]!, palette: key }
}

function hashSeed(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Hero size shrinks as copy grows — long titles never fill the frame. */
function heroSize(text: string): number {
  const n = text.trim().length
  if (n <= 8) return 170
  if (n <= 14) return 140
  if (n <= 22) return 112
  return 92
}

function subSize(headline: string): number {
  const n = headline.trim().length
  if (n <= 24) return 46
  if (n <= 48) return 38
  return 32
}

const EASE_OUT = "Easing.bezier(0.16, 1, 0.3, 1)"
const EASE_IN = "Easing.bezier(0.4, 0, 1, 1)"
const CLAMP = '    extrapolateLeft: "clamp",\n    extrapolateRight: "clamp",'

function interp(name: string, from: number, to: number, v0: number, v1: number, ease: string): string[] {
  return [
    `  const ${name} = interpolate(frame, [${from}, ${to}], [${v0}, ${v1}], {`,
    `    easing: ${ease},`,
    CLAMP,
    "  })",
  ]
}

/**
 * Advanced-motion math shared by every golden: whole-scene punch-zoom
 * (intent without visible movement), two parallax orb layers at 20%/60% of
 * fg speed for Z-depth, kicker tracking that opens as the hero lands, and a
 * counter-motion term so the badge drifts opposite the hero. All
 * frame-driven, clamped, deterministic — zero extra model calls.
 */
function depthMath(total: number, settleAt: number): string[] {
  return [
    "  // Depth rig — punch-zoom + parallax + counter-motion (one rig, every golden).",
    ...interp("push", 0, total, 1, 1.045, "Easing.bezier(0.25, 0.1, 0.25, 1)"),
    ...interp("orbFar", 0, total, 0, -26, "Easing.bezier(0.25, 0.1, 0.25, 1)"),
    ...interp("orbNear", 0, total, 0, -64, "Easing.bezier(0.25, 0.1, 0.25, 1)"),
    ...interp("track", 15, settleAt, 2, 9, EASE_OUT),
    `  const counter = frame > ${settleAt} ? Math.sin((frame - ${settleAt}) * 0.08 + Math.PI) * 4 : 0`,
    // Linear progress has no easing key on purpose: it drives the hairline
    // 0→100% and easing would make time itself look broken.
    `  const progress = interpolate(frame, [0, ${total}], [0, 1], {`,
    CLAMP,
    "  })",
  ]
}

/** Hairline progress + vignette — resolves the frame, costs nothing. */
function frameChrome(): string[] {
  return [
    "      {/* progress hairline: linear 0→100% across the cut, YouTube-style at the bottom */}",
    "      <div",
    "        style={{",
    '          position: "absolute",',
    "          bottom: 0,",
    "          left: 0,",
    "          height: 6,",
    "          width: progress * 100 + '%',",
    "          backgroundColor: ACCENT,",
    "          zIndex: 30,",
    "        }}",
    "      />",
    "      {/* frame chrome: vignette grounds the edges */}",
    "      <AbsoluteFill",
    "        style={{",
    '          background: "radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(0,0,0,0.42) 100%)",',
    "          zIndex: 15,",
    '          pointerEvents: "none",',
    "        }}",
    "      />",
  ]
}

function buildStack(t: Tokens, hero: string, headline: string, total: number): GoldenStarter {
  const H = heroSize(hero)
  const S = subSize(headline)
  const e1 = Math.min(72, Math.round(total * 0.45))
  const c0 = 12 + 30
  const b0 = total - 46
  const b1 = total - 16
  const wordsJson = JSON.stringify(headline)
  const settleAt = e1
  const code = [
    'import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion"',
    'import * as Lucide from "lucide-react"',
    "",
    `const BG = "${t.bg}"`,
    `const INK = "${t.ink}"`,
    `const ACCENT = "${t.accent}"`,
    "",
    "export default function OpeningCut() {",
    "  const frame = useCurrentFrame()",
    "  const { fps } = useVideoConfig()",
    "",
    "  // Beat 1 — anticipation: dip before the entrance.",
    ...interp("anticipate", 0, 15, 1, 0.94, EASE_IN),
    "",
    "  // Beat 2 — hero entrance with spring settle.",
    `  const land = spring({ frame: frame - 15, fps, config: { damping: ${t.damping}, mass: 0.8, stiffness: 130 } })`,
    "  const zoom = frame < 15 ? anticipate : 0.94 + land * 0.06",
    ...interp("rise", 15, e1, 54, 0, EASE_OUT),
    ...interp("fade", 15, 32, 0, 1, EASE_OUT),
    ...interp("bar", c0, c0 + 30, 0, 1, EASE_OUT),
    ...interp("badgeIn", b0, b1, 0, 1, EASE_OUT),
    `  const breathe = frame > ${settleAt} ? Math.sin((frame - ${settleAt}) * 0.08) * 3 : 0`,
    ...depthMath(total, settleAt),
    "",
    `  const words: string[] = ${wordsJson}.split(" ")`,
    `  const heroChars: string[] = ${JSON.stringify(hero)}.split("")`,
    "",
    "  return (",
    `    <AbsoluteFill style={{ backgroundColor: BG, fontFamily: Fonts.${t.text}.family }}>`,
    "      <AbsoluteFill",
    "        style={{",
    `          background: "radial-gradient(1100px 640px at 50% 38%, ${t.glow}, transparent 70%)",`,
    "          translate: '0 ' + orbFar + 'px',",
    "        }}",
    "      />",
    "      {/* parallax orbs: far drifts 20%, near drifts 60% of fg — real Z-depth */}",
    "      <div",
    "        style={{",
    '          position: "absolute",',
    "          left: 240,",
    "          top: 180,",
    "          width: 420,",
    "          height: 420,",
    "          borderRadius: '50%',",
    `          background: "radial-gradient(circle, ${t.glow} 0%, transparent 70%)",`,
    "          translate: '0 ' + orbNear + 'px',",
    "          zIndex: 2,",
    "        }}",
    "      />",
    "      <div",
    "        style={{",
    '          position: "absolute",',
    "          right: 200,",
    "          bottom: 140,",
    "          width: 560,",
    "          height: 560,",
    "          borderRadius: '50%',",
    `          border: '1px solid ' + ACCENT + '33',`,
    "          translate: '0 ' + orbFar + 'px',",
    "          zIndex: 3,",
    "        }}",
    "      />",
    "      <div",
    "        style={{",
    '          position: "absolute",',
    '          left: "50%",',
    '          top: "44%",',
    "          translate: '-50% ' + (rise + breathe) + 'px',",
    "          scale: String(zoom * push),",
    "          opacity: fade,",
    "          zIndex: 10,",
    '          textAlign: "center",',
    "          width: 1600,",
    "        }}",
    "      >",
    `        <div style={{ fontSize: 24, letterSpacing: track, fontFamily: Fonts.${t.text}.family, color: ACCENT }}>${t.kicker}</div>`,
    '        <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>',
    "          {heroChars.map((ch, i) => {",
    "            const d = 15 + i * 2",
    "            const s = spring({ frame: frame - d, fps, config: { damping: 16, mass: 0.5, stiffness: 200 } })",
    `            const y = interpolate(frame, [d, d + 16], [70, 0], {`,
    `              easing: ${EASE_OUT},`,
    '              extrapolateLeft: "clamp",',
    '              extrapolateRight: "clamp",',
    "            })",
    "            return (",
    "              <span",
    "                key={i}",
    "                style={{",
    '                  display: "inline-block",',
    `                  fontSize: ${H},`,
    "                  lineHeight: 1,",
    "                  fontWeight: 800,",
    `                  fontFamily: Fonts.${t.display}.family,`,
    "                  color: INK,",
    "                  textShadow: '0 24px 80px rgba(0,0,0,0.45)',",
    "                  translate: '0 ' + y + 'px',",
    "                  opacity: Math.max(0, Math.min(1, s)),",
    "                }}",
    "              >",
    "                {ch === \" \" ? \"\\u00A0\" : ch}",
    "              </span>",
    "            )",
    "          })}",
    "        </div>",
    '        <div style={{ display: "flex", justifyContent: "center", marginTop: 26 }}>',
    "          {words.map((w, i) => {",
    `            const d = ${c0} + i * 4`,
    "            const s = spring({ frame: frame - d, fps, config: { damping: 18, mass: 0.5, stiffness: 180 } })",
    `            const y = interpolate(frame, [d, d + 18], [22, 0], {`,
    `              easing: ${EASE_OUT},`,
    '              extrapolateLeft: "clamp",',
    '              extrapolateRight: "clamp",',
    "            })",
    "            return (",
    "              <span",
    "                key={i}",
    "                style={{",
    '                  display: "inline-block",',
    `                  fontSize: ${S},`,
    "                  lineHeight: 1.35,",
    `                  fontFamily: Fonts.${t.text}.family,`,
    "                  color: INK,",
    "                  translate: '0 ' + y + 'px',",
    "                  opacity: Math.max(0, Math.min(1, s)),",
    "                  marginRight: 14,",
    "                }}",
    "              >",
    "                {w}",
    "              </span>",
    "            )",
    "          })}",
    "        </div>",
    `        <div style={{ width: 8 + bar * 140, height: 6, backgroundColor: ACCENT, marginTop: 30, marginLeft: \"auto\", marginRight: \"auto\" }} />`,
    "      </div>",
    "      <div",
    "        style={{",
    '          position: "absolute",',
    '          left: "50%",',
    "          bottom: 96,",
    "          translate: '-50% ' + counter + 'px',",
    "          opacity: badgeIn,",
    "          zIndex: 20,",
    "          fontSize: 22,",
    "          letterSpacing: 6,",
    `          fontFamily: Fonts.${t.text}.family,`,
    "          color: ACCENT,",
    "        }}",
    "      >",
    `        ${t.badge}`,
    "      </div>",
    ...frameChrome(),
    "    </AbsoluteFill>",
    "  )",
    "}",
    "",
  ].join("\n")
  return {
    code,
    plan: {
      title: `${hero} — center-stack ${t.palette}`,
      intent: `Anticipation dip, spring hero landing, staggered sub cascade, resolved hold. ${t.palette} stage, ${t.display}/${t.text}.`,
      beats: [
        { from: 0, to: 15, what: "anticipation compress scale 1→0.94, Easing.bezier(0.4,0,1,1)" },
        { from: 15, to: e1, what: `hero entrance translateY 54→0 + spring settle (damping ${t.damping})` },
        { from: c0, to: c0 + 60, what: "sub cascade per-word spring stagger 4f, overlapping the settle" },
        { from: b0, to: total, what: "accent bar wipe + badge resolve, idle breathing hold" },
      ],
      ending: "Hero and sub resolved, badge held.",
    },
  }
}

function buildSplit(t: Tokens, hero: string, headline: string, total: number): GoldenStarter {
  const H = Math.min(150, heroSize(hero) + 10)
  const S = subSize(headline)
  const e1 = Math.min(72, Math.round(total * 0.45))
  const c0 = 12 + 28
  const b0 = total - 46
  const b1 = total - 16
  const wordsJson = JSON.stringify(headline)
  const code = [
    'import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion"',
    'import * as Lucide from "lucide-react"',
    "",
    `const BG = "${t.bg}"`,
    `const INK = "${t.ink}"`,
    `const ACCENT = "${t.accent}"`,
    "",
    "export default function OpeningCut() {",
    "  const frame = useCurrentFrame()",
    "  const { fps } = useVideoConfig()",
    "",
    "  // Beat 1 — anticipation on the whole stage.",
    ...interp("anticipate", 0, 15, 1, 0.95, EASE_IN),
    "",
    "  // Beat 2 — text column slides in from the left, visual pops on the right.",
    `  const land = spring({ frame: frame - 15, fps, config: { damping: ${t.damping}, mass: 0.8, stiffness: 130 } })`,
    ...interp("lift", 15, e1, 60, -150, EASE_OUT),
    ...interp("fade", 15, 32, 0, 1, EASE_OUT),
    ...interp("pop", 20, e1, 0.5, 1, EASE_OUT),
    ...interp("spin", 20, e1 + 40, 0, 12, EASE_OUT),
    ...interp("badgeIn", b0, b1, 0, 1, EASE_OUT),
    `  const breathe = frame > ${e1} ? Math.sin((frame - ${e1}) * 0.08) * 3 : 0`,
    ...depthMath(total, e1),
    "",
    `  const words: string[] = ${wordsJson}.split(" ")`,
    "",
    "  return (",
    `    <AbsoluteFill style={{ backgroundColor: BG, fontFamily: Fonts.${t.text}.family }}>`,
    "      <AbsoluteFill",
    "        style={{",
    `          background: "radial-gradient(900px 600px at 78% 50%, ${t.glow}, transparent 70%)",`,
    "          translate: '0 ' + orbFar + 'px',",
    "        }}",
    "      />",
    "      {/* grid decor: overscanned 24px so the parallax drift never reveals an edge */}",
    "      <div",
    "        style={{",
    '          position: "absolute",',
    "          left: -24,",
    "          top: -24,",
    "          right: -24,",
    "          bottom: -24,",
    `          background: "repeating-linear-gradient(90deg, transparent 0 118px, " + ACCENT + "14 118px 120px)",`,
    "          translate: '0 ' + orbFar + 'px',",
    "          zIndex: 1,",
    "        }}",
    "      />",
    "      <div",
    "        style={{",
    '          position: "absolute",',
    "          left: 160,",
    '          top: "50%",',
          "          translate: '0 ' + (lift + breathe) + 'px',",
    "          scale: String((frame < 15 ? anticipate : 0.95 + land * 0.05) * push),",
    "          opacity: fade,",
    "          zIndex: 10,",
    '          textAlign: "left",',
    "          width: 980,",
    "        }}",
    "      >",
    `        <div style={{ fontSize: 24, letterSpacing: track, fontFamily: Fonts.${t.text}.family, color: ACCENT }}>${t.kicker}</div>`,
    `        <div style={{ fontSize: ${H}, lineHeight: 1, fontWeight: 800, fontFamily: Fonts.${t.display}.family, color: INK, marginTop: 18, textShadow: "0 24px 80px rgba(0,0,0,0.45)" }}>${hero}</div>`,
    '        <div style={{ display: "flex", marginTop: 26 }}>',
    "          {words.map((w, i) => {",
    `            const d = ${c0} + i * 4`,
    "            const s = spring({ frame: frame - d, fps, config: { damping: 18, mass: 0.5, stiffness: 180 } })",
    `            const y = interpolate(frame, [d, d + 18], [22, 0], {`,
    `              easing: ${EASE_OUT},`,
    '              extrapolateLeft: "clamp",',
    '              extrapolateRight: "clamp",',
    "            })",
    "            return (",
    "              <span",
    "                key={i}",
    "                style={{",
    '                  display: "inline-block",',
    `                  fontSize: ${S},`,
    "                  lineHeight: 1.35,",
    `                  fontFamily: Fonts.${t.text}.family,`,
    "                  color: INK,",
    "                  translate: '0 ' + y + 'px',",
    "                  opacity: Math.max(0, Math.min(1, s)),",
    "                  marginRight: 14,",
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
    "          right: 220,",
    '          top: "50%",',
    "          translate: '0 ' + (-240 + breathe * 2) + 'px',",
    "          width: 480,",
    "          height: 480,",
    "          zIndex: 6,",
    "        }}",
    "      >",
    `        <div style={{ width: 480, height: 480, borderRadius: "50%", border: "3px dashed " + ACCENT + "66", rotate: spin + "deg" }} />`,
    "        <div",
    "          style={{",
    '            position: "absolute",',
    "            left: 140,",
    "            top: 140,",
    "            width: 200,",
    "            height: 200,",
    "            borderRadius: \"50%\",",
    '            backgroundColor: ACCENT + "22",',
    "            scale: String(pop),",
    "            opacity: fade,",
    "            zIndex: 7,",
    "          }}",
    "        />",
    `        <div style={{ position: "absolute", left: 0, top: 0, width: 480, height: 480, display: "flex", alignItems: "center", justifyContent: "center", scale: String(pop), opacity: fade, zIndex: 8 }}>`,
    `          <Lucide.${t.icon} size={150} color={ACCENT} />`,
    "        </div>",
    "      </div>",
    "      <div",
    "        style={{",
    '          position: "absolute",',
    '          left: "50%",',
    "          bottom: 96,",
    "          translate: '-50% ' + counter + 'px',",
    "          opacity: badgeIn,",
    "          zIndex: 20,",
    "          fontSize: 22,",
    "          letterSpacing: 6,",
    `          fontFamily: Fonts.${t.text}.family,`,
    "          color: ACCENT,",
    "        }}",
    "      >",
    `        ${t.badge}`,
    "      </div>",
    ...frameChrome(),
    "    </AbsoluteFill>",
    "  )",
    "}",
    "",
  ].join("\n")
  return {
    code,
    plan: {
      title: `${hero} — split ${t.palette}`,
      intent: `Text rail slides in left with spring settle while the emblem pops right with counter-rotation. ${t.palette} stage, ${t.display}/${t.text}.`,
      beats: [
        { from: 0, to: 15, what: "stage-wide anticipation compress, Easing.bezier(0.4,0,1,1)" },
        { from: 15, to: e1, what: "text rail translate in + emblem pop with 12° counter-rotation" },
        { from: c0, to: c0 + 60, what: "sub cascade per-word spring stagger 4f" },
        { from: b0, to: total, what: "badge resolve, idle breathing hold" },
      ],
      ending: "Rail and emblem resolved, badge held.",
    },
  }
}

function buildMask(t: Tokens, hero: string, headline: string, total: number): GoldenStarter {
  const H = Math.min(200, heroSize(hero) + 24)
  const S = subSize(headline)
  const m0 = 10
  const m1 = m0 + 44
  const c0 = m0 + 30
  const b0 = total - 46
  const b1 = total - 16
  const charsJson = JSON.stringify(hero.toUpperCase())
  const wordsJson = JSON.stringify(headline)
  const code = [
    'import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion"',
    "",
    `const BG = "${t.bg}"`,
    `const INK = "${t.ink}"`,
    `const ACCENT = "${t.accent}"`,
    "",
    "export default function OpeningCut() {",
    "  const frame = useCurrentFrame()",
    "  const { fps } = useVideoConfig()",
    "",
    "  // Beat 1 — masked hero reveal, per-character spring cascade.",
    ...interp("mask", m0, m1, 0, 1, EASE_OUT),
    ...interp("kickerIn", 0, 22, 0, 1, EASE_OUT),
    ...interp("subIn", c0, c0 + 24, 0, 1, EASE_OUT),
    ...interp("subRise", c0, c0 + 30, 26, 0, EASE_OUT),
    ...interp("bar", m1, m1 + 26, 0, 1, EASE_OUT),
    ...interp("badgeIn", b0, b1, 0, 1, EASE_OUT),
    `  const breathe = frame > ${m1} ? Math.sin((frame - ${m1}) * 0.08) * 2 : 0`,
    ...depthMath(total, m1),
    "",
    `  const chars: string[] = ${charsJson}.split("")`,
    `  const words: string[] = ${wordsJson}.split(" ")`,
    "",
    "  return (",
    `    <AbsoluteFill style={{ backgroundColor: BG, fontFamily: Fonts.${t.text}.family }}>`,
    "      <AbsoluteFill",
    "        style={{",
    `          background: "radial-gradient(1200px 500px at 50% 30%, ${t.glow}, transparent 70%)",`,
    "          translate: '0 ' + orbFar + 'px',",
    "        }}",
    "      />",
    "      <div",
    "        style={{",
    '          position: "absolute",',
    "          left: 180,",
    "          top: 220,",
    "          width: 380,",
    "          height: 380,",
    "          borderRadius: '50%',",
    `          background: "radial-gradient(circle, ${t.glow} 0%, transparent 70%)",`,
    "          translate: '0 ' + orbNear + 'px',",
    "          zIndex: 2,",
    "        }}",
    "      />",
    "      <div",
    "        style={{",
    '          position: "absolute",',
    '          left: "50%",',
    "          top: 120,",
          "          translate: '-50% 0',",
    "          opacity: kickerIn,",
    "          zIndex: 11,",
    "          fontSize: 24,",
    "          letterSpacing: track,",
    `          fontFamily: Fonts.${t.text}.family,`,
    "          color: ACCENT,",
    "        }}",
    "      >",
    `        ${t.kicker}`,
    "      </div>",
    "      <div",
    "        style={{",
    '          position: "absolute",',
    '          left: "50%",',
    '          top: "42%",',
    "          translate: '-50% ' + breathe + 'px',",
    "          scale: String(push),",
    "          zIndex: 10,",
    '          textAlign: "center",',
    "          width: 1700,",
    "        }}",
    "      >",
    "        <div style={{ clipPath: 'inset(0 ' + ((1 - mask) * 100) + '% 0 0)' }}>",
    "          {chars.map((ch, i) => {",
    `            const d = ${m0} + i * 2`,
    "            const s = spring({ frame: frame - d, fps, config: { damping: 16, mass: 0.5, stiffness: 200 } })",
    `            const y = interpolate(frame, [d, d + 14], [60, 0], {`,
    `              easing: ${EASE_OUT},`,
    '              extrapolateLeft: "clamp",',
    '              extrapolateRight: "clamp",',
    "            })",
    "            return (",
    "              <span",
    "                key={i}",
    "                style={{",
    '                  display: "inline-block",',
    `                  fontSize: ${H},`,
    "                  lineHeight: 1,",
    `                  fontFamily: Fonts.${t.display}.family,`,
    "                  color: INK,",
    "                  translate: '0 ' + y + 'px',",
    "                  opacity: Math.max(0, Math.min(1, s)),",
    "                }}",
    "              >",
    "                {ch === \" \" ? \"\\u00A0\" : ch}",
    "              </span>",
    "            )",
    "          })}",
    "        </div>",
    '        <div style={{ display: "flex", justifyContent: "center", marginTop: 30 }}>',
    "          {words.map((w, i) => {",
    `            const d = ${c0} + i * 5`,
    "            const s = spring({ frame: frame - d, fps, config: { damping: 18, mass: 0.5, stiffness: 180 } })",
    "            return (",
    "              <span",
    "                key={i}",
    "                style={{",
    '                  display: "inline-block",',
    `                  fontSize: ${S},`,
    "                  lineHeight: 1.35,",
    `                  fontFamily: Fonts.${t.text}.family,`,
    "                  color: INK,",
    "                  opacity: Math.max(0, Math.min(1, s)),",
    "                  marginRight: 14,",
    "                }}",
    "              >",
    "                {w}",
    "              </span>",
    "            )",
    "          })}",
    "        </div>",
    `        <div style={{ width: 8 + bar * 160, height: 6, backgroundColor: ACCENT, marginTop: 30, marginLeft: \"auto\", marginRight: \"auto\" }} />`,
    "      </div>",
    "      <div",
    "        style={{",
    '          position: "absolute",',
    '          left: "50%",',
    "          bottom: 96,",
          "          translate: '-50% ' + counter + 'px',",
    "          opacity: badgeIn,",
    "          zIndex: 20,",
    "          fontSize: 22,",
    "          letterSpacing: 6,",
    `          fontFamily: Fonts.${t.text}.family,`,
    "          color: ACCENT,",
    "        }}",
    "      >",
    `        ${t.badge}`,
    "      </div>",
    ...frameChrome(),
    "    </AbsoluteFill>",
    "  )",
    "}",
    "",
  ].join("\n")
  return {
    code,
    plan: {
      title: `${hero} — kinetic mask ${t.palette}`,
      intent: `Clip-path hero wipe with per-character springs, word cascade sub, resolved hold. ${t.palette} stage, ${t.display}/${t.text}.`,
      beats: [
        { from: m0, to: m1, what: "hero mask wipe inset 100→0% with per-char spring stagger 2f" },
        { from: c0, to: c0 + 60, what: "sub cascade per-word spring stagger 5f, overlapping the wipe" },
        { from: b0, to: total, what: "accent bar + badge resolve, idle breathing hold" },
      ],
      ending: "Full hero revealed, sub resolved, badge held.",
    },
  }
}

/**
 * Code-terminal starter — the Code Hike mechanic, zero dependencies.
 *
 * Upstream's Code Hike template needs the codehike npm package, which is not
 * in the player scope — so this hand-rolls the same beats in pure Remotion:
 * a terminal window springs in, token-coloured lines cascade with per-line
 * springs, the active line is a pure function of frame (highlight sweep),
 * the command types itself via slice, and a deterministic block cursor
 * blinks. No new packages, no new failure modes.
 */
function buildCode(t: Tokens, hero: string, headline: string, total: number): GoldenStarter {
  const isLight = t.bg.toLowerCase() === "#f4f2ec"
  const STR = isLight ? "#1E7E34" : "#9CE56B"
  const CMT = isLight ? "#9AA0A6" : "#5B616B"
  const rawFn = (hero.replace(/[^A-Za-z0-9_]/g, "") || "Nova").slice(0, 24)
  const fn = /^[0-9]/.test(rawFn) ? `App${rawFn}` : rawFn
  const comment = `// ${headline.replace(/\s+/g, " ").slice(0, 52)}`
  const cmd = `$ npx remotion render ${fn}`
  const title = hero.replace(/"/g, "'").slice(0, 28)
  const linesJson = JSON.stringify([
    { toks: [{ t: "import", c: t.accent }, { t: " { spring } ", c: t.ink }, { t: "from", c: t.accent }, { t: ' "remotion"', c: STR }] },
    { toks: [{ t: comment, c: CMT }] },
    { toks: [{ t: "export ", c: t.accent }, { t: "default ", c: t.accent }, { t: "function ", c: t.accent }, { t: fn, c: t.accent }, { t: "() {", c: t.ink }] },
    { toks: [{ t: "  return <", c: t.ink }, { t: "Intro", c: t.ink }, { t: " title=", c: t.ink }, { t: `"${title}"`, c: STR }, { t: " />", c: t.ink }] },
    { toks: [{ t: "}", c: t.ink }] },
  ])
  const cmdJson = JSON.stringify(cmd)
  const firstLine = 26
  const perLine = 16
  const lastIdx = 5
  const typeStart = firstLine + lastIdx * perLine + 12
  const typeDur = Math.min(48, Math.max(24, total - typeStart - 40))
  const settleAt = typeStart + typeDur
  const b0 = total - 46
  const b1 = total - 16
  const code = [
    'import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion"',
    'import * as Lucide from "lucide-react"',
    "",
    `const BG = "${t.bg}"`,
    `const INK = "${t.ink}"`,
    `const ACCENT = "${t.accent}"`,
    `const CMT = "${CMT}"`,
    "",
    "export default function OpeningCut() {",
    "  const frame = useCurrentFrame()",
    "  const { fps } = useVideoConfig()",
    "",
    "  // Beat 1 — terminal window springs in.",
    "  const winIn = spring({ frame: frame - 8, fps, config: { damping: 18, mass: 0.9, stiffness: 120 } })",
    "  const winClamped = Math.max(0, Math.min(1, winIn))",
    ...interp("winY", 8, 52, 90, 0, EASE_OUT),
    ...interp("winFade", 8, 26, 0, 1, EASE_OUT),
    ...interp("badgeIn", b0, b1, 0, 1, EASE_OUT),
    "  // Beat 2 — the active line is a pure function of frame: highlight sweep.",
    `  const active = Math.min(${lastIdx}, Math.max(0, Math.floor((frame - ${firstLine}) / ${perLine})))`,
    "  // Beat 3 — the command types itself; the cursor blinks deterministically.",
    `  const typedN = Math.floor(interpolate(frame, [${typeStart}, ${typeStart + typeDur}], [0, ${cmd.length}], {`,
    CLAMP,
    "  }))",
    "  const cursorOn = Math.floor(frame / 14) % 2 === 0",
    `  const breathe = frame > ${settleAt} ? Math.sin((frame - ${settleAt}) * 0.08) * 3 : 0`,
    ...depthMath(total, settleAt),
    "",
    `  const LINES: Array<{ toks: Array<{ t: string; c: string }> }> = ${linesJson}`,
    `  const CMD: string = ${cmdJson}`,
    "",
    "  return (",
    `    <AbsoluteFill style={{ backgroundColor: BG, fontFamily: Fonts.spaceMono.family }}>`,
    "      <AbsoluteFill",
    "        style={{",
    `          background: "radial-gradient(1100px 640px at 50% 38%, ${t.glow}, transparent 70%)",`,
    "          translate: '0 ' + orbFar + 'px',",
    "        }}",
    "      />",
    "      <div",
    "        style={{",
    '          position: "absolute",',
    "          left: 180,",
    "          top: 160,",
    "          width: 380,",
    "          height: 380,",
    "          borderRadius: '50%',",
    `          background: "radial-gradient(circle, ${t.glow} 0%, transparent 70%)",`,
    "          translate: '0 ' + orbNear + 'px',",
    "          zIndex: 2,",
    "        }}",
    "      />",
    `      <div style={{ position: "absolute", left: "50%", top: 150, translate: '-50% 0', opacity: winFade, zIndex: 11, fontSize: 24, letterSpacing: track, fontFamily: Fonts.spaceMono.family, color: ACCENT }}>${t.kicker}</div>`,
    "      <div",
    "        style={{",
    '          position: "absolute",',
    '          left: "50%",',
    '          top: "44%",',
    "          translate: '-50% ' + (winY + breathe) + 'px',",
    "          scale: String((0.92 + 0.08 * winClamped) * push),",
    "          opacity: winFade,",
    "          zIndex: 10,",
    "          width: 1400,",
    "          borderRadius: 20,",
    "          border: '1px solid ' + ACCENT + '44',",
    "          backgroundColor: 'rgba(0,0,0,0.38)',",
    "        }}",
    "      >",
    "        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 28, paddingRight: 28, height: 64, borderBottom: '1px solid ' + ACCENT + '22' }}>",
    "          <div style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: '#FF5F57' }} />",
    "          <div style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: '#FEBC2E' }} />",
    "          <div style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: '#28C840' }} />",
    `          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 14, fontSize: 24, fontFamily: Fonts.spaceMono.family, color: INK }}><Lucide.Terminal size={22} color={ACCENT} />${fn}.tsx</div>`,
    "        </div>",
    "        <div>",
    "          {LINES.map((ln, i) => {",
    `            const d = ${firstLine} + i * ${perLine}`,
    "            const s = spring({ frame: frame - d, fps, config: { damping: 18, mass: 0.5, stiffness: 180 } })",
    `            const y = interpolate(frame, [d, d + 14], [24, 0], {`,
    `              easing: ${EASE_OUT},`,
    '              extrapolateLeft: "clamp",',
    '              extrapolateRight: "clamp",',
    "            })",
    "            return (",
    "              <div",
    "                key={i}",
    "                style={{",
    "                  display: 'flex',",
    "                  alignItems: 'center',",
    "                  height: 56,",
    "                  paddingLeft: 28,",
    "                  paddingRight: 28,",
    "                  backgroundColor: i === active ? ACCENT + '26' : 'transparent',",
    "                  translate: '0 ' + y + 'px',",
    "                  opacity: Math.max(0, Math.min(1, s)),",
    "                }}",
    "              >",
    "                <span style={{ width: 56, fontSize: 24, fontFamily: Fonts.spaceMono.family, color: CMT }}>{String(i + 1).padStart(2, '0')}</span>",
    "                <span style={{ fontSize: 30, lineHeight: 1.2, fontFamily: Fonts.spaceMono.family }}>{ln.toks.map((tk, j) => (<span key={j} style={{ color: tk.c }}>{tk.t}</span>))}</span>",
    "              </div>",
    "            )",
    "          })}",
    "          {(() => {",
    `            const d = ${firstLine} + ${lastIdx} * ${perLine}`,
    "            const s = spring({ frame: frame - d, fps, config: { damping: 18, mass: 0.5, stiffness: 180 } })",
    "            return (",
    "              <div",
    "                style={{",
    "                  display: 'flex',",
    "                  alignItems: 'center',",
    "                  height: 56,",
    "                  paddingLeft: 28,",
    "                  paddingRight: 28,",
    "                  backgroundColor: 5 === active ? ACCENT + '26' : 'transparent',",
    "                  opacity: Math.max(0, Math.min(1, s)),",
    "                }}",
    "              >",
    "                <span style={{ width: 56, fontSize: 24, fontFamily: Fonts.spaceMono.family, color: CMT }}>06</span>",
    "                <span style={{ fontSize: 30, lineHeight: 1.2, fontFamily: Fonts.spaceMono.family, color: INK }}>{CMD.slice(0, typedN)}</span>",
    "                <span style={{ fontSize: 30, fontFamily: Fonts.spaceMono.family, color: ACCENT, opacity: cursorOn ? 1 : 0 }}>▍</span>",
    "              </div>",
    "            )",
    "          })()}",
    "        </div>",
    "        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 28, paddingRight: 28, height: 52, borderTop: '1px solid ' + ACCENT + '22', fontSize: 22, fontFamily: Fonts.spaceMono.family, color: CMT }}><Lucide.GitBranch size={20} color={ACCENT} />main<span style={{ marginLeft: 'auto', color: INK }}>rendered in code</span></div>",
    "      </div>",
    "      <div",
    "        style={{",
    '          position: "absolute",',
    '          left: "50%",',
    "          bottom: 96,",
    "          translate: '-50% ' + counter + 'px',",
    "          opacity: badgeIn,",
    "          zIndex: 20,",
    "          fontSize: 22,",
    "          letterSpacing: 6,",
    "          fontFamily: Fonts.spaceMono.family,",
    "          color: ACCENT,",
    "        }}",
    "      >",
    `        ${t.badge}`,
    "      </div>",
    ...frameChrome(),
    "    </AbsoluteFill>",
    "  )",
    "}",
    "",
  ].join("\n")
  return {
    code,
    plan: {
      title: `${hero} — code terminal ${t.palette}`,
      intent: `Terminal springs in, token-coloured lines cascade with per-line springs, the highlight follows the active line, the render command types itself with a blinking cursor. ${t.palette} stage, spaceMono.`,
      beats: [
        { from: 8, to: 52, what: "terminal window spring entrance scale 0.92→1 + rise 90→0, Easing.bezier(0.16,1,0.3,1)" },
        { from: firstLine, to: firstLine + 5 * perLine, what: "code line cascade per-line spring stagger 16f with active-line highlight sweep" },
        { from: typeStart, to: typeStart + typeDur, what: "command typing via slice + deterministic cursor blink, overlapping the settle" },
        { from: total - 46, to: total, what: "badge resolve, idle breathing hold" },
      ],
      ending: "Full file revealed, command typed, badge held.",
    },
  }
}

/**
 * Overlay lower-third starter — the Overlay-template mechanic.
 *
 * A name/title card for the bottom-left: accent bar wipes in, the name
 * mask-reveals per character, the role cascades per word, and — unlike
 * every other golden — the whole lockup EXITS in the last 30 frames.
 * Lower-thirds that never leave read as burnt-in captions; the exit beat
 * is what makes this broadcast, not decoration.
 */
function buildOverlay(t: Tokens, hero: string, headline: string, total: number): GoldenStarter {
  const H = Math.min(120, heroSize(hero))
  const S = subSize(headline)
  const w0 = 8
  const w1 = w0 + 26
  const n0 = w0 + 12
  const c0 = n0 + 26
  const x0 = Math.max(60, total - 40)
  const x1 = Math.max(90, total - 10)
  const b0 = total - 46
  const b1 = total - 16
  const charsJson = JSON.stringify(hero.toUpperCase())
  const wordsJson = JSON.stringify(headline)
  const code = [
    'import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion"',
    "",
    `const BG = "${t.bg}"`,
    `const INK = "${t.ink}"`,
    `const ACCENT = "${t.accent}"`,
    "",
    "export default function OpeningCut() {",
    "  const frame = useCurrentFrame()",
    "  const { fps } = useVideoConfig()",
    "",
    "  // Beat 1 — accent bar wipes down, the lockup rides it in.",
    ...interp("bar", w0, w1, 0, 1, EASE_OUT),
    ...interp("slide", w0, w1 + 24, -160, 0, EASE_OUT),
    ...interp("fade", w0, w0 + 16, 0, 1, EASE_OUT),
    "  // Beats 2-3 — name mask reveal + role cascade, overlapping the bar.",
    ...interp("mask", n0, n0 + 40, 0, 1, EASE_OUT),
    ...interp("rule", c0, c0 + 24, 0, 1, EASE_OUT),
    ...interp("badgeIn", b0, b1, 0, 1, EASE_OUT),
    "  // Beat 4 — the whole lockup exits: lower-thirds leave, captions stay.",
    ...interp("exit", x0, x1, 0, 1, EASE_IN),
    `  const breathe = frame > ${n0 + 40} && frame < ${x0} ? Math.sin((frame - ${n0 + 40}) * 0.08) * 2 : 0`,
    ...depthMath(total, n0 + 40),
    "",
    `  const chars: string[] = ${charsJson}.split("")`,
    `  const words: string[] = ${wordsJson}.split(" ")`,
    "",
    "  return (",
    `    <AbsoluteFill style={{ backgroundColor: BG, fontFamily: Fonts.${t.text}.family }}>`,
    "      <AbsoluteFill",
    "        style={{",
    `          background: "radial-gradient(1000px 500px at 20% 85%, ${t.glow}, transparent 70%)",`,
    "          translate: '0 ' + orbFar + 'px',",
    "        }}",
    "      />",
    "      <div",
    "        style={{",
    '          position: "absolute",',
    "          left: 160,",
    "          bottom: 180,",
    "          translate: '0 ' + (slide + exit * 60) + 'px',",
    "          scale: String(push),",
    "          opacity: fade * (1 - exit),",
    "          zIndex: 10,",
    "        }}",
    "      >",
    "        <div style={{ display: 'flex', alignItems: 'stretch', gap: 28 }}>",
    `          <div style={{ width: 10, height: 40 + bar * 150, backgroundColor: ACCENT }} />`,
    "          <div>",
    `            <div style={{ fontSize: 24, letterSpacing: track, fontFamily: Fonts.${t.text}.family, color: ACCENT }}>GUEST</div>`,
    "            <div style={{ clipPath: 'inset(0 ' + ((1 - mask) * 100) + '% 0 0)' }}>",
    "              {chars.map((ch, i) => {",
    `                const d = ${n0} + i * 2`,
    "                const s = spring({ frame: frame - d, fps, config: { damping: 16, mass: 0.5, stiffness: 200 } })",
    `                const y = interpolate(frame, [d, d + 14], [50, 0], {`,
    `                  easing: ${EASE_OUT},`,
    '                  extrapolateLeft: "clamp",',
    '                  extrapolateRight: "clamp",',
    "                })",
    "                return (",
    "                  <span",
    "                    key={i}",
    "                    style={{",
    '                      display: "inline-block",',
    `                      fontSize: ${H},`,
    "                      lineHeight: 1,",
    "                      fontWeight: 800,",
    `                      fontFamily: Fonts.${t.display}.family,`,
    "                      color: INK,",
    "                      translate: '0 ' + (y + breathe) + 'px',",
    "                      opacity: Math.max(0, Math.min(1, s)),",
    "                    }}",
    "                  >",
    "                    {ch === \" \" ? \"\\u00A0\" : ch}",
    "                  </span>",
    "                )",
    "              })}",
    "            </div>",
    '            <div style={{ display: "flex", marginTop: 18 }}>',
    "              {words.map((w, i) => {",
    `                const d = ${c0} + i * 5`,
    "                const s = spring({ frame: frame - d, fps, config: { damping: 18, mass: 0.5, stiffness: 180 } })",
    "                return (",
    "                  <span",
    "                    key={i}",
    "                    style={{",
    '                      display: "inline-block",',
    `                      fontSize: ${S},`,
    "                      lineHeight: 1.35,",
    `                      fontFamily: Fonts.${t.text}.family,`,
    "                      color: INK,",
    "                      opacity: Math.max(0, Math.min(1, s * rule)),",
    "                      marginRight: 14,",
    "                    }}",
    "                  >",
    "                    {w}",
    "                  </span>",
    "                )",
    "              })}",
    "            </div>",
    "          </div>",
    "        </div>",
    "      </div>",
    "      <div",
    "        style={{",
    '          position: "absolute",',
    '          left: "50%",',
    "          bottom: 96,",
    "          translate: '-50% ' + counter + 'px',",
    "          opacity: badgeIn,",
    "          zIndex: 20,",
    "          fontSize: 22,",
    "          letterSpacing: 6,",
    `          fontFamily: Fonts.${t.text}.family,`,
    "          color: ACCENT,",
    "        }}",
    "      >",
    `        ${t.badge}`,
    "      </div>",
    ...frameChrome(),
    "    </AbsoluteFill>",
    "  )",
    "}",
    "",
  ].join("\n")
  return {
    code,
    plan: {
      title: `${hero} — lower third ${t.palette}`,
      intent: `Accent bar wipe with riding entrance, masked name cascade, role stagger, full lockup exit. ${t.palette} stage, ${t.display}/${t.text}.`,
      beats: [
        { from: w0, to: w1 + 24, what: "accent bar wipe down + lockup ride-in translateX -160→0" },
        { from: n0, to: n0 + 40, what: "name mask wipe with per-char spring stagger 2f" },
        { from: c0, to: c0 + 60, what: "role cascade per-word spring stagger 5f under a rule wipe" },
        { from: x0, to: total, what: "full lockup exit slide + fade — lower-thirds leave" },
      ],
      ending: "Lockup exited, badge held to the end.",
    },
  }
}

/** Designed starter: palette + fonts + layout from the brief, zero errors by construction. */
export function goldenStarter(context: StarterContext = {}): GoldenStarter {
  const product = (context.product ?? context.brand ?? "SlyxUp").slice(0, 40) || "SlyxUp"
  const headline = (context.headline ?? "Motion that lands").slice(0, 140) || "Motion that lands"
  const seconds = Math.min(30, Math.max(2, Math.round(context.seconds ?? 5)))
  const t = tokensFor(context.mood)
  const seed = hashSeed(`${product}|${headline}|${t.palette}`)
  const variant = seed % 3
  const total = Math.min(900, Math.max(90, seconds * 30))
  const framing = (context.framing ?? "landscape").toLowerCase()
  const frameNote =
    framing.includes("vertical") || framing.includes("9:16")
      ? " Center-safe: keep the action in the middle 1080px for the 9:16 crop."
      : framing.includes("square") || framing.includes("1:1")
        ? " Center-safe: keep the action in the middle 1080px square."
        : ""
  // Code-ish and overlay briefs skip the hash: they get the terminal or
  // the lower-third, not a coin flip. Everything else rolls the 3 variants.
  const hay = `${product} ${headline} ${context.mood ?? ""}`
  const base = /code|typewriter|typing|coding|developer|terminal|snippet|hackathon|software|api\b|sdk|npm|git\b|\bjs\b|javascript/i.test(hay)
    ? buildCode(t, product, headline, total)
    : /lower.?third|chyron|name.?tag|speaker|title.?card|interview/i.test(hay)
      ? buildOverlay(t, product, headline, total)
      : variant === 0
        ? buildStack(t, product, headline, total)
        : variant === 1
          ? buildSplit(t, product, headline, total)
          : buildMask(t, product, headline, total)
  return {
    code: base.code,
    plan: { ...base.plan, intent: base.plan.intent + frameNote },
  }
}

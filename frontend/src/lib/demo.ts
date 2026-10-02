/**
 * A hand-written composition, used by `?demo=1`.
 *
 * This is a real Remotion component written exactly the way the agent writes
 * one — imports, useCurrentFrame, interpolate, spring — and it goes through the
 * identical compile path. So the demo doubles as a smoke test of the browser
 * compiler: if this stops rendering, the pipeline is broken and it shows up
 * immediately rather than being blamed on whatever the model wrote.
 *
 * It also demonstrates the motion the agent is asked for: anticipation, a
 * spring landing with overshoot, overlapping elements, and a masked reveal.
 */
export const DEMO_CODE = `import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion"

const BG = "#0E0F13"
const INK = "#E8EAF0"
const TUNGSTEN = "#FFB340"

const Word = ({ children, delay }: { children: string; delay: number }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = spring({ frame: frame - delay, fps, config: { damping: 200 } })
  const lift = interpolate(enter, [0, 1], [18, 0])
  const fade = interpolate(enter, [0, 1], [0, 1], { extrapolateRight: "clamp" })
  return (
    <span
      style={{
        display: "inline-block",
        // Without an explicit size the span inherits the Player's default and
        // the headline renders at body-text scale.
        fontSize: 64,
        lineHeight: 1.1,
        fontWeight: 600,
        color: INK,
        letterSpacing: "-0.02em",
        whiteSpace: "pre",
        transform: \`translateY(\${lift}px)\`,
        opacity: fade,
      }}
    >
      {children}
    </span>
  )
}

const Logo = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // Anticipation: pull back slightly before the move.
  const anticipate = interpolate(frame, [0, 8, 20], [-0.14, -0.2, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  })

  // Arrival: a spring that overshoots past 1 and settles.
  const pop = spring({ frame: frame - 8, fps, config: { damping: 9, mass: 0.7 } })

  const opacity = interpolate(frame, [6, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "38%",
        transform: \`translate(-50%, -50%) scale(\${anticipate + pop * 0.86})\`,
        opacity,
        display: "flex",
        alignItems: "center",
        gap: 18,
      }}
    >
      <div
        style={{
          width: 74,
          height: 74,
          borderRadius: 18,
          background: TUNGSTEN,
          transform: \`rotate(\${pop * 12}deg)\`,
        }}
      />
      <div style={{ fontSize: 68, fontWeight: 700, color: INK, letterSpacing: "-0.03em" }}>
        SlyxUp
      </div>
    </div>
  )
}

export default function ProductReveal() {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  // The headline overlaps the logo's settle rather than waiting for it.
  const rulePct = interpolate(frame, [26, 52], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  })

  const vignette = interpolate(frame, [0, durationInFrames], [0.55, 0.3])

  return (
    <AbsoluteFill style={{ backgroundColor: BG, fontFamily: "Inter, system-ui, sans-serif" }}>
      <AbsoluteFill
        style={{
          background: \`radial-gradient(1200px 700px at 50% 40%, rgba(255,179,64,0.10), transparent 70%)\`,
          opacity: vignette,
        }}
      />

      <Logo />

      {/* Masked reveal. The outer box is the mask and clips; the inner row
          slides in from the right and stops at 0, so the words are uncovered
          rather than pushed out of frame. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "58%",
          transform: "translateX(-50%)",
          overflow: "hidden",
          height: 92,
          padding: "0 4px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: "100%",
            // rulePct runs 1 → 0 as the reveal completes, so the row slides
            // from fully right (hidden under the mask) to 0 (uncovered).
            transform: \`translateX(\${rulePct * 100}%)\`,
          }}
        >
          {"Motion that lands".split(" ").map((w, i) => (
            <Word key={i} delay={26 + i * 4}>
              {w}
              {i < 2 ? " " : ""}
            </Word>
          ))}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 92,
          transform: "translateX(-50%)",
          display: "flex",
          gap: 6,
        }}
      >
        {["#FFB340", "#5AC8FA", "#7DDC8B", "#FF7A7A", "#E8EAF0"].map((c, i) => {
          const on = interpolate(frame, [34 + i * 5, 40 + i * 5], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
          return (
            <div
              key={c}
              style={{
                width: 26,
                height: 3,
                background: c,
                opacity: on,
                transform: \`scaleX(\${0.4 + on * 0.6})\`,
              }}
            />
          )
        })}
      </div>
    </AbsoluteFill>
  )
}
`

export const DEMO_PLAN = {
  title: "Product Reveal",
  intent: "A logo springs into place with overshoot while a headline masks in beneath it.",
  beats: [
    { from: 0, to: 8, what: "empty dark stage" },
    { from: 8, to: 26, what: "logo springs in from small, overshooting past 1" },
    { from: 26, to: 48, what: "headline masks in per word, overlapping the settle" },
    { from: 48, to: 90, what: "rule of colour ticks on, hold" },
  ],
  ending: "Logo and headline resolved, colour rule settled.",
}

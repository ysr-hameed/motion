import type { CodeArtifact } from "@/lib/artifact"

/**
 * Hand-written showcase compositions.
 *
 * These are real Remotion, written the same way the AI writes: imports,
 * hooks, sequences. They run through the exact runtime path a generated
 * cut takes, so the landing page doubles as a live smoke test of the
 * compiler — if these stop playing, the pipeline is broken and it shows
 * up on the first screen anyone sees.
 */

interface Demo {
  style: string
  prompt: string
  meta: string
  frames: number
  code: string
}

const KINETIC = `import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion"

const HERO = "#FF2D55"

export default function KineticSale() {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  const enter = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  })
  const punch = interpolate(frame, [8, 11, 16], [1, 1.18, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const out = interpolate(
    frame,
    [durationInFrames - 14, durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  )
  const bars = Array.from({ length: 7 }, (_, i) => i)

  return (
    <AbsoluteFill style={{ backgroundColor: "#12030A", overflow: "hidden" }}>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: 90 }}>
        <span
          style={{
            fontFamily: '"Unbounded", system-ui, sans-serif',
            fontSize: 26,
            letterSpacing: 10,
            color: HERO,
            opacity: enter * 0.9,
            marginBottom: 8,
          }}
        >
          LIMITED
        </span>
        <span
          style={{
            fontFamily: '"Unbounded", system-ui, sans-serif',
            fontWeight: 800,
            fontSize: 200,
            lineHeight: 0.92,
            letterSpacing: -10,
            color: "#FFFFFF",
            transform: \`scale(\${punch}) translateX(\${(1 - enter) * 90}px)\`,
            opacity: enter * (1 - out),
          }}
        >
          SALE
        </span>
        <span
          style={{
            fontFamily: '"Space Grotesk", system-ui, sans-serif',
            fontSize: 34,
            color: "#FFFFFF88",
            marginTop: 26,
            opacity: interpolate(frame, [10, 20], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          Up to 60% off everything
        </span>
        <div style={{ display: "flex", gap: 10, marginTop: 54, opacity: enter }}>
          {bars.map((i) => {
            const h = interpolate(
              frame,
              [12 + i * 2, 26 + i * 2],
              [0, 90],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            )
            return (
              <div
                key={i}
                style={{
                  width: 110,
                  height: h,
                  backgroundColor: i % 2 === 0 ? HERO : "#FFFFFF22",
                  borderRadius: 6,
                }}
              />
            )
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
`

const GLITCH = `import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, random } from "remotion"

export default function GlitchLive() {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const hit = frame >= 12 && frame < 30
  const jitter = hit ? (random(\`j-\${Math.floor(frame / 2)}\`) - 0.5) * 26 : 0
  const slices = 9

  return (
    <AbsoluteFill style={{ backgroundColor: "#05070D", overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: \`translateX(\${jitter}px)\`,
        }}
      >
        <span
          style={{
            fontFamily: '"Unbounded", system-ui, sans-serif',
            fontWeight: 800,
            fontSize: 190,
            letterSpacing: -8,
            color: hit ? "#FF2D55" : "#FFFFFF",
            textShadow: hit ? \`\${18 * jitter}px 0 #00E5FF, \${-18 * jitter}px 0 #FF2D55\` : "none",
            opacity: interpolate(frame, [0, 8, durationInFrames - 10, durationInFrames], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          LIVE
        </span>
      </AbsoluteFill>
      {hit &&
        Array.from({ length: slices }, (_, i) => {
          const y = ((i + 1) / (slices + 1)) * 100
          const w = 18 + random(\`w-\${i}\`) * 40
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 0,
                top: \`\${y}%\`,
                width: \`\${w}%\`,
                height: 8,
                backgroundColor: i % 2 ? "#00E5FF" : "#FF2D55",
                transform: \`translateX(\${random(\`s-\${i}-\${Math.floor(frame / 3)}\`) * 30 - 15}px)\`,
                mixBlendMode: "screen",
              }}
            />
          )
        })}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "repeating-linear-gradient(0deg, #0000 0px, #0000 2px, #0006 3px, #0000 4px)",
          opacity: 0.5,
        }}
      />
    </AbsoluteFill>
  )
}
`

const ON_AIR = `import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, random } from "remotion"

export default function OnAirSting() {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const bars = 44

  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(circle at 50% 60%, #10203A 0%, #05070D 70%)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 5,
        }}
      >
        {Array.from({ length: bars }, (_, i) => {
          const seed = random(\`bar-\${i}\`)
          const amp = 40 + seed * 220
          const wave = Math.sin((frame + i * 2.4) * 0.32) * 0.6 + Math.sin((frame + i) * 0.11) * 0.4
          const h = Math.max(6, Math.abs(wave) * amp)
          return (
            <div
              key={i}
              style={{
                width: 8,
                height: h,
                borderRadius: 4,
                backgroundColor: i % 3 === 0 ? "#00E5FF" : "#7C5CFF",
                opacity: 0.35 + seed * 0.6,
              }}
            />
          )
        })}
      </div>
      <span
        style={{
          position: "absolute",
          left: 70,
          bottom: 64,
          fontFamily: '"Unbounded", system-ui, sans-serif',
          fontWeight: 800,
          fontSize: 74,
          letterSpacing: 4,
          color: "#FFFFFF",
          opacity: interpolate(frame, [0, 12, durationInFrames - 12, durationInFrames], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        ON AIR
      </span>
      <div
        style={{
          position: "absolute",
          right: 74,
          top: 68,
          width: 18,
          height: 18,
          borderRadius: 999,
          backgroundColor: "#FF2D55",
          boxShadow: "0 0 28px 8px #FF2D5566",
        }}
      />
    </AbsoluteFill>
  )
}
`

const CELEBRATE = `import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, random, Easing } from "remotion"

const COLORS = ["#FFD166", "#FF2D55", "#00E5FF", "#7C5CFF", "#FFFFFF"]

export default function Celebration() {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const pop = spring({ frame, fps, config: { damping: 9, stiffness: 200 }, durationInFrames: 22 })

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(160deg, #12081F 0%, #1B0B2E 60%, #0B0714 100%)",
        overflow: "hidden",
      }}
    >
      {Array.from({ length: 34 }, (_, i) => {
        const x = random(\`x-\${i}\`) * 100
        const drift = (random(\`d-\${i}\`) - 0.5) * 26
        const fall = interpolate(
          frame,
          [random(\`s-\${i}\`) * 20, durationInFrames],
          [-10, 110],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        )
        const spin = frame * (4 + random(\`v-\${i}\`) * 10)
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: \`\${x}%\`,
              top: \`\${fall}%\`,
              width: 10 + random(\`w-\${i}\`) * 12,
              height: 16 + random(\`h-\${i}\`) * 14,
              backgroundColor: COLORS[i % COLORS.length],
              transform: \`translateX(\${drift}px) rotate(\${spin}deg)\`,
              opacity: 0.9,
              borderRadius: 2,
            }}
          />
        )
      })}
      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span
          style={{
            fontFamily: '"Unbounded", system-ui, sans-serif',
            fontWeight: 800,
            fontSize: 180,
            letterSpacing: -6,
            color: "#FFFFFF",
            transform: \`scale(\${0.6 + pop * 0.4}) rotate(\${(1 - pop) * -6}deg)\`,
            opacity: interpolate(frame, [0, 6, durationInFrames - 10, durationInFrames], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.quad),
            }),
          }}
        >
          YAY!
        </span>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
`

const SPOTS: Demo[] = [
  {
    style: "Kinetic",
    prompt: "bold kinetic sale title, 4 seconds",
    meta: "00:04 · 16:9",
    frames: 120,
    code: KINETIC,
  },
  {
    style: "Glitch",
    prompt: "glitch live bug transition",
    meta: "00:03 · 16:9",
    frames: 90,
    code: GLITCH,
  },
  {
    style: "Waveform",
    prompt: "on air waveform sting, 4 seconds",
    meta: "00:04 · 16:9",
    frames: 120,
    code: ON_AIR,
  },
  {
    style: "Confetti",
    prompt: "confetti celebration pop",
    meta: "00:04 · 16:9",
    frames: 120,
    code: CELEBRATE,
  },
]

export const SHOWCASE: Demo[] = SPOTS

export function showcaseArtifact(index: number): CodeArtifact {
  const d = SPOTS[index] ?? SPOTS[0]!
  return {
    kind: "code",
    code: d.code,
    width: 1920,
    height: 1080,
    fps: 30,
    durationInFrames: d.frames,
  }
}

/**
 * The composer's craft layer: the patterns that separate a cut that looks
 * designed from one that looks generated, written as CODE.
 *
 * WHY THIS EXISTS
 *
 * Prose rules say "depth in layers", "overshoot then settle", "a spring
 * with low damping feels alive". A small model reads that as an intention
 * and writes `opacity + translateY` — the flattest possible cut. The same
 * model, shown the actual `interpolate()` call with the right `easing`, the
 * actual parallax rig and the actual per-character reveal, reproduces it.
 * Prose describes the destination; code is the only thing a model copies.
 *
 * So this block is deliberately code-dense and deliberately short. Every
 * snippet is real Remotion 4.x against the same package set the runtime
 * exposes (see CONTRACTS), and each one is a complete droppable pattern
 * rather than a fragment.
 *
 * The full Remotion reference is NOT pasted in here. Its always-on subset
 * alone is ~7,200 tokens, which buried the operating manual. The composer
 * needs a pattern book; the repairer, which needs the manual, already gets
 * it from `buildKnowledge()` in `remotion-skills.ts`.
 *
 * Kept in its own module (not `remotion-guide.ts`) because it is agent
 * prompt material, not renderer contract, and because it is long enough
 * that mixing it with the contract constants made both hard to read.
 */
export const MOTION_CRAFT = `# MOTION CRAFT — the patterns that make a cut look designed

Copy these shapes. Do not invent your own easing numbers when a shape below
fits. Almost all of the gap between a generated cut and an expensive one is
here, not in the layout.

## 1. Every animated value: one inline interpolate, both clamps
Never a CSS \`transition\` or \`animation\` — neither renders frame-accurately.
Animate \`scale\` / \`translate\` / \`rotate\`, never \`left\`/\`top\` (those reflow the
whole stage), and never a \`transform\` string.

\`\`\`tsx
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";

// inside a component
const frame = useCurrentFrame();
const { fps, height } = useVideoConfig();
const lastFrame = durationInFrames - 1;
const t = Math.max(0, frame - 12);            // a 12-frame hold before anything moves

const scale = interpolate(t, [0, 20], [0.94, 1], {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
  easing: Easing.bezier(0.16, 1, 0.3, 1),     // fast out, long settle
  output: "perceptual-scale",                 // the correct scale interpolation
});

return <AbsoluteFill style={{ scale }}>…</AbsoluteFill>;
\`\`\`

## 2. Springs — damping IS the personality
\`spring({frame, fps, config:{damping, mass, stiffness}})\` is the default
sampler for anything that ARRIVES.

  damping 6-10    overshoots, loose, alive      hero word, a logo landing
  damping 200     precise, settles fast        UI, data, anything that must not wobble
  damping 200+    near-linear, critical        text, captions, long moves

\`\`\`tsx
import { spring, useCurrentFrame, useVideoConfig } from "remotion";

const { fps } = useVideoConfig();
const s = spring({
  frame: frame - 10,
  fps,
  config: { damping: 8 },        // overshoots — hero arrivals only
  durationInFrames: 22,
});
const y = interpolate(s, [0, 1], [40, 0]);
\`\`\`

Anticipation: come in from y: 40, hold one frame, then land. Straight to
target is what makes motion read as a slideshow transition.

## 3. Parallax rig — three planes, three rates
The single biggest lift from "template" to "shot". One push, three speeds.

\`\`\`tsx
const cameraPush = interpolate(frame, [0, lastFrame], [1, 1.07], {
  extrapolateRight: "clamp",
});
// further from camera = moves less
const BACK = 0.4, MID = 0.8, FRONT = 1.4;
const travel = (rate: number) => (1 - cameraPush) * height * 0.5 * rate;

<AbsoluteFill style={{ scale: cameraPush, background: bg }}>
  <div style={{ translate: "0px " + travel(BACK) + "px", opacity: 0.5 }}>grid or gradient</div>
  <div style={{ translate: "0px " + travel(MID) + "px" }}>mid content</div>
  <div style={{ translate: "0px " + travel(FRONT) + "px" }}>hero — sharpest</div>
</AbsoluteFill>
\`\`\`

## 4. Per-character text reveal — highest impact per line
Split, stagger, and PRESERVE THE SPACES or the words glue together.

\`\`\`tsx
const words = "YOUR HEADLINE".split(" ");

{words.map((word, wi) => (
  <span key={wi} style={{ display: "inline-block", whiteSpace: "pre" }}>
    {[...word].map((ch, ci) => {
      const f = frame - 14 - (wi * 3 + ci);        // 3 frames per char, per word
      const o = interpolate(f, [0, 8], [0, 1], {
        extrapolateLeft: "clamp", extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      });
      const y = interpolate(f, [0, 14], [0.5, 0], {
        extrapolateLeft: "clamp", extrapolateRight: "clamp",
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      });
      return (
        <span key={ci} style={{ display: "inline-block", opacity: o, translate: "0px " + y * 24 + "px" }}>
          {ch}
        </span>
      );
    })}
  </span>
))}
\`\`\`

## 5. A backdrop that is never a flat fill
\`\`\`tsx
import { noise2D, useCurrentFrame, interpolateColors } from "remotion";

const bg = interpolateColors(frame, [0, lastFrame], ["#0B0A08", "#141008"]);
// grain that MOVES — static grain reads as a JPEG artifact
const grain = noise2D("g" + frame, frame * 0.06, 0);
\`\`\`
Over the top of \`bg\`: a vignette
(\`radial-gradient(120% 90% at 50% 40%, transparent 30%, rgba(0,0,0,0.55))\`) and at
most ONE saturated accent, on under 10% of the frame.

## 6. Signature moment — pick one, then build the whole cut to land it
A scale punch that overshoots past 1:
\`\`\`tsx
const punch = spring({ frame: frame - heroFrame, fps, config: { damping: 6 } });
const s = interpolate(punch, [0, 1], [1, 1.08, 1]);
\`\`\`
Everything else in the cut exists to set this up. One effect, used once.

## 7. Determinism — no exceptions
- \`random("seed")\` from remotion. Never \`Math.random()\` — it breaks every frame.
- Never \`Date.now()\` / \`new Date()\` / \`performance.now()\`: they differ per frame.
- No \`window\` or \`document\` at module scope.
- Every \`Sequence\` must END inside the canvas length.
- Read \`width\`/\`height\`/\`fps\`/\`durationInFrames\` from \`useVideoConfig()\` and
  scale type and spacing off \`width\`. Never hardcode 1920.

## 8. Never
- One duration and one easing on every element. Vary them.
- Every element arriving on the same frame.
- Default palettes: #22D3EE cyan, #7C5CFF purple, #FF2D55 pink, #10B981
  emerald, or any Tailwind 500 ramp. They are what every generator reaches
  for, and a viewer recognises them as a template instantly.
`
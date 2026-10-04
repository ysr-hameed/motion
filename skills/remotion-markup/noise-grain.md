---
name: noise-grain
description: Film grain and texture with @remotion/noise (installed) plus the deterministic-randomness rules: seeded random() from remotion, never Math.random(). Load for grain overlays, texture, particle fields, organic drift, premium finishes.
---

# Noise + grain (package installed and in scope)

`@remotion/noise` is installed — import from it directly. When adapting to
this player, ALL of the following are REQUIRED:

- fontFamily: `Fonts.*.family`, never Inter/system fonts
- motion via scale / translate / rotate shorthands, never transform strings
- every interpolate() gets extrapolateLeft:"clamp", extrapolateRight:"clamp"
- end the file with a default export; NEVER render <Composition> inside

## Film grain overlay (the premium finish)

```tsx
import { Noise } from "@remotion/noise";

<AbsoluteFill style={{ pointerEvents: "none", opacity: 0.12, zIndex: 14 }}>
  <Noise opacity={1} />
</AbsoluteFill>
```

`Noise` is seeded — identical every render pass, which is exactly what
deterministic rendering requires. Keep overlay opacity 0.08–0.15: visible
as texture on pause, invisible as noise in motion. Above 0.2 it reads as
damage, not film. Grain sits UNDER the vignette (zIndex 14 vs 15) and above
content — it must touch everything or it looks like a dirty layer.

## Deterministic randomness — the hard rule

`Math.random()` in a composition is a BUG, not a shortcut: Remotion renders
frames in parallel across machines, and every pass would roll different
values — flicker, or worse, a different cut per export. The validator
rejects it. The seeded replacement:

```tsx
import { random } from "remotion";
// Seeded by the second arg: same seed → same value on every frame, every pass.
const jitter = (random(`field-${i}`) ?? 0.5) * 8 - 4;
```

Rules: `random()` with NO seed (`random(null)`) is stable within one render
but differs across renders — fine for organic texture, wrong for anything
the eye tracks. Anything the eye tracks (particle positions, star fields,
confetti) gets a STRING seed per item. `random()` returns null on the very
first call shape — always `?? fallback`.

## Organic drift without noise (cheap aliveness)

Frame-driven sine drift needs no package and costs nothing:

```tsx
const drift = frame > landFrame ? Math.sin((frame - landFrame) * 0.08) * 3 : 0;
// translate: '0 ' + (baseY + drift) + 'px'
```

2–4px at 0.08 rad/frame reads as breathing; above 6px reads as floating;
different phases per layer (`+ Math.PI` on the counter layer) read as air,
identical phases read as the whole frame sliding.

## Particle fields (confetti, dust, stars)

- Count: 24–60 items. Under 24 reads as accidents, over 80 costs encode
  time and reads as snow.
- Each particle: seeded position (`random(`px-${i}`)`), seeded size
  (2–6px), seeded fall/rise speed, opacity by depth (far = dimmer).
- Motion: `translateY` from above-frame to below-frame across the beat
  with linear-ish easing + clamps, plus 1–2px sine sway. opacity ramps in
  the first 10 frames of life and out the last 10 — popping in/out reads
  as a bug.
- One accent colour max in a field, the rest ink at varied opacity.
  Multicolour confetti without a brief is a party the user didn't order.

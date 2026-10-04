---
name: spring-physics
description: Organic motion via spring(): preset configs per mood, delayed starts, overshoot landings, spring+interpolate combos, chained springs. Load before writing any entrance, bounce, or settle.
---

# Spring physics

`spring()` is for organic arrivals (entrances, bounces, scaling).
`interpolate()` is for truthful progress (progress bars, fades, scrubbed
timelines). Mixing them up is the #1 cause of motion that feels either
robotic or seasick.

Player scope in every snippet: `frame = useCurrentFrame()`, clamps on every
`interpolate()`, `scale` / `translate` shorthands.

## Prefer spring() for arrivals, interpolate() for progress

Wrong (mechanical arrival):

```tsx
const scale = interpolate(frame, [0, 30], [0, 1], {
  extrapolateLeft: "clamp", extrapolateRight: "clamp",
});
```

Right (organic arrival):

```tsx
const scale = spring({
  frame,
  fps,
  config: { damping: 12, stiffness: 100 },
});
```

## Preset configs — copy, never invent

| Feel | damping | stiffness | mass | Use |
|---|---|---|---|---|
| Snappy | 20 | 200 | 1 | UI elements, minimal cuts |
| Confident (default) | 15-20 | 120 | 0.8 | Hero entrances |
| Bouncy / playful | 8-12 | 100 | 1 | Candy, party, kids briefs |
| Smooth, no bounce | 200 | 100 | 1 | Subtle reveals, prestige fades |
| Heavy / slow | 15 | 80 | 2 | Large objects, logos with weight |
| Tight settle | 25-40 | 140 | 0.9 | Luxury, editorial landings |

House rule (matches `cinematic-motion`): damping 10-14 playful, 15-20
confident, 24-30 prestige. Let the value overshoot past 1.0 and settle —
clamping arrival at exactly 1.0 on the exact end frame reads as dead.

## Delayed start — offset the frame, not the spring

Wrong (springs immediately, then you fight it):

```tsx
const entrance = spring({ frame, fps, config: { damping: 12 } });
```

Right (sleeps until frame 20, then animates 0→1):

```tsx
const DELAY = 20;
const entrance = spring({
  frame: frame - DELAY,
  fps,
  config: { damping: 12, stiffness: 100 },
});
```

Stagger pattern: `frame - (BASE + i * STAGGER)` with STAGGER 4-6f per sibling.

## Overshoot scale landing

```tsx
const bounce = spring({ frame: frame - DELAY, fps, config: { damping: 8, stiffness: 150 } });
// overshoots past 1.0 before settling — apply as scale: bounce
```

## Combine spring + interpolate (map 0-1 to anything)

```tsx
const p = spring({ frame: frame - DELAY, fps, config: { damping: 15, stiffness: 120 } });
const rotate = interpolate(p, [0, 1], [-8, 0], {
  extrapolateLeft: "clamp", extrapolateRight: "clamp",
});
const translateY = interpolate(p, [0, 1], [50, 0], {
  extrapolateLeft: "clamp", extrapolateRight: "clamp",
});
// style: {{ scale: p, rotate: rotate + "deg", translate: "0 " + translateY + "px" }}
```

## Chained springs — overlap, never butt-joint

```tsx
const PHASE_2_START = 25; // starts 5f before phase 1 ends at 30
const phase1 = spring({ frame, fps, config: { damping: 15, stiffness: 120 } });
const phase2 = spring({ frame: frame - PHASE_2_START, fps, config: { damping: 12, stiffness: 100 } });
// phase1 drives the entrance, phase2 drives secondary motion (60% amplitude, opposite or late)
```

Next beat starts 10-15f before the previous ends (`Series.Sequence offset={-15}`).

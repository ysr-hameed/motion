---
name: spring
description: ctx.spring(tSec, config) — analytic springs, damping table, delayed starts, overshoot landings. Load for any settle.
---

# Springs

`ctx.spring(t - startSec, { damping, mass, stiffness, from: 0, to: 1 })` solves the damped harmonic oscillator analytically — identical every scrub and export. `tSec <= 0` returns `from`, so delayed starts hold pre-state for free.

## Damping table — copy, never invent

| Feel | damping | stiffness | mass | Use |
|---|---|---|---|---|
| Snappy | 20 | 200 | 1 | UI elements, minimal cuts |
| Confident (default) | 18 | 120 | 0.8 | Hero entrances |
| Bouncy / playful | 8–12 | 100 | 1 | Candy, party, kids briefs |
| Smooth, no bounce | 200 | 100 | 1 | Subtle reveals, prestige fades |
| Heavy / slow | 15 | 80 | 2 | Large objects, logos with weight |
| Tight settle | 25–40 | 140 | 0.9 | Luxury, editorial landings |

Physics in one line: low damping rings (overshoots past 1, oscillates), high damping glides (no overshoot). Stiffness sets speed, mass sets weight. Overshoot peaks of 1.06–1.12 read as designed; past 1.2 reads as a bug.

## Canonical landing

```js
// Anticipation compress (easeIn), then release with overshoot:
var compress = ctx.interpolate(f, [0, 12], [1, 0.94], { easing: ctx.Easing.easeIn });
var release = ctx.spring(t - 12 / 30, { damping: 18, mass: 0.8, stiffness: 130 });
el.style.scale = f < 12 ? compress : 0.94 + release * 0.12;
```

Display a spring safely: `Math.max(0, Math.min(1.2, s))` for opacity (never below 0), raw for scale (overshoot IS the point).

## Staggered springs (cascades)

```js
var s = ctx.spring(t - (start + i * staggerSec), { damping: 18, mass: 0.5, stiffness: 180 });
el.style.opacity = Math.max(0, Math.min(1, s));
```

2f/char, 4–5f/word, 4–6f/sibling, 16f/code-line. The stagger number is part of the design — name it in the plan.

## Rules

- ✅ At least one spring landing per cut — a cut that only eases to stops feels dead.
- ✅ Let springs overshoot. Clamping arrival at exactly 1.0 on the end frame is what makes motion feel dead.
- ❌ Never `Math.random` for spring variance — `ctx.rand(seed)` or index math.
- ❌ Never spring opacity past 1 without clamping the display value.

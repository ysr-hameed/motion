---
name: spring
description: ctx.spring(tSec, config) — analytic springs, damping table, delayed starts.
---
# Springs

`ctx.spring(t - startSec, { damping, mass, stiffness, from: 0, to: 1 })`.

| Feel | damping | stiffness | mass | Use |
|---|---|---|---|---|
| Snappy | 20 | 200 | 1 | UI, minimal |
| Confident (default) | 18 | 120 | 0.8 | hero entrances |
| Bouncy | 8-12 | 100 | 1 | playful |
| Smooth, no bounce | 200 | 100 | 1 | prestige fades |
| Heavy | 15 | 80 | 2 | logos with weight |
| Tight | 25-40 | 140 | 0.9 | luxury landings |

tSec <= 0 returns `from` — delayed starts hold pre-state for free. Let springs overshoot past 1; clamp DISPLAY with Math.max(0, Math.min(1.2, s)) when needed, never the spring itself.


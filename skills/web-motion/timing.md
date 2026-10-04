---
name: timing
description: t-driven timing — frames vs seconds, beat windows, holds, exits.
---
# Timing (t is the only clock)

- Work in FRAMES for windows (`var f = ctx.frame`), SECONDS for springs (`t - startSec`).
- Convert: frame = round(t * fps), seconds = frame / 30.
- Every beat names [from, to] frames from plan_motion. Overlap beats 10-15f; hold ends ≥15f; exits finish before duration.
- Holds stay alive with `Math.sin(t * 2.4) * 3` drift after the settle frame — never a frozen frame.
- Linear `ctx.interpolate` without easing reads robotic — always pass `easing: ctx.Easing.easeOut` or land with `ctx.spring`.
- Banned: Date.now, performance.now, setInterval, setTimeout-driven styles, Math.random, event handlers, wall-clock CSS animations.


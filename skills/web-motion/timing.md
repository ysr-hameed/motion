---
name: timing
description: t-driven timing — frames vs seconds, duration budgets, beat windows, holds, exits. Load when planning any cut.
---

# Timing (t is the only clock)

Canvas is 1920×1080 at 30fps, clips ≤30s (900f). Household cuts run 2–8s (60–240f).

## Duration budget (frames at 30fps)

| Move | Frames | Notes |
|---|---|---|
| Anticipation dip | 8–15 | easeIn, scale →0.94 |
| UI micro-move | 12–24 | easeOut |
| Hero entrance | 24–45 | easeOut + spring settle |
| Word/char stagger step | 2–5 | 2/char, 4–5/word |
| Beat overlap (handoff) | 10–15 | next starts before prev ends |
| Hold/resolve | ≥15–30 | breathing, never frozen |
| Exit | 15–30 | easeIn, finishes before duration |
| Punch/emphasis | ~24 | overshoot peak 1.06–1.12 |

Scale duration with distance (Material rule): small-area moves stay short, full-traverse moves run long. Exits run SHORTER than entrances — exits need less attention than what comes next.

## Windows, not states

```js
var f = ctx.frame;
var inP = ctx.interpolate(f, [15, 60], [0, 1], { easing: ctx.Easing.easeOut });   // entrance
var holdP = ctx.interpolate(f, [60, 120], [0, 1]);                                 // settle window
var outP = ctx.interpolate(f, [120, 150], [0, 1], { easing: ctx.Easing.easeIn });  // exit
```

- Beats from `plan_motion` become `[from, to]` windows. Overlap 10–15f.
- Final frame RESOLVES — never a hard stop mid-motion. Lower-thirds are the exception: they EXIT (full lockup leaves).
- Frame 1 already has a focal element. Info arrives in order of importance.

## The deterministic clock

- `f` (frames) for windows and staggers. `t` (seconds) for springs, sine drift, counters.
- Convert: `t - frame/30` for spring delays. `Math.floor(f / 14) % 2` for deterministic blinks.
- Idle drift after settle: `f > settleF ? Math.sin((t - settleF/30) * 2.4) * 3 : 0`.
- Banned: `Date.now`, `performance.now`, `setInterval`, timer-driven styles, `Math.random`, event handlers — all validator errors.

## Rules

- ✅ Name every window from the plan's real frame numbers. No magic numbers without a beat.
- ✅ A transition under ~15f is felt, not seen — hold entrances ≥15–24f.
- ❌ Gaps over ~150f with nothing changing read as dead air — bridge with overlap or a holding beat.

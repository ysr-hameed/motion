---
name: easing
description: Easing curve catalog — easeOut entrances, easeIn exits, bezier values, GSAP/Material mappings. Load before timing any beat.
---

# Easing

An easing is the personality of a move. Linear motion reads robotic — every animated element gets an easing or a spring, or the write is refused.

## The house set (use these, in this order)

| Curve | Value | Use |
|---|---|---|
| `ctx.Easing.easeOut` | `bezier(0.16, 1, 0.3, 1)` — expo-out approx | Entrances. The default for 90% of moves: fast start (responsive), long soft landing |
| `ctx.Easing.easeIn` | `bezier(0.4, 0, 1, 1)` | Exits. Ends at peak velocity — the element feels unrecoverable |
| `ctx.Easing.easeInOut` | `bezier(0.65, 0, 0.35, 1)` | Full traversals (pushes, pans) that start AND end at rest |
| `ctx.Easing.linear` | — | Progress hairlines, counters, typed text. Easing *time itself* looks broken |

## Overshoot easings (transforms only — never opacity)

Overshoot on a 0→1-clamped property has nowhere to go. Put these on scale/translate/rotate:

| Curve | Value | Use |
|---|---|---|
| Gentle nudge | `bezier(0.34, 1.3, 0.64, 1)` — back.out(1.3) approx | One clean overshoot, UI emphasis |
| Punch | `bezier(0.34, 1.56, 0.64, 1)` — back.out(1.7) approx | Logo punches, CTA pops (peaks ~1.08) |
| Spring settle | `ctx.spring(...)`, not an easing | Any landing that should ring out — see `spring` |

Long-oscillation easings (elastic/bounce) need 0.7–1.2s to play out. Below ~20 frames the wobble gets crushed and just looks broken — use a spring instead.

## Borrowed standards (same numbers, our dialect)

- Material M3 Emphasized: `bezier(0.05, 0.7, 0.1, 1)` — snappy takeoff, gentle rest. Prestige/tech cuts.
- Material Standard: `bezier(0.2, 0, 0, 1)` — small utility transitions.
- GSAP `power2.out` ≈ `bezier(0.25, 0.46, 0.45, 0.94)` — luxury reveals (marginally softer than easeOut).

## Rules

- ✅ Entrances easeOut, exits easeIn, traversals easeInOut. Asymmetric curves look natural; symmetric ones look mechanical.
- ✅ One easing per `interpolate` call (the runtime takes a single easing fn).
- ❌ Never linear on a visible move. Never ease a progress/time value. Never overshoot opacity.

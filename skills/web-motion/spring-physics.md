---
name: spring-physics
description: Spring + interpolate combos, chained springs, overshoot landings, squash and stretch. Load for advanced settles.
---

# Spring physics

## The three-stop landing (anticipation → overshoot → settle)

Every hero move is a 3-stop keyframe sequence, never a single A→B slide:

```js
// 1. Anticipation: dip opposite first (4-12f wind-up, easeIn)
var dip = ctx.interpolate(f, [0, 12], [1, 0.94], { easing: ctx.Easing.easeIn });
// 2-3. Overshoot + settle: spring rings 0.94 → ~1.08 → 1.00
var land = ctx.spring(t - 12 / 30, { damping: 16, mass: 0.8, stiffness: 130 });
el.style.scale = f < 12 ? dip : 0.94 + land * 0.12;
```

Or as one keyframed interpolate: `ctx.interpolate(f, [15, 30, 60], [0.94, 1.08, 1], { easing: ctx.Easing.easeOut })`.

## Chained springs (overlap, never butt-joint)

```js
var phase1 = ctx.spring(t - 0.4, { damping: 15, mass: 1, stiffness: 120 });
var phase2 = ctx.spring(t - 0.9, { damping: 12, mass: 1, stiffness: 100 }); // starts before phase1 ends
```

Next beat starts 10–15f before the previous ends. Elements cross-dissolve rather than cut.

## Squash and stretch (Disney #1, motion-graphics edition)

Give landings weight: compress on anticipation, stretch along the motion vector, overshoot on arrival. Volume is preserved by counter-scaling — stretch Y by 1.08 while squeezing X to 0.94:

```js
el.style.scale = "0.94 " + (0.94 + land * 0.14); // X squeezes while Y overshoots... then both settle to 1
```

Use sparingly: one squash element per cut. Everywhere reads as jelly.

## Spring + interpolate combos

- Position via `interpolate` (deterministic path), scale/opacity via `spring` (organic landing) on the SAME element — the combo reads expensive.
- Counter-motion: secondary element springs with a LATER start and OPPOSITE vector at 20–60% amplitude.
- Idle after settle: `Math.sin(t * 2.4) * 3` px breathing added to the settled translate — the hold stays alive.

## Rules

- ✅ Springs take SECONDS (`t - startSec`), windows take FRAMES (`f`). Never mix the units.
- ✅ Damping from the table in `spring`, never from memory.
- ❌ A spring with no visible overshoot is just an expensive ease — check the peak exceeds 1.02.

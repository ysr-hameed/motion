---
name: animations
description: General animation recipes — entrances, emphasis, loops, holds, exits. Load for beat-level moves.
---

# Animations

## Entrance (the workhorse, 24–45f)

Translate + fade + spring scale, easeOut, with anticipation when it matters:

```js
var rise = ctx.interpolate(f, [15, 60], [54, 0], { easing: ctx.Easing.easeOut });
var fade = ctx.interpolate(f, [15, 32], [0, 1], { easing: ctx.Easing.easeOut });
var land = ctx.spring(t - 15 / 30, { damping: 18, mass: 0.8, stiffness: 130 });
el.style.translate = "0 " + rise + "px";
el.style.opacity = fade;
el.style.scale = String(0.94 + land * 0.06);
```

## Emphasis (24f punch)

```js
var punch = ctx.interpolate(f, [s, s + 24], [0, 1], { easing: ctx.Easing.easeOut });
el.style.scale = String(1 + Math.sin(punch * Math.PI) * 0.08); // 1 → 1.08 → 1
```

Scale past 1 needs room — keep punch elements clear of `overflow: hidden` edges or switch to a non-overshoot ease.

## Honest loops (still pure functions of t)

```js
var lt = (t - start) % span;                    // repeating ticks, pulses, scans
var blink = Math.floor(f / 14) % 2 === 0;       // deterministic cursor
cursor.style.opacity = blink ? 1 : 0;
```

## Holds (never frozen)

After the settle frame: `Math.sin(t * 2.4) * 3` px breathing on the settled translate, plus counter-drift on the badge. A 120f+ cut with no drift reads as paused footage.

## Exits (15–30f, easeIn)

```js
var exit = ctx.interpolate(f, [x0, x1], [0, 1], { easing: ctx.Easing.easeIn });
el.style.translate = "0 " + (exit * 60) + "px";
el.style.opacity = 1 - exit;
```

## Follow-through & overlapping action (Disney)

Different parts stop at different times: hero lands first, sub 4f later, badge drifts opposite, decor keeps parallaxing. Offset every layer's settle — simultaneous stops read mechanical.

## Arcs (Disney)

Living things move in arcs, not straight lines. Pair every Y move with a small X drift (or rotate ±2–12°) so entrances curve: `translate = xDrift + " " + y + "px"` with x from its own interpolate. Counter-rotation on emblems (ring spins 12° while core pops) is the cheap version.

## Rules

- ✅ One focal move at a time. Secondary motion at 20–60% amplitude.
- ✅ Exaggerate intent: sadder, bolder, snappier — then pull back 10%. Timid motion reads as a bug.
- ❌ Opacity-only animation. Fading is the weakest change — add direction (translate/scale/rotate).

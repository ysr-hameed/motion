---
name: interpolate
description: ctx.interpolate(x, inputs, outputs, { easing }) — clamped piecewise mapping, multi-stop keyframes, string building. Load for any driven value.
---

# Interpolate

```js
var y = ctx.interpolate(f, [15, 75], [54, 0], { easing: ctx.Easing.easeOut });
el.style.translate = "0 " + y + "px";
```

- Piecewise: N inputs, N outputs, eased per segment with ONE easing fn.
- **Clamped by default.** Past its window the value holds — no extrapolate options exist, no blank-frame drift. Ever.
- Interpolate NUMBERS, then build strings. Never interpolate a string.

## Multi-stop keyframes (the motion-graphics workhorse)

```js
// compress → overshoot → land across frames 15→60:
var s = ctx.interpolate(f, [15, 30, 60], [0.94, 1.08, 1], { easing: ctx.Easing.easeOut });
// mask wipe + per-char springs share one progress:
var mask = ctx.interpolate(f, [10, 54], [0, 1], { easing: ctx.Easing.easeOut });
clip.style.clipPath = "inset(0 " + ((1 - mask) * 100) + "% 0 0)";
```

Three or more stops read as choreography. Two stops read as a slide. A cut with only 2-stop moves reads as basic no matter the palette.

## Mapped ranges

```js
// Progress hairline — LINEAR (easing time itself looks broken):
var progress = ctx.interpolate(f, [0, total], [0, 1]);
// Counter:
var n = Math.round(ctx.interpolate(f, [s, e], [0, target], { easing: ctx.Easing.easeOut }));
// Scroll/parallax factor shared by layers:
var k = ctx.interpolate(f, [s, e], [0, 1], { easing: ctx.Easing.easeOut });
bg.style.translate = (k * -20) + "px 0"; fg.style.translate = (k * -80) + "px 0";
```

## Rules

- ✅ `x` is `f` (frames) for windows, `t` for continuous values, or a derived 0→1 progress for chained mappings.
- ✅ Every call gets an easing — EXCEPT honest-time values (progress, counters-while-typing, typed text), which stay linear.
- ❌ Never hand-roll lerp chains when one multi-stop interpolate does it.
- ❌ Never `Math.floor` a window input to fake steps — design the stops instead.

---
name: interpolate
description: ctx.interpolate(x, inputs, outputs, { easing }) — clamped piecewise mapping.
---
# Interpolate

```js
var y = ctx.interpolate(f, [15, 75], [54, 0], { easing: ctx.Easing.easeOut });
var mask = ctx.interpolate(f, [10, 54], [0, 1], { easing: ctx.Easing.easeOut });
el.style.clipPath = "inset(0 " + ((1 - mask) * 100) + "% 0 0)";
```

- Multi-stop keyframes: `ctx.interpolate(f, [15, 30, 60], [0.94, 1.08, 1], { easing: ctx.Easing.easeOut })`.
- Clamping is DEFAULT. There are no extrapolate options.
- Interpolate NUMBERS, then build strings — never interpolate a string.
- Opacity/scale windows that end before duration hold their end value automatically.


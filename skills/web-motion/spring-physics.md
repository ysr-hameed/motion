---
name: spring-physics
description: Spring + interpolate combos, chained springs, overshoot landings.
---
# Spring physics

Combine: anticipation compress (interpolate 1→0.94, easeIn) then release (spring overshoot to 1.06-1.12, settle to 1.00).

```js
var compress = ctx.interpolate(f, [0, 12], [1, 0.94], { easing: ctx.Easing.easeIn });
var release = ctx.spring(t - 12 / 30, { damping: 18, mass: 0.8, stiffness: 130 });
el.style.scale = f < 12 ? compress : 0.94 + release * 0.12;
```

Chained beats: two springs with offset starts (`t - p2start`). Overlap, never butt-joint.


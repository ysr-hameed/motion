---
name: parameters
description: Tunable constants — UPPER_SNAKE_CASE COLOR/TEXT/TIMING/LAYOUT blocks.
---
# Parameters

Top of render(): ALL tunable values as UPPER_SNAKE_CASE consts so users customize without reading logic:

```js
var BG = "#0B0C10", INK = "#F2F3F7", ACCENT = "#FFB340";
var HERO_PX = 140, EASE = ctx.Easing.easeOut, DAMP = 18;
```

Durations derive from meta.duration; beats derive from plan frames. One duration change must not require retyping every number — compute windows from named starts.


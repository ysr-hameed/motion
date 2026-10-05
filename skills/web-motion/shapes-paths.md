---
name: shapes-paths
description: SVG path reveals — line draws, stroke-dashoffset progress, dot riders, morphs. Load for charts and line art.
---

# Shapes & paths

## Line draw (the signature move)

```html
<svg width="1200" height="300" viewBox="0 0 1200 300">
<path id="trace" d="M0,250 C300,250 600,80 1200,60" fill="none" stroke="#FFB340" stroke-width="6"/>
<circle id="dot" r="10" fill="#FFB340"/>
</svg>
```

```js
var LEN = 1320; // measure once (getTotalLength in a scratch page), hardcode it
var p = ctx.interpolate(f, [s, e], [0, 1], { easing: ctx.Easing.easeOut });
path.style.strokeDasharray = String(LEN);
path.style.strokeDashoffset = String(LEN * (1 - p));
// Dot rides the head: precompute N points in init(), index = floor(p * (N - 1))
dot.setAttribute("cx", PTS[i][0]); dot.setAttribute("cy", PTS[i][1]);
```

Measure path length ONCE during authoring and hardcode it. Never call `getTotalLength()` per frame in render (layout thrash × 150 frames).

## Dot rider

Precompute 60–120 points along the path in `init()` (even `t` samples through the same easing), then index by progress. The dot sells the draw — a line that draws itself with no head reads unfinished.

## Morphs (shape/color transitions)

Morph VALUES, not path strings: `borderRadius 50%→8px`, `scale`, `interpolate`d colors via `ctx.interpolate` channel math. True path morphs need matched point counts — avoid unless the brief demands it.

## Clip reveals for groups

Wrap chart groups in `<div style="overflow:hidden">` and slide the inner row, or drive a parent `clipPath` inset. Same wipe grammar as `transitions`, applied to data.

## Rules

- ✅ `fill="none"` on trace paths. `stroke-linecap="round"` always.
- ✅ Keep SVG node counts small (<200). One path + one dot beats twenty segments.
- ❌ Animating the `d` attribute per frame — expensive and usually wrong. Animate dashoffset/opacity/transform.

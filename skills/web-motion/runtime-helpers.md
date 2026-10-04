---
name: runtime-helpers
description: The ctx helper API inside render(t, ctx) — interpolate, Easing, spring, rand, DOM access.
---
# Runtime helpers (ctx)

Every bundle script runs after this library loads. Inside `render(t, ctx)`:

- `ctx.frame` — integer frame (t * fps). `ctx.t` — seconds. `ctx.fps`, `ctx.duration`, `ctx.W`, `ctx.H`.
- `ctx.interpolate(x, [a, b, ...], [v0, v1, ...], { easing })` — piecewise, CLAMPED by default. No extrapolate options exist.
- `ctx.Easing.linear / .easeIn / .easeOut / .easeInOut / .bezier(x1, y1, x2, y2)`.
- `ctx.spring(tSec, { damping, mass, stiffness, from, to })` — analytic damped spring. tSec <= 0 returns `from`, so delayed starts are `ctx.spring(t - delaySec, {...})`. Damping guide: 10-14 playful, 15-20 confident, 24-30 prestige.
- `ctx.rand(seed)` — seeded PRNG factory. NEVER Math.random.
- `ctx.el(id) / ctx.q(sel) / ctx.qa(sel)` — DOM access scoped to #wm-stage.
- `ctx.clamp(v, a, b)`, `ctx.lerp(a, b, k)`.

```js
function render(t, ctx) {
  var f = ctx.frame;
  var p = ctx.interpolate(f, [15, 75], [0, 1], { easing: ctx.Easing.easeOut });
  var land = ctx.spring(t - 15 / 30, { damping: 18, mass: 0.8, stiffness: 130 });
  var el = ctx.el("hero");
  el.style.translate = "0 " + ctx.interpolate(f, [15, 75], [54, 0], { easing: ctx.Easing.easeOut }) + "px";
  el.style.scale = String(0.94 + land * 0.06);
  el.style.opacity = p;
}
```


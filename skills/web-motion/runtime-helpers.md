---
name: runtime-helpers
description: The ctx helper API inside render(t, ctx) — interpolate, Easing, spring, rand, DOM access. Load before writing any bundle JS.
---

# Runtime helpers (ctx)

Every bundle script runs after this library loads in the sandbox. Inside `render(t, ctx)`:

- `ctx.frame` — integer frame (`t * fps`). `ctx.t` — seconds. `ctx.fps`, `ctx.duration`, `ctx.W`, `ctx.H`.
- `ctx.interpolate(x, [a, b, ...], [v0, v1, ...], { easing })` — piecewise mapping, **clamped by default** (no extrapolate options exist). Interpolate NUMBERS, then build strings.
- `ctx.Easing.linear / .easeIn / .easeOut / .easeInOut / .bezier(x1, y1, x2, y2)` — see `easing` for the catalog.
- `ctx.spring(tSec, { damping, mass, stiffness, from, to })` — analytic damped spring. `tSec <= 0` returns `from`, so delayed starts are `ctx.spring(t - delaySec, {...})`. See `spring`.
- `ctx.rand(seed)` — seeded PRNG factory. NEVER `Math.random` (validator error).
- `ctx.el(id) / ctx.q(sel) / ctx.qa(sel)` — DOM access scoped to `#wm-stage`.
- `ctx.clamp(v, a, b)`, `ctx.lerp(a, b, k)`.

Canonical shape — copy this skeleton, never invent your own clock:

```js
function init(ctx) {
  // Build repeated nodes ONCE (spans per char/word, bars, ticks).
}
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

Rules:

- ✅ Work in FRAMES for windows (`f`), SECONDS for springs (`t - startSec`).
- ✅ One statement per line. Direct style assignments. No registries, no factories.
- ✅ `var f = ctx.frame;` first line of every render.
- ❌ No imports/exports, no `<script>` tags, no `Date.now`/`performance.now`, no `setInterval`, no event handlers, no `eval` — all validator errors.
- ❌ No `<!--` or `<script` sequences even in comments — they corrupt the preview document.

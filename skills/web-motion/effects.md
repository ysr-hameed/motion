---
name: effects
description: Glow, grain, vignette, parallax, punch-zoom — cheap GPU-friendly effects. Load for atmosphere and depth.
---

# Effects

Effects are seasoning: felt, not seen. One scene, max two of these.

## Vignette (every cut)

```css
.vignette{position:absolute;inset:0;z-index:15;pointer-events:none;
background:radial-gradient(120% 90% at 50% 45%,transparent 55%,rgba(0,0,0,0.42) 100%)}
```

Static. Grounds the edges, focuses the eye. Costs nothing.

## Glow blob (hero support)

```css
.glow{position:absolute;left:50%;top:38%;width:1100px;height:640px;transform:translate(-50%,0);
background:radial-gradient(closest-side,rgba(255,179,64,.12),transparent 70%)}
```

Accent at 10–14% alpha. Drift it with parallax (20% of fg travel) so it feels like light, not paint.

## Parallax rig (Z-depth without 3D)

```js
var k = ctx.interpolate(f, [0, total], [0, 1], { easing: ctx.Easing.bezier(0.25, 0.1, 0.25, 1) });
bg.style.translate = "0 " + (k * -20) + "px";   // 20% — far
mid.style.translate = "0 " + (k * -40) + "px";  // 60% — mid
fg driven by beats at 100%
```

## Punch-zoom (intent without movement)

```js
var push = ctx.interpolate(f, [0, total], [1, 1.045], { easing: ctx.Easing.bezier(0.25, 0.1, 0.25, 1) });
stage.style.scale = String(push);
```

1→1.045 across the whole cut. The audience feels forward motion; nothing visibly moves.

## Film grain (see `noise-grain`)

Seeded SVG turbulence `::after` overlay, 0.10–0.14 opacity. Deterministic across scrubs. Never per-frame canvas noise (export cost), never `Math.random` grain.

## Cost discipline

- ✅ Transforms + opacity only. Precompute static values outside per-frame work.
- ✅ Blur is the most expensive effect in the sandbox — one small blurred layer max, or fake it with gradients.
- ❌ Per-frame `backdrop-filter`, displacement, or noise redraws. The export snapshots every frame — expensive effects multiply by 150+.

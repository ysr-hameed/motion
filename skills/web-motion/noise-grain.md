---
name: noise-grain
description: Film grain via seeded SVG turbulence — deterministic across scrubs and export. Load for texture.
---

# Noise & grain

Grain is what makes digital gradients feel like film. The rule: **seeded and static**, never random per frame.

## The recipe (copy verbatim, recolor per palette)

```css
.grain::after{content:"";position:absolute;inset:0;opacity:.12;pointer-events:none;
background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");}
```

- `fractalNoise` (not `turbulence`) reads as film. `baseFrequency 0.8–1.0` for fine grain, `0.3–0.5` for coarse.
- Opacity 0.10–0.14. More reads as dirt, less is invisible.
- One overlay div per scene, z-index above bg below content.

## Animate it (subtly or not at all)

Static grain still reads as film. If it must move: shift `background-position` from `t` in render (steps of 40px every ~10f — stepped drift reads as gate weave, smooth drift reads as swimming).

```js
grain.style.backgroundPosition = (Math.floor(f / 10) * 40) + "px 0";
```

## Rules

- ✅ Seeded SVG turbulence. Identical every scrub, identical in export.
- ❌ `Math.random` grain (validator error anyway). ❌ Per-frame canvas noise (export cost × frames). ❌ Opacity over 0.2.

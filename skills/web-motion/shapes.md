---
name: shapes
description: CSS/SVG shapes — rings, bars, grids, blobs, badges, emblems. Load for decor and lockups.
---

# Shapes

Build shapes in markup/CSS, animate from `t`. Decor sits at z-index 1–3, content at 10, overlays 20, badge/UI 30–40.

## The kit

```html
<div class="ring"></div>          <!-- dashed orbit ring -->
<div class="core"></div>          <!-- filled disc -->
<div class="bar" id="bar"></div>  <!-- accent rule, width from t -->
<div class="grid"></div>          <!-- repeating-linear-gradient -->
<div class="badge" id="badge">WATCH TO THE END</div>
```

```css
.ring{width:480px;height:480px;border-radius:50%;border:3px dashed #FFB34066}
.core{width:200px;height:200px;border-radius:50%;background:#FFB34022}
.grid{position:absolute;inset:-24px;background:repeating-linear-gradient(90deg,transparent 0 118px,#FFB34014 118px 120px)}
```

Overscan full-bleed decor ±24px so parallax drift never reveals an edge.

## Animate them

```js
ctx.el("ring").style.rotate = spin + "deg";       // counter-rotation, 0→12°
ctx.el("core").style.scale = String(pop);          // 0.5→1 spring pop
ctx.el("bar").style.width = (8 + bar * 140) + "px"; // accent rule wipe
```

- Emblem formula: dashed ring (slow rotate) + filled core (spring pop) + centered mark (triangle/icon). Right-side placement for split layouts.
- Rules/bars wipe by WIDTH from an eased 0→1, never scaleX on text-adjacent elements (text would squash — bars are shapeless, safe).
- Grid drift: `translate` at parallax-far speed. Subtle or off.

## Icons

No icon package exists in the sandbox. Icons are inline `<svg>` (24×24 viewBox, `stroke="currentColor"`, round caps) with Lucide path data, or pure CSS shapes. Never an `<img>` to an icon CDN (CORS breaks export snapshots).

Simple safe marks: play triangle `<polygon points="7,4 20,12 7,20"/>`, plus/cross lines, dots, ticks. Complex paths must be verified — a wrong `d` renders as garbage, and the audit can't tell.

## Rules

- ✅ Three hues max across the whole cut (bg + ink + ONE accent).
- ✅ Decor never shares coordinates with text. Check the audit overlap findings.
- ❌ More than ~200 SVG nodes — the sandbox re-renders every frame.

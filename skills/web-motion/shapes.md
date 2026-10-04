---
name: shapes
description: CSS/SVG shapes — rings, bars, grids, blobs, badges.
---
# Shapes

Build shapes in markup/CSS, animate from t:

```html
<div class="ring"></div>
```
```css
.ring{width:480px;height:480px;border-radius:50%;border:3px dashed #FFB34066}
```
```js
ctx.el("ring").style.rotate = spin + "deg"; // spin from ctx.interpolate
```

- Rings, rules, grids (repeating-linear-gradient), dots, blobs (border-radius: 50% + radial-gradient).
- Icons are inline <svg>, never icon fonts or packages.
- Decor sits at z-index 1-3, content at 10, overlays at 20, UI/badge at 40.


---
name: images
description: Images — https URLs, crossOrigin, sizing, Ken Burns, fallbacks. Load for photographic cuts.
---

# Images

## The contract

```html
<img src="https://images.unsplash.com/...?w=1920&q=80&auto=format&fit=crop" crossOrigin="anonymous" alt="">
```

- `crossOrigin="anonymous"` is REQUIRED for export snapshots to paint (foreignObject taint rules). Without it: previews fine, exports blank. The validator warns; fix it, don't ship past it.
- https only (sandbox CSP blocks http). Size to 1920w. Under-1080p sources soften on upscale — prefer vector/logo art for heroes.
- Never invent URLs. No image = CSS gradient + text stand-in (see `effects`).

## Motion (Ken Burns, t-driven)

```js
var k = ctx.interpolate(f, [s, e], [0, 1], { easing: ctx.Easing.easeInOut });
img.style.scale = String(1 + k * 0.08);
img.style.translate = (k * -30) + "px " + (k * -15) + "px";
```

Slow (full-beat), easeInOut, ≤1.1 scale. Overscan the image 10% so edges never show. Show/hide by `t` windows; cross-dissolve swaps over 10–15f.

## Treatment (taste, not filters)

- Duotone: accent overlay at 20–30% + `filter: saturate(.8)` — brand-stamps any stock photo.
- Vignette + grain over photography (see `effects`, `noise-grain`) — unifies mixed sources.
- Text over photos needs a scrim (bottom gradient, black 0→60%) or it fails contrast. The audit measures boxes, not contrast — check it yourself.

## Rules

- ✅ crossOrigin always. ✅ Overscan for moves. ✅ Scrim under text.
- ❌ Hotlinked URLs you can't verify (they die, taking the cut with them). ❌ Text directly on busy photos.

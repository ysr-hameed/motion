---
name: code-syntax
description: Code Hike-style code animations — token lines, highlight sweep, typing, cursor, terminal chrome. Load for code/dev briefs.
---

# Code syntax

The mechanic: a terminal window springs in, token-colored lines cascade, the highlight follows the active line, a command types itself, a cursor blinks. All-mono ('Space Mono'), zero dependencies.

## The 4 beats (~150f)

1. **Window springs in** (8→52f): scale 0.92→1 + translateY 90→0, easeOut, `damping: 18, mass: 0.9, stiffness: 120`.
2. **Lines cascade**: one spring per line, start `first + i * 16`, translateY 24→0 + opacity from the same spring. Stagger IS readability — never reveal all lines at once.
3. **Active-line sweep**: `active = min(LAST, max(0, floor((f - first) / per)))`, row background accent at 15% (`ACCENT + '26'`). Pure function of `f` — identical every render.
4. **Typing + cursor**: `CMD.slice(0, typedN)` where `typedN = floor(interpolate(f, [typeStart, typeStart + dur], [0, CMD.length]))` — type ONE single-string line, never per-token (slicing tokens splits colors mid-word). Cursor: `Math.floor(f / 14) % 2` deterministic blink.

## Structure

```js
function init(ctx) {
  // Rows once: line-number span + token spans (color per token), then the cmd row.
}
function render(t, ctx) {
  // Per row i: d = first + i * per; spring translate/opacity; background = i === active ? wash : transparent.
  // cmdText.textContent = CMD.slice(0, typedN); cursor.style.opacity = blink;
}
```

Terminal chrome: traffic dots (CSS circles), filename tab, footer status bar. Token colors: keywords accent, strings green, comments gray — passed as data, not computed.

## Rules

- ✅ All-mono, always. Token colors as DATA (arrays), highlighting as STATE (active index from `f`).
- ✅ Type into single strings. Deterministic cursor. 16f line stagger.
- ❌ Per-token typing. ❌ Random blink (`setInterval` — validator error anyway). ❌ Proportional faces in code.

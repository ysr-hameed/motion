---
name: example-typewriter-highlight
description: Working cut to imitate — terminal typewriter with highlight sweep, typing, cursor. Load for code/typewriter briefs.
---

# Example: typewriter highlight

Imitate the STRUCTURE, never copy verbatim. Convert to bundle scope (html markup, CSS, `render(t, ctx)`).

## Beat map (150f @30fps)

| Frames | What |
|---|---|
| 8–52 | Terminal window springs in: scale 0.92→1 + translateY 90→0, easeOut, `damping: 18, mass: 0.9, stiffness: 120` |
| 26–106 | Code lines cascade: one spring per line, start `26 + i * 16`, translateY 24→0 + opacity from the same spring |
| 26–106 | Active-line sweep: `active = min(LAST, max(0, floor((f - 26) / 16)))`, row wash accent at 15% |
| 118–150 | Command types via `CMD.slice(0, typedN)`; deterministic block cursor `floor(f / 14) % 2` |
| 104–150 | Badge resolve + idle breathing hold |

## Structural rules this cut teaches

- Token colors are DATA (arrays of `{t, c}`), highlighting is STATE (active index from `f`). Never compute colors per frame.
- Type ONE single-string line (`slice`), never per-token — slicing tokens splits colors mid-word.
- All-mono ('Space Mono'). Kicker tracked (`letterSpacing` opens as the window lands).
- Terminal chrome: traffic dots, filename tab, footer status bar — CSS circles and bars, zero images.

## Convert to bundle scope

Markup (window, rows container, cmd row, badge) in html. Mono + sizes in CSS. `init()` builds rows from data; `render()` sets per-row translate/opacity/highlight + cmd slice + cursor + badge. Clamps are runtime-default — no extrapolate options.

---
name: example-text-rotation
description: Working cut to imitate — headline rotation with counter-motion sub. Load for rotating-message briefs.
---

# Example: text rotation

## Beat map (per variant ~60f: 15 in, 30 hold, 15 out)

- Variant A exits (translateY 0→-100% easeIn + fade, 15f) WHILE variant B enters (100%→0 easeOut + spring settle, 18f). Overlap, never sequential.
- Sub counter-moves OPPOSITE at 30% amplitude on the same progress value (depth without parallax layers).
- 15f hold per variant so each reads as intentional, not a glitch. Em-dash or rule wipe marks the swap.

## Structural rules

- Variants stacked absolutely in a masked slot; only transforms + opacity change (never display:none toggles — they pop in export).
- Rotate flavor: `rotateX` flip (perspective 900px on parent) for tech, masked slide for editorial. Pick ONE per cut.
- Counter: `subY = -variantY * 0.3`. Same easing family, smaller amplitude.

## Convert to bundle scope

Variant divs + sub in html. `render()` computes active index from `f`, sets per-variant translate/opacity, sub counter-translate. All windows from the plan's real frames.

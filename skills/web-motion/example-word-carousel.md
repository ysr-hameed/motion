---
name: example-word-carousel
description: Working cut to imitate — rotating word carousel with masked slot. Load for alternating-word briefs.
---

# Example: word carousel

## Beat map (words cycle every ~45f)

- Slot: `overflow: hidden` fixed-height div, one word visible.
- Outgoing word: translateY 0→-100% easeIn over 12f. Incoming: 100%→0 easeOut over 18f, 8f overlap.
- Active index: `floor((f - start) / span) % words.length`. Pure function of `f` — scrub-safe.
- Static words dim to 35% while the slot cycles (focus physics: the moving word is the only full-ink element).

## Structural rules

- Slot height = 1.1× font-size (descenders clip otherwise). `line-height: 1` inside.
- Ease the ARRIVAL (easeOut on incoming), not the departure — departures can be brisk easeIn.
- 15f hold per word minimum. Faster reads as glitching.
- Width: slot is `inline-block` with `min-width` in `ch` units of the longest word, centered — no layout jump between words.

## Convert to bundle scope

Slot + word spans in html (all words present, toggled by `f`). `render()` sets per-word translate/opacity from the active index math. Stagger is inherent (one active at a time).

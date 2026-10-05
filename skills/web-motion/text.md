---
name: text
description: Type mechanics in bundles — markup, sizing, tracking, line-height, tabular numbers. Load for any text.
---

# Text

Type lives in REAL elements in the html part (selectable, measurable, auditable) — never canvas-drawn, never images of text.

## Sizing (1920×1080 canvas — validator-enforced)

| Role | px | lineHeight | Use |
|---|---|---|---|
| Hero | 130–200 | 0.95–1.05 | one line, one idea |
| Sub | 64–96 | 1.0–1.2 | supporting line |
| Body | 32–44 | 1.3–1.5 | labels, sentences |
| Caption | 24–28 | 1.3–1.5 | fine print, legal |
| Kicker | 20–24 | 1.4, tracking 6–9px | eyebrows, kickers |

Floor 18 (unreadable below), ceiling 320 (fills the frame). Long copy gets smaller px: hero 170→140→112→92 by length. Script faces render ~30% small — size at 1.4×.

## Mechanics

- Split to spans in `init()` for per-char/word motion. `white-space: pre` preserves spacing; `\u00A0` for intentional spaces.
- Tracking punches: `letterSpacing` opens as the hero lands (`ctx.interpolate(f, [15, settle], [2, 9])`).
- NEVER animate `fontSize` — it re-lays-out every frame and jitters. Animate translate/scale/opacity + letterSpacing.
- Counters: `font-variant-numeric: tabular-nums` so digits don't jitter.
- Headline ≤5 words for hero scale. Tagline as sub. Pick ONE headline pair per cut — never stack three.

## Hierarchy in one lockup

Kicker (accent, tracked) → hero (display, tight) → sub (text face, 64–96) → rule/bar (accent, wiped) → badge (tracked, bottom). One flex column, one idea per line, reading order = arrival order.

## Rules

- ✅ Display lineHeight 0.95–1.05, body 1.3–1.5. Tight display, open body.
- ✅ Keep type ≥96px from frame edges (encoders crop the margins).
- ❌ Two display faces in one cut. ❌ Inter/Roboto/system stacks unless the user names them (validator errors).

---
name: example-histogram
description: Working cut to imitate — histogram bars with staggered spring rise and count-up labels. Load for chart briefs.
---

# Example: histogram

## Beat map

- Axes/grid fade in (15f). Bars rise `scaleY 0→1` with per-bar spring stagger (`start + i * 4f`, `damping: 18, mass: 0.5, stiffness: 180`), `transform-origin: bottom`.
- Value labels count up over the rise window (`tabular-nums`), arriving as their bar lands.
- Hero bar (max value) gets the accent + a spring overshoot punch on arrival; context bars stay ink-dim.
- Resolve: full chart holds ≥30f with breathing; end-value badge counter-punches.

## Structural rules

- Data as DATA (arrays in `init()` scope), rendering as STATE (per-frame styles). Never recompute layout per frame.
- Zero baseline, monotonic when the brief says rising (see `charts-data-viz`).
- Grid + zero-line decor anchored to content edges. Bar gaps ≥12px at 1080p (thinner merges visually).
- Labels ON bars (white, small) for ≤6 bars; below-axis for more.

## Convert to bundle scope

Bars/labels built in `init()` from the values array. `render()` sets per-bar scaleY/opacity + label counts from index-staggered windows. One accent, ink-dim context.

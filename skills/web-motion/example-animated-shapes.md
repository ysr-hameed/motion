---
name: example-animated-shapes
description: Working cut to imitate — abstract shapes bumper with parallax layers. Load for bumper/abstract briefs.
---

# Example: animated shapes

## Beat map (~150f)

- Field establishes: blobs/rings/bars fade in staggered (4–6f steps) at low energy.
- Parallax drift runs wall-to-wall: far 20%, mid 60%, near 100% of travel (one shared progress).
- Punch-zoom 1→1.04 across the cut (felt, not seen).
- One hero shape pops (spring overshoot) mid-cut as the focal event; everything else supports.
- Resolve: field settles with breathing, no hard stop.

## Structural rules

- One accent + ink on dark bg. Shapes: rings (dashed, slow rotate), blobs (radial gradients), bars (wipe widths), dots (stagger pops).
- Counter-rotation: ring spins +12° while core pops — the cheap 3D read.
- Node budget <200. Gradients over blurs (export cost).
- Emptiness is a choice: 5 confident shapes beat 20 nervous ones.

## Convert to bundle scope

Shape divs/SVG in html with ids per layer. `render()` drives per-layer translate/scale/rotate from the shared progress + hero spring. All decor z 1–3, content 10.

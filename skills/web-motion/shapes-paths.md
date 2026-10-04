---
name: shapes-paths
description: SVG path reveals — trim undraw, stroke-dashoffset progress, morphs.
---
# Shapes & paths

- Line draw: `stroke-dasharray: LEN; stroke-dashoffset: LEN * (1 - p)` with p from ctx.interpolate. Measure LEN once, hardcode it.
- Dots along a path: precompute N positions in init(), reveal count = floor(p * N).
- Morphs: interpolate matching-radius/shape values (borderRadius 50%→8px) rather than path strings.
- Keep SVG node counts small (<200 nodes) — the sandbox re-renders every frame.


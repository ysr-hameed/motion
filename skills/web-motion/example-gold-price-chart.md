---
name: example-gold-price-chart
description: Working cut to imitate — line chart trace with progress mask and dot rider. Load for trend briefs.
---

# Example: gold price chart (line trace)

## Beat map (~150f)

- Grid + axes fade (0–15f). Path traces via `stroke-dashoffset LEN→0`, eased, over ~90f.
- Dot rides the head (precomputed points, indexed by progress). Glow under dot (accent, blurred 8px, small).
- Axis labels + min/max callouts fade staggered as the trace passes their x.
- End value counter-punches (spring overshoot) and holds ≥30f.

## Structural rules

- Path length measured ONCE during authoring, hardcoded as `LEN`. Never `getTotalLength()` per frame.
- `fill="none"`, `stroke-linecap="round"`, width 5–7px at 1080p.
- Progress eased (easeOut) — the trace should ARRIVE, not tick linearly.
- Monotonic law applies: rising brief = rising path. Annotate real dips if the brief names them.
- Area fill under the line (accent 12% → transparent) fades in AFTER the trace completes — never during (it smears the draw).

## Convert to bundle scope

SVG path + dot in html. `init()` stores point table. `render()` sets dashoffset + dot cx/cy + label opacities + counter. All from one progress value.

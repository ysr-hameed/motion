---
name: example-progress-bar
description: Working cut to imitate — progress bar with eased fill, tick marks, counter. Load for loading/meter briefs.
---

# Example: progress bar

## Beat map

- Track fades in (10f). Fill `scaleX 0→1` (`transform-origin: left`).
- Fill easing depends on honesty: REAL progress (loading, time) stays LINEAR — easing time looks broken. DRAMATIC progress (reveal, meter) uses easeOut.
- Tick marks pop staggered (`start + i * 5f`, spring scale). % counter in `tabular-nums` rides the fill head.
- Completion: overshoot pulse (scale 1→1.04→1 over 15f) + check/tick pop. Hold resolved ≥20f.

## Structural rules

- Fill is a shapeless div — `scaleX` can't distort it. Never scaleX text-adjacent elements.
- Ticks are data (count + positions), pops are state (per-tick windows).
- Indeterminate variant: two sliding segments (`translateX` loop via `(t - start) % span`) for unknown durations — still pure functions of `t`.
- Cap label ("RENDERING", "UPLOADING") tracked kickers above, % readout right-aligned at the head.

## Convert to bundle scope

Track/fill/ticks/counter in html. `render()` sets fill scaleX + tick pops + counter text from one progress value. Linear for honest, eased for dramatic.

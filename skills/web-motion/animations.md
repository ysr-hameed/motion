---
name: animations
description: General animation recipes — entrances, emphasis, loops, holds.
---
# Animations

- Entrance: translate + fade + spring scale, 24-45f, easeOut.
- Emphasis: scale punch 1→1.08→1 over 24f.
- Hold: sine breathing `Math.sin(t * 2.4) * 3` px after settle.
- Loop a segment: `var lt = (t - start) % span` for repeating ticks/pulses — still a pure function of t.
- Exit: easeIn slide + fade over the last 20-30f.
- One focal move at a time; secondary elements counter-move at 20-60% amplitude.


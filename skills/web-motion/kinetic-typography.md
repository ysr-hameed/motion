---
name: kinetic-typography
description: Type-led motion — cascades, masks, tracking punches, counters.
---
# Kinetic typography

- charByChar: 2f stagger, translateY 20→0 + opacity per char, spring settle.
- wordByWord: 5f stagger, spring opacity per word.
- maskReveal: clip-path inset wipe + per-char springs inside.
- Tracking punch: letterSpacing opens as the hero lands.
- Counter: eased 0→N + spring overshoot, tabular-nums.
- Type arrives in reading order; hero before sub; never two display faces.


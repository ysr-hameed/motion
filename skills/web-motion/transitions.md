---
name: transitions
description: Beat handoffs — wipes, masks, cross-dissolves, counter-motion.
---
# Transitions

Handoffs overlap 10-15f. Recipes (all in render, all t-driven):

- Wipe: clipPath inset driven by 0→1 progress.
- Cross-dissolve: out-element opacity 1→0 while in-element goes 0→1 over the same window.
- Push: outgoing translateX 0→-420 while incoming comes 420→0, easeOut both.
- Mask reveal: parent overflow:hidden, child slides 100%→0.
- Never a hard cut between beats unless the brief demands impact.


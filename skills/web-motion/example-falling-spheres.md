---
name: example-falling-spheres
description: Working cut to imitate — depth spheres with stagger, parallax, soft shadows. Load for 3D-feel briefs.
---

# Example: falling spheres

## Beat map

- Spheres drop in staggered (heaviest/largest first — mass reads in timing, `start + i * 6f`), springs with per-sphere damping (big = heavy/slow, small = bouncy).
- Settle = squash: `scaleY` dips to 0.9 on landing while `scaleX` goes 1.06 (volume preserved), then both ring to 1.
- Soft shadows: ellipse under each sphere, scale + fade INVERSE to height (high = small/faint, landed = full).
- Far layer blurred 2–4px + dimmed (depth cue), near layer crisp.

## Faux-3D vs real 3D

- Faux (radial-gradient spheres + blur + shadow): 1/10th the cost, 10× export fidelity. Enough for bumpers, backgrounds, abstract briefs.
- Real (Three.js canvas, see `web-3d`): rotation-through-space, true lighting, topology. Only when the brief demands it.

## Structural rules

- Gravity reads: easeIn falls, spring landings, squash on impact. Linear falls look like elevators.
- Mass hierarchy: vary size AND timing AND damping together, or everything feels same-weight.
- Floor line: spheres need a ground (shadow ellipse minimum) or they float in void.

## Convert to bundle scope

Sphere/shadow divs in html (or canvas for real 3D). `render()` sets per-sphere translate/squash + shadow from index-staggered windows. Parallax speeds per depth layer.

---
name: transitions
description: Beat handoffs — wipes, masks, cross-dissolves, pushes, counter-motion. Load for scene changes.
---

# Transitions

Handoffs overlap 10–15f. All in render, all t-driven. Pick ONE per handoff:

## Mask wipe (editorial default)

```js
var wipe = ctx.interpolate(f, [s, e], [0, 1], { easing: ctx.Easing.easeOut });
el.style.clipPath = "inset(0 " + ((1 - wipe) * 100) + "% 0 0)";
```

Parent `overflow: hidden`, child slides 100%→0 underneath. The edge IS the transition — keep the wipe edge clean (no text crossing it mid-wipe).

## Cross-dissolve (invisible handoff)

Out-element 1→0 while in-element 0→1 over the SAME window. Add a 20–40px push to both so it reads as motion, not a PowerPoint fade.

## Push (editorial energy)

Outgoing `translateX 0→-420` while incoming comes `420→0`, easeOut both, 30–45f. Ease the CAMERA-feel, not just the subject: the whole stage can push 1→1.02 underneath.

## Counter-motion (depth)

Primary moves left, secondary moves right at 30% amplitude with the same progress value. One progress variable, opposite vectors — cheap parallax that reads as 3D.

## What NOT to do

- ❌ Hard cuts between beats (unless the brief demands impact).
- ❌ Two transitions at once (wipe AND dissolve AND push = mush).
- ❌ Symmetric easeInOut on handoffs — handoffs should ARRIVE (easeOut), not depart-and-arrive.
- ❌ Transitioning opacity alone. Opacity is seasoning, never the meal.

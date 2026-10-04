---
name: easing
description: Easing curves — easeOut entrances, easeIn exits, custom beziers.
---
# Easing

- Entrances: `ctx.Easing.easeOut` (bezier 0.16, 1, 0.3, 1).
- Exits: `ctx.Easing.easeIn` (bezier 0.4, 0, 1, 1).
- Custom: `ctx.Easing.bezier(x1, y1, x2, y2)`.
- Progress hairlines and counters stay LINEAR (easing time itself looks broken).
- Every animated element gets an easing or a spring — linear-only motion is refused at write.


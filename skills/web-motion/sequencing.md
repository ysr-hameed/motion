---
name: sequencing
description: Overlapping beats, staggers, handoffs, exits in render(t, ctx).
---
# Sequencing

Beats are time windows, not components. One render() serves all beats:

```js
function render(t, ctx) {
  var f = ctx.frame;
  // Beat 1 (0-40f): hero in. Beat 2 starts at 30f — 10f overlap, never a hard cut.
  var heroIn = ctx.interpolate(f, [0, 40], [60, 0], { easing: ctx.Easing.easeOut });
  var subIn = ctx.interpolate(f, [30, 70], [30, 0], { easing: ctx.Easing.easeOut });
  ctx.el("hero").style.translate = "0 " + heroIn + "px";
  ctx.el("sub").style.translate = "0 " + subIn + "px";
  // Exit (last 30f): lower-thirds leave, heroes resolve.
  var exit = ctx.interpolate(f, [120, 150], [0, 1], { easing: ctx.Easing.easeIn });
  ctx.el("lower").style.opacity = 1 - exit;
}
```

Stagger lists: `t - (start + i * staggerSec)` per item. 4-6f stagger for siblings, 2f per character, 5f per word.


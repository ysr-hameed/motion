---
name: multi-scene-video
description: Multi-beat cuts — one render(), windowed scenes, shared rig.
---
# Multi-scene video

One bundle, one render(). Scenes are t windows sharing one depth rig (push/parallax/counter/breathe):

```js
var scene2 = ctx.interpolate(f, [90, 120], [0, 1], { easing: ctx.Easing.easeOut });
scene1El.style.opacity = 1 - scene2;
scene2El.style.opacity = scene2;
scene2El.style.translate = "0 " + ctx.interpolate(f, [90, 130], [60, 0], { easing: ctx.Easing.easeOut }) + "px";
```

Overlap handoffs 10-15f. Progress hairline + vignette resolve the frame across scenes.


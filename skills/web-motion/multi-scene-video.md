---
name: multi-scene-video
description: Multi-beat cuts — one render(), windowed scenes, shared rig, continuity. Load for 3+ scene cuts.
---

# Multi-scene video

One bundle, one `render()`. Scenes are `t` windows sharing one depth rig — that shared rig is what makes separate scenes feel like one cut.

## Structure

```js
function render(t, ctx) {
  var f = ctx.frame;
  // Shared rig (continuity across scenes):
  var push = ctx.interpolate(f, [0, total], [1, 1.045], { easing: ctx.Easing.bezier(0.25, 0.1, 0.25, 1) });
  var breathe = ...; // global idle drift
  // Scene windows (opacity gates + local motion):
  var s2 = ctx.interpolate(f, [90, 120], [0, 1], { easing: ctx.Easing.easeOut });
  scene1.style.opacity = 1 - s2;
  scene2.style.opacity = s2;
  scene2.style.translate = "0 " + ctx.interpolate(f, [90, 130], [60, 0], { easing: ctx.Easing.easeOut }) + "px";
}
```

## Continuity rules

- Shared: push-zoom, vignette, grain, progress hairline, palette, type scale. These NEVER cut — they run wall-to-wall and stitch scenes together.
- Per-scene: hero motion, cascades, emblems. Each scene gets its own anticipation (small dip on entry, even mid-cut).
- Handoffs overlap 10–15f with opacity gates + push. Hard cuts only for impact beats (and then make them LOUD — punch + sound cue).
- Recurring motif: one element (badge, rule, glow position) persists across scenes. The eye tracks it; the cut feels authored.

## Beat budget (150f / 5s, 3 scenes)

50f per scene is TIGHT: 10f anticipation + 25f arrival + 15f hold, then handoff. Prefer 2 scenes done well over 3 rushed. 4+ scenes need ≥8s — say so in the plan (`pre_validate_plan` proves it).

## Rules

- ✅ Shared rig wall-to-wall. ✅ Per-scene anticipation. ✅ 10–15f handoffs.
- ❌ A new palette per scene (reads as 3 ads). ❌ Butt-jointed scenes. ❌ 4 scenes in 5 seconds.

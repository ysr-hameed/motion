---
name: sequencing
description: Overlapping beats, staggers, handoffs, exits — one render(), windowed scenes. Load for multi-beat cuts.
---

# Sequencing

One bundle, one `render()`. Beats are time windows, not components.

## Overlap handoffs (the core skill)

```js
function render(t, ctx) {
  var f = ctx.frame;
  // Beat 1 (0-40f): hero in. Beat 2 starts at 30f — 10f overlap, never a hard cut.
  var heroIn = ctx.interpolate(f, [0, 40], [60, 0], { easing: ctx.Easing.easeOut });
  var subIn = ctx.interpolate(f, [30, 70], [30, 0], { easing: ctx.Easing.easeOut });
  ctx.el("hero").style.translate = "0 " + heroIn + "px";
  ctx.el("sub").style.translate = "0 " + subIn + "px";
}
```

Sequential blocks with no handoff read as a slide deck. Start each beat 10–15f before the previous ends so elements cross-dissolve rather than cut.

## Scene cross-dissolve (multi-scene cuts)

```js
var s2 = ctx.interpolate(f, [90, 120], [0, 1], { easing: ctx.Easing.easeOut });
scene1.style.opacity = 1 - s2;
scene2.style.opacity = s2;
scene2.style.translate = "0 " + ctx.interpolate(f, [90, 130], [60, 0], { easing: ctx.Easing.easeOut }) + "px";
```

Share ONE depth rig (push/parallax/counter/breathe) across scenes so the cut feels continuous.

## Stagger grammar

| Unit | Step | Example |
|---|---|---|
| Characters | 2f | `t - (start + i * 2) / 30` |
| Words | 4–5f | `t - (start + i * 4) / 30` |
| Siblings/cards | 4–6f | `t - (start + i * 5) / 30` |
| Code lines | 16f | per-line springs |
| Dots/ticks | 5f | rule ticks, progress dots |

A list with identical timing flashes on as a block. Offsetting by index turns it into a sequence — this is the single highest-ROI upgrade in motion graphics.

## Exits

Lower-thirds, overlays, and transient UI LEAVE (easeIn slide + fade, last 20–30f). Heroes and brand marks RESOLVE (settle + breathing hold to the end). A lower-third that never leaves reads as a burnt-in caption.

## Rules

- ✅ Overlap beats, stagger lists, resolve heroes, exit transients.
- ✅ One focal move at a time — secondary elements counter-move at 20–60% amplitude.
- ❌ Never butt-joint beats end-to-end. Never stagger-less `.map`/loops.

---
name: layout-composition
description: Placement that never breaks: safe margins, flex stacking, z-layers, focal hierarchy, and overlap rules for 1920x1080.
---

# Layout composition

Overlaps and cropped edges are the fastest way to look amateur. These rules
are enforced by the validator and measured on the real render — follow them
and placement stops being a failure mode.

## The non-negotiables

- **96px safe margin** on every edge. Encoders crop the outer band; anything
  inside it is advisory-flagged and anything off-canvas is a render finding.
- **One flex column per text group.** Headline + sub + CTA stack in a single
  column with `gap` — never three absolutely-positioned siblings that can
  drift over each other. Absolute positioning is for the column itself, not
  for each line inside it.
- **No two text elements share an (x, y).** Two absolutes at the same spot is
  always a bug, never a design. The validator flags exact-duplicate positions.
- **z-layers**: background = 1, content = 10, overlays = 20, UI/labels = 30.
  Siblings in DOM order paint fine without z-index; set it only when layers
  genuinely fight.

## Focal hierarchy

One element owns the frame: upper-third intersection or true center. Size it
at least 2x the next-largest text. Supporting copy drops a full scale step
(hero 130-200 → sub 64-96 → body 32-44). If two lines compete at the same
size, delete one.

## Centering without drift

```tsx
<div style={{
  position: "absolute", left: "50%", top: "30%",
  translate: "-50% 0",          // centers the column on x — never margin hacks
  textAlign: "center", zIndex: 10,
}}>
```

Percentage anchors survive; pixel anchors near edges don't. Bottom-anchored
chrome (badges, captions) sits at `bottom: 96` or more — never closer.

## Backgrounds

Full-bleed gradients, grids, and glow blobs are `zIndex: 1` with no text and
no pointer semantics. Content floats above at 10+. A background that carries
text is a foreground — promote it and re-check overlap.

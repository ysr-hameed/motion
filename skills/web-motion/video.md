---
name: video
description: Video elements — mp4 usage, t windows, loop/trim math, export limits. Load for footage cuts.
---

# Video

## Elements

```html
<video src="https://....mp4" muted loop playsinline crossOrigin="anonymous"></video>
```

- `muted + playsinline` or the sandbox refuses playback. `crossOrigin` for the same snapshot reasons as images.
- Trim client-side with `t` windows (show/hide, never re-encode). Loop with the `loop` attribute.
- Size/position like an image layer: full-bleed overscanned, or windowed in a device/chrome frame.

## The export caveat (say it every time)

Export captures stepped snapshots, not motion vectors: video regions export as a fair flipbook of the footage, correct in content and timing, softer in motion fidelity than the live preview. Procedural/CSS motion exports perfectly; footage exports adequately. State which the cut relies on.

- Prefer procedural/CSS motion for anything that must export perfectly.
- For footage-led cuts: keep footage full-bleed and simple (grade + Ken Burns carry it), put precision motion in overlaid DOM (type, rules, badges export perfectly).

## Grade + treatment

Same as images: duotone wash, vignette, grain unify footage with the palette. Text over footage gets a scrim. Lower-thirds over talking heads sit bottom-left with the exit beat (see `layout-composition` lockups).

## Rules

- ✅ muted/playsinline/crossOrigin. ✅ t-window trims. ✅ State the export caveat.
- ❌ Autoplay-with-sound assumptions. ❌ Footage as the ONLY motion in an export-critical cut.

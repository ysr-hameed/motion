---
name: layout-composition
description: Placement rules — safe margins, focal point, columns, z-layers.
---
# Layout composition

- 96px safe margins on 1920×1080. Focal element upper-third or center; supporting copy in ONE flex column beneath it.
- Text stacks in normal flow (flex column + gap), never sibling absolutes sharing coordinates.
- Layers: background 1, decor 2-3, content 10, overlays 20, badge/UI 30-40.
- Full-bleed decor overscans ±24px so parallax never reveals an edge.
- Center-safe: keep action inside middle 1080px for 9:16 crops.


---
name: layout-composition
description: Placement rules — safe margins, focal point, rule of thirds, columns, z-layers. Load for 2+ elements sharing the frame.
---

# Layout composition

## The frame contract (1920×1080, validator-enforced)

- 96px safe margins on all sides — encoders crop the edges. Center-safe: keep action inside the middle 1080px for 9:16 crops.
- Text stacks in ONE flex column in normal flow (gap, not coordinates). Never sibling absolutes sharing coordinates — they paint on top of each other and the audit flags it.
- Full-bleed decor overscans ±24px so parallax never reveals an edge.

## Focal placement (rule of thirds)

- Focal element at upper-third, center, or left-rail — never dead-center-low (that's where platform chrome and the badge live).
- Supporting copy in ONE column beneath/beside the focal. Decor at z-index 1–3. One focal per beat; everything else supports or leaves.
- Reading order = arrival order: kicker → hero → sub → badge. Stagger arrivals to match.

## The five lockups

| Lockup | Shape | For |
|---|---|---|
| center-stack | hero center, sub beneath, badge bottom | default, reveals, anthems |
| split-rail | text left 160px, emblem right 220px | product + mark, tech |
| mask | full-width kinetic type, clip wipe | punchy headlines |
| terminal | mono window, code cascade | dev, API, SDK |
| lower-third | bottom-left lockup WITH exit | speakers, broadcast |

## Z-layers

background 1, decor 2–3, content 10, overlays 20, badge/UI 30–40. DOM order paints siblings fine — declare zIndex only where layers actually fight.

## Measuring (the audit is truth)

The sandbox measures real pixels: off-canvas (>8px out), safe-margin intrusion, text-on-text overlap (>6px), type scale. Static heuristics guess; the audit KNOWS. Fix measured findings with `edit_file` — only off-canvas entrances/exits are exempt (they pass through by design).

## Rules

- ✅ Overlap-proof by construction: flow layout for text, distinct z per layer, sizes adapting to copy length.
- ✅ Sizes shrink as copy grows (hero 170→140→112→92). Long titles never fill the frame.
- ❌ Absolute-positioned text stacks. ❌ Decor at top/bottom 100% (renders outside its container).

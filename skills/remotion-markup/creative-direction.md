---
name: creative-direction
description: Art-direct a cut like a studio: mood to palette, type voice, motion voice, and composition hierarchy for a 1920x1080 frame.
---

# Creative direction

A cut without direction is decoration. Before writing code, decide the four
things below. The `creative_direct` tool makes these calls for you — this doc
is the taste behind its numbers.

## 1. Mood to palette (pick one, commit to it)

- **Cinematic**: near-black `#0B0C10`, warm key `#FFB340`, bone `#F2F3F7`. Vignette + grain, slow settles (damping 24+).
- **Energetic**: ink `#101014`, two saturated accents max (e.g. `#FF5A5A` + `#5AC8FA`). Fast entrances (24-40f), overshoot 1.06-1.12.
- **Minimal**: paper `#F4F2EC`, ink `#141414`, one accent. Long holds, mask reveals, no glow.
- **Playful**: deep plum `#1B1035`, candy `#FF7AD9` + lime `#C6F24E`. Bouncy springs (damping 10-14), stagger 2-3f.
- **Prestige**: charcoal `#111214`, champagne `#D8B56B`, serif display. Fades are earned here only — and still paired with a slow push.

Never more than three hues. Background, ink, accent — everything else is
opacity of those three.

## 2. Type voice

One display face + one text face (see `typography`). The display face carries
the single most important word; everything else drops a full scale step.
If two lines compete, delete one — hierarchy is subtraction.

## 3. Motion voice (the aliveness checklist)

Every cut must show at least four of these or it reads as a slide deck:

- **Anticipation**: 8-15f compress (scale →0.94) before the entrance.
- **Overshoot landing**: `spring()` past 1.0, never an ease to a dead stop.
- **Secondary motion**: the quiet element moves opposite or late (counter-motion, 60% amplitude, +6f delay).
- **Idle life**: after landing, a 2-4px breathing drift so the frame never freezes (see `cinematic-motion`).
- **Overlap**: next beat starts 10-15f before the previous ends.
- **Depth**: background drifts at 20-40% of foreground speed (parallax).

## 4. Composition hierarchy

One focal element owns the frame (upper-third or center). Supporting copy
sits in ONE flex column beneath it — never scattered absolutes. Decorative
layers (gradient, grain, grid) stay at zIndex 1 with no text. See
`layout-composition` for the placement rules the validator enforces.

## 5. Brief to skill routing (decide before writing)

Match the brief to knowledge BEFORE code — loading the wrong skill costs a
paced call, writing from memory costs the cut:

| Brief mentions | Load these first |
|---|---|
| numbers, chart, graph, stats, dashboard, progress | `charts-data-viz` + `example-histogram` or `example-gold-price-chart` |
| typewriter, cursor, quote, code reveal | `example-typewriter-highlight` |
| rotating words, carousel, alternating claims | `example-word-carousel` or `example-text-rotation` |
| chat, DMs, comments, conversation, testimonials | `messaging-chat-ui` |
| promo, ad, teaser, launch, social, hook | `social-media-formats` |
| 3D, spheres, depth scene, product drop | `3d` + `example-falling-spheres` |
| bounce, overshoot, settle, organic, elastic | `spring-physics` |
| scenes, acts, chapters, multi-part story | `sequencing` + `transitions` |
| shapes, abstract, bumper, background play | `example-animated-shapes` |
| Lottie file or vector-character motion | `example-lottie` |

Example skills are complete working cuts: imitate structure/timing/easing,
then convert to player scope (Fonts.*, shorthands, clamps, default export).

## 6. Motion or not? (validate the brief first)

If the request is not visual — a question, an essay, a calculation, a
translation — say so in one sentence and ask what to animate instead. Never
burn paced tool calls writing code for a brief with no picture. Ambiguous but
visual briefs get a reasonable choice, never an interrogation: ask one
question only when the subject itself is unclear, never about colour, pacing,
or mood.

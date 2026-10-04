---
name: typography
description: Motion type scale, safe areas, and the available font catalogue for a 1920x1080 frame.
---

# Motion typography

The frame is 1920x1080. Guessing sizes produces headlines that fill a third of
the frame and captions nobody can read. Use the scale below.

## Type scale at 1080p

- hero: 130-200px — main title
- sub: 64-96px — secondary line under a hero
- body: 32-44px — body copy and labels
- caption: 24-28px — still readable on a phone
- kicker: 20-24px — eyebrows

Nothing under 18px (unreadable as video) or over 320px (fills the frame).
Display type wants lineHeight 0.95-1.05; body wants 1.3-1.5.

## Safe area

Keep every element at least 96px from the frame edge. Encoders crop the outer
band. Prefer percentages and flex layout over absolute pixel offsets near an edge.

## The face registry

`Fonts` is already in scope in every composition — do not import it. Write:

```tsx
style={{ fontFamily: Fonts.anton.family }}
```

Use the registry. Never `system-ui`, `sans-serif`, Arial or Helvetica — those
are what a page uses when nobody chose.

Available faces by role:

- display (statement titles): anton, bebasNeue, archivoBlack, syne, unbounded, bricolage, fraunces, instrumentSerif, bodoni
- script (cursive, handwritten — weddings, signatures, playful titles): dancingScript, caveat, pacifico, greatVibes, satisfy, shadowsIntoLight
- editorial (longform, quotes): use a display face for the pull line and karla for the attribution
- geometric (tech with a voice): unbounded, syne, bricolage, spaceGrotesk
- neutral (labels, UI overlays): karla, archivo, manrope, outfit, chivo
- mono (data, timecodes, code): spaceMono
- character (stylised accents): use sparingly, one word maximum

## Pairing

One display face plus one neutral face. Two display faces fight; two neutrals
are invisible. Pick the display face from the brief's mood:

- product reveal, punch: anton, archivoBlack
- fashion, editorial: syne, fraunces, bodoni
- tech, futuristic: unbounded, bricolage, spaceGrotesk
- retail, sport, posters: bebasNeue
- prestige, serif: newsreader, instrumentSerif
- romantic, handwritten, signature: dancingScript, greatVibes
- playful, informal, marker: caveat, pacifico, satisfy, shadowsIntoLight

The model-side validator rejects sizes outside 18-320px and warns on page-default
stacks. It also enforces the 96px safe margin.

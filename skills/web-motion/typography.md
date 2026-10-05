---
name: typography
description: Full font catalogue, pairing rules, script sizing, user-named styles. Load for font decisions.
---

# Typography

ANY Google Fonts family works — cite it by name in CSS (`font-family: 'Playfair Display'`) and the runtime fetches the stylesheet and holds frame 0 until it loads. Curated starting points:

Display: Anton, Bebas Neue, Archivo Black, Syne, Unbounded, Bricolage Grotesque, Fraunces, Instrument Serif, Bodoni Moda, Dancing Script, Caveat, Pacifico, Great Vibes, Satisfy, Shadows Into Light.
Text/UI: Karla, Archivo, Manrope, Outfit, Space Grotesk, Space Mono, Chivo.

## Pairings (pick the voice, don't assemble one)

| Brief | Display | Text |
|---|---|---|
| modern (default) | Unbounded | Manrope |
| bold/poster/sport | Anton | Archivo |
| playful | Bricolage Grotesque | Karla |
| editorial | Syne | Newsreader |
| elegant/luxury | Instrument Serif | Newsreader |
| fashion/warm premium | Fraunces | Karla |
| futuristic/tech/data | Space Grotesk | Space Mono |
| code/terminal | Space Mono | Space Mono (all-mono) |
| romantic/handwritten | Dancing Script / Great Vibes | Newsreader |
| marker/playful note | Caveat / Pacifico | Karla |

One display (+ optional script) + one text face per cut. Never two display faces.

## Character notes (what each face IS)

- **Anton**: heavy condensed shout. Sport, posters, retail. All-caps.
- **Bebas Neue**: tall caps. Fashion-sale energy.
- **Unbounded**: geometric and strange. Tech with a voice. Wide — short copy only.
- **Bricolage Grotesque**: quirky modern default. Friendly without being soft.
- **Fraunces**: soft serif, optical sizing. Warm premium.
- **Instrument Serif**: high-contrast editorial. Elegant, fashion.
- **Space Grotesk**: technical. Data, product, telemetry.
- **Space Mono**: code, timestamps, labels. All-mono cuts.
- **Scripts** (Caveat, Dancing Script, Pacifico, Great Vibes): size at 1.4×, slight rotate (−2°), short copy. Elegant scripts pair Newsreader; playful pair Karla.

## User-named style is LAW

When the brief names a font or style ("handwritten", "Caveat", "mono", "serif"): call `font_resolve` FIRST, use its snippet EXACTLY — no substitutes, no "similar" faces. Then PROVE it: `read_render_report` carries per-family loaded/fallback status. A user-named family on fallback is NOT done.

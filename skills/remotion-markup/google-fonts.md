---
name: fonts
description: Loading Google Fonts and local fonts in Remotion
metadata:
  tags: fonts, google-fonts, typography, text
---

# Using fonts in THIS studio (read before any other font doc)

Compositions here run in a browser player scope, not a bundler. That changes
exactly one thing versus standard Remotion docs: **you never import or load
a font yourself.** There is no `loadFont`, no `GoogleFonts` global, and no
`@remotion/google-fonts/<Face>` submodule import — all three throw at mount.

## The only pattern that works

`Fonts` is already a global. Reference a face and the studio fetches,
injects, and waits for it before the first frame:

```tsx
// No import. Ever.
<div style={{ fontFamily: Fonts.dancingScript.family }}>
  Handwritten headline
</div>
```

Available keys (full notes in the `typography` skill):

- display: anton, bebasNeue, archivoBlack, syne, unbounded, bricolage,
  fraunces, instrumentSerif, bodoni
- script/cursive: dancingScript, caveat, pacifico, greatVibes, satisfy,
  shadowsIntoLight
- editorial: newsreader, crimson, spectral
- geometric/neutral: spaceGrotesk, chivo, archivo, manrope, outfit,
  epilogue, publicSans, karla
- mono: spaceMono
- character: bungee, righteous

If a key you want is missing, the composition still renders in a fallback
face — say so in the closing sentence instead of inventing a loader.

## Rules

- One display (or script) face + one text face per composition.
- Never `system-ui`, `sans-serif`, Arial, or Helvetica (validator error).
- Never `import { loadFont } from "@remotion/google-fonts/..."` — submodule
  imports are stripped and unresolvable here; the validator rejects them.
- Never call `loadFont()` — it is not in scope and throws at mount.
- A literal stack like `fontFamily: '"Caveat", cursive'` also resolves: the
  studio matches known family names and loads them on demand.

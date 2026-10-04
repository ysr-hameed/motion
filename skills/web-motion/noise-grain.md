---
name: noise-grain
description: Film grain via seeded SVG turbulence — deterministic across scrubs.
---
# Noise & grain

```css
.grain::after{content:"";position:absolute;inset:0;opacity:.12;
background-image:url("data:image/svg+xml,...fractalNoise...");}
```

- Seeded turbulence = identical every scrub and export. NEVER Math.random grain, NEVER per-frame canvas noise.
- Animate grain subtly: background-position from t in render(), or leave static — static grain still reads as film.
- 0.10-0.14 opacity. More reads as dirt.


---
name: effects
description: Glow, grain, vignette, parallax — cheap GPU-friendly effects.
---
# Effects

- Vignette: radial-gradient overlay div, static, z-index 15.
- Glow: radial-gradient blob behind hero, parallax-drifted.
- Grain: SVG fractalNoise data-URI ::after overlay at 0.10-0.14 opacity — seeded, deterministic. No canvas noise per frame (export cost).
- Parallax: bg 20%, mid 60% of fg travel. `bgY = fgY * 0.2`.
- Blur sparingly: per-frame backdrop-filter is the most expensive effect in the sandbox — prefer opacity/translate.
- Punch-zoom: whole-stage scale 1→1.045 across the cut (felt as intent, invisible as movement).


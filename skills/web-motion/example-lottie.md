---
name: example-lottie
description: Working cut to imitate — Lottie rig driven by t instead of wall-clock.
---
# Example: lottie

Imitate, never copy. Shape: lottie-web from pinned CDN in meta.assets.scripts, animation.goToAndStop(t * fps, true) called from render() — NEVER animation.play() (wall-clock). Wrap in a positioned div, fade the wrapper in over 15f. If the JSON URL lacks CORS, export shows the poster frame — state this.


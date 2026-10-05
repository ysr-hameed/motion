---
name: example-lottie
description: Working cut to imitate — Lottie rig driven by t instead of wall-clock. Load for Lottie/After-Effects briefs.
---

# Example: lottie (t-driven, not wall-clock)

## The one rule

NEVER `animation.play()`. The rig is scrubbed like everything else:

```js
// meta.assets.scripts: ["https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js"]
// init(): anim = lottie.loadAnimation({ container: ctx.el("lottie"), renderer: "svg", loop: false, autoplay: false, path: "https://....json" });
function render(t, ctx) {
  var f = ctx.frame;
  anim.goToAndStop(Math.min(lastFrame, (f - startF) / 30 * 30), true); // frame = f - startF, clamped
  wrap.style.opacity = ctx.interpolate(f, [startF - 15, startF], [0, 1], { easing: ctx.Easing.easeOut });
}
```

## Beat map

- Wrapper fades in over 15f BEFORE the rig's first frame (no pop-in).
- Rig plays across its window (eased progress into `goToAndStop` for choreographed speed, linear for literal playback).
- Hold the last frame ≥15f (rigs that vanish read as crashes), then fade the wrapper.

## Failure modes (state them in the plan)

- JSON URL without CORS: rig never loads → ship a poster frame (first-frame composition in DOM behind the wrapper) and say so.
- Heavy rigs (>500KB JSON): sandbox fps drops AND export snapshots wait per frame. Prefer simple rigs; complex character animation belongs in real 3D or video.
- `loop: false` always. Loops desync scrub — a looped rig showing frame 3 at `t = 4s` is a lie.

## Convert to bundle scope

Container div in html, lottie CDN in `meta.assets.scripts`, JSON URL in `meta` note. `init()` loads paused; `render()` seeks + wrapper fade. Poster frame behind, always.

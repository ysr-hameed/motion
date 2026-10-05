---
name: captions
description: Word-by-word subtitles as t-toggled divs — TikTok-pattern captions, karaoke, sync rules. Load for talking-head/lyric cuts.
---

# Captions

`subtitle_generate` returns windows `[{ from, to, text }]`. Never guess timing — a caption lagging voice by 10f reads as broken sync. One cue ≈ one window; derive from voiceover frame cues when no transcript exists.

## The pattern

```html
<div class="cap" id="cap"></div>
```
```css
.cap{position:absolute;left:50%;bottom:220px;transform:translateX(-50%);z-index:20;
font-size:44px;font-weight:800;text-align:center;max-width:1500px}
.cap .w{opacity:.45} .cap .on{color:#FFB340;opacity:1}
```
```js
// init(): one span.w per word across ALL windows (with data-window index).
// render(): win = WINDOWS.find(w => f >= w.from && f < w.to)
// per word: spoken → ink; active → accent + scale pop; unspoken → 45%.
var pop = ctx.spring(t - wordStartSec, { damping: 16, mass: 0.5, stiffness: 200 });
span.style.scale = String(1 + Math.max(0, pop) * 0.12);
```

## Placement & styling that reads on phones

- Lower-third band, centered, bottom 180–260px (above platform chrome, inside 96px margins). NEVER top-anchored for dialogue.
- Karaoke color (accent) for emphasis cuts, pop scale for hype cuts — pick ONE per cut.
- Active word pops with a spring; spoken words stay ink; unspoken at 45%.
- ≤42 chars/line, hold ≥30f per window. Two lines max — re-split long cues.

## Sync discipline

- Windows toggle on EXACT frames (`f >= from && f < to`). No fades between windows (1–2f dissolve max) — captions cut, they don't melt.
- Word-level highlight follows the SAME cue math as the window (per-word offsets inside the window), so highlight and voice never drift.
- Most viewers watch muted: captions ON is the default for social cuts, not an option.

## Rules

- ✅ Timing from cues/transcript, never invented. ✅ Bottom-anchored, karaoke OR pop (one mode).
- ❌ Top captions for dialogue. ❌ Three-line windows. ❌ Fading captions between windows.

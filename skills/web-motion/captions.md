---
name: captions
description: Word-by-word subtitles as t-toggled divs — TikTok-pattern captions.
---
# Captions

subtitle_generate returns windows [{ from, to, text }]. Render:

```html
<div class="cap" id="cap"></div>
```
```css
.cap{position:absolute;left:50%;bottom:220px;transform:translateX(-50%);font-size:44px;font-weight:800;text-align:center;z-index:20}
.cap .on{color:#FFB340} /* karaoke active word */
```
```js
// init(): one span per word. render(): window = WINDOWS.find(w => f >= w.from && f < w.to)
// per word: spoken → ink, active → accent + scale pop, unspoken → ink at 45%.
```

Position: lower-third band, bottom 180-260px (above platform chrome, inside 96px margins). ≤42 chars/line, hold ≥30f. Karaoke colour OR pop scale — pick one.


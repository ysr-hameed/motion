---
name: captions
description: Word-by-word subtitles with @remotion/captions (installed, TikTok-template pattern): Caption component, timing windows, safe margins, karaoke vs pop styling. Load for talking-head captions, lyric videos, narrator subtitles, TikTok-style cuts.
---

# Captions (package installed and in scope)

`@remotion/captions` is installed — this is the TikTok-template pattern
(word-by-word captions over vertical-safe framing). When adapting to this
player, ALL of the following are REQUIRED:

- fontFamily: `Fonts.*.family`, never Inter/system fonts
- motion via scale / translate / rotate shorthands, never transform strings
- every interpolate() gets extrapolateLeft:"clamp", extrapolateRight:"clamp"
- end the file with a default export; NEVER render <Composition> inside

## The component

```tsx
import { Caption } from "@remotion/captions";

// One caption window: text + the frames it is on screen.
const WINDOWS = [
  { text: "This is the hook", from: 0, to: 45 },
  { text: "and this is the payoff", from: 45, to: 90 },
];
const win = WINDOWS.find((w) => frame >= w.from && frame < w.to);
```

For TRUE word-by-word timing (each word highlighted as spoken), build the
windows with `createTikTokStyleCaptions` from `@remotion/captions` over a
transcript with per-word timestamps — or, when no transcript exists, derive
windows from the voiceover cues (`voiceover_generate` returns frame cues;
one cue ≈ one window). Never guess timing: a caption that lags the voice
by 10 frames reads as broken sync.

## Styling that reads on phones

- Position: lower-third band, centred, bottom 180–260px (above platform UI
  chrome, inside the 96px safe margin). NEVER top-anchored for dialogue.
- Active word: accent colour + spring scale 1→1.12 pop on entry; spoken
  words: ink; unspoken words: ink at 45% opacity. Karaoke colour (accent)
  for emphasis cuts, pop scale for hype cuts — pick ONE per cut.
- Size: 44–64px display face, lineHeight 1.25, max 2 lines, ≤42 chars per
  line. One window holds ≥30 frames — faster flips are unreadable.
- Background: none (stroke/shadow carries it) or a 12px-radius ink chip at
  70% opacity. Full-width bars are news tickers, not captions.
- Readability on any footage: `textShadow: '0 2px 18px rgba(0,0,0,0.8)'`
  always — captions without shadow die on bright frames.

## Sync arithmetic

- 150 wpm ≈ 2.5 words/sec ≈ 12 frames per word at 30fps. A 5-second cut
  holds ~12 words: one sentence, two windows max. Longer scripts either
  extend the cut or trim the script — `voiceover_generate` reports which.
- Window boundaries cut on the BEAT (every 15th frame at 120bpm beds),
  never mid-word. The caption change IS a beat — pair it with a 6-frame
  scale pop so the eye feels the cut land.
- Vertical framings (9:16, 1:1): keep captions in the middle 1080px
  centre-safe band. The player letterboxes; captions at the canvas edge
  crop on platform players.

## What NOT to do

- Never CSS transitions or animations for caption pops — they do not render
  frame-deterministically. Springs and interpolates only.
- Never auto-size text to fit (`fitText` style measurement per frame is
  layout thrash; also `window` APIs do not exist at render). Fix sizes from
  the type scale.
- Never more than one caption style per cut. Two styles read as two videos
  stitched together.

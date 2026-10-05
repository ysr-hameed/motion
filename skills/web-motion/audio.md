---
name: audio
description: Audio in bundles — element usage, t-synced cues, fades, licensing honesty. Load for music/VO briefs.
---

# Audio

## Elements

```html
<audio src="https://..." loop></audio>
```

- `muted + playsinline` where autoplay matters, or the sandbox refuses playback.
- Preview plays through the element. **Export is SILENT** — snapshots have no audio track. Say so plainly when the brief needs audio; never imply the MP4 carries sound.
- `crossOrigin="anonymous"` on remote audio for the same taint reasons as images.

## Sync (beats follow sound, not the reverse)

- `voiceover_generate` returns frame cues: stagger on-screen text to the SAME cues the VO hits.
- `music_search` returns BPM: beat frames = `60/bpm × 30`. Land punches on beat frames (quantize starts to the nearest beat — ±3f of drift reads as off-beat).
- 15f fade-out at the end of beds (`element.volume = ctx.interpolate(...)` in render — preview only).

## Licensing honesty

All catalogue tracks are placeholders until licensed. `asset_search` notes say so; repeat it in the closing sentence when audio ships in a cut. A published cut with unlicensed audio is the user's liability — one sentence prevents it.

## Rules

- ✅ Quantize emphasis to beat frames. ✅ 15f fades. ✅ State export-silence + licensing in the close.
- ❌ Implying audio exports. ❌ Unsynced text over VO (caption windows from cues, always).

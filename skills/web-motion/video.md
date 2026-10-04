---
name: video
description: Video elements — mp4 URLs, show/hide by t, loop, trim math.
---
# Video

- `<video src="https" muted loop playsinline crossOrigin="anonymous">`. Muted + playsinline or the sandbox refuses playback.
- Trim client-side with t windows (show/hide), never re-encode.
- Export captures POSTER-like snapshots (current frame at step time), not motion — video cuts preview richly but export modestly. State this when the brief needs video.
- Prefer procedural/CSS motion for anything that must export perfectly.


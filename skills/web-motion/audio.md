---
name: audio
description: Audio in bundles — <audio> elements, t-synced cues, fades.
---
# Audio

- `<audio src="https" loop>` in markup; preview plays via element. Export is SILENT (snapshots have no audio track) — say so when asked.
- Sync beats to voiceover_generate frame cues; stagger on-screen text to the same cues.
- Fade: gain via element.volume = ctx.interpolate(...) in render() (preview only).
- Placeholder beds until licensed tracks land — confirm licensing before publish.


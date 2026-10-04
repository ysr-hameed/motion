---
name: images
description: Images — https URLs, crossOrigin, sizing, fallbacks.
---
# Images

- `<img src="https://..." crossOrigin="anonymous">`. crossOrigin is REQUIRED for export snapshots to paint (foreignObject taint).
- Size to 1920w (Unsplash params w=1920&q=80&auto=format&fit=crop).
- Never invent URLs. No-image fallback: CSS gradient + text stand-in.
- Ken Burns: scale/translate from t in render(). Show/hide by t windows.


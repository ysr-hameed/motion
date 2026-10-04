---
name: fonts
description: Font loading — cite by family name, verify via render report.
---
# Fonts

- Cite families in CSS: `font-family: 'Unbounded', sans-serif`. The runtime injects the Google Fonts stylesheet and holds frame 0 until ready (4s cap).
- font_resolve grounds a user-named font/style to the exact snippet — call it first, use the result verbatim.
- read_render_report carries per-family loaded/fallback status. A user-named family on fallback is NOT done.
- Export snapshots resolve the same stylesheets; unresolvable names fall back silently — confirm in preview first.


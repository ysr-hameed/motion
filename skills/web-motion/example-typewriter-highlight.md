---
name: example-typewriter-highlight
description: Working cut to imitate — terminal typewriter with highlight sweep.
---
# Example: typewriter highlight

Imitate, never copy. Shape: mono terminal window springs in; lines cascade 16f apart with per-line springs; active line = floor((f - first) / per) with accent wash; command types via slice; deterministic block cursor. Convert to bundle scope: markup in html, 'Space Mono' in CSS, render(t, ctx) driving translate/opacity/highlight. Clamps are runtime-default.


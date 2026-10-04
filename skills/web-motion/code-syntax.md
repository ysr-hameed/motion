---
name: code-syntax
description: Code Hike-style code animations — token lines, highlight sweep, typing, cursor, terminal chrome.
---
# Code syntax

Terminal window springs in (scale 0.92→1, translateY 90→0). Token-coloured lines cascade (one spring per line, 16f stagger). Active line = pure function of f: `Math.floor((f - first) / per)`. Command types via `CMD.slice(0, typedN)` with typedN from ctx.interpolate. Cursor blinks deterministically: `Math.floor(f / 14) % 2`. All-mono: 'Space Mono'. See the golden terminal starter shape: init() builds rows, render() sets translate/opacity/highlight per row.


---
name: text
description: Type in bundles — markup, sizing, tracking, line-height.
---
# Text

- Markup in the html part (real elements, not canvas). Split to spans in init() for per-char/word motion.
- Scale: hero 130-200px, sub 64-96px, body 32-44px, caption 24-28px, kicker 20-24px. Floor 18, ceiling 320 (validator errors).
- Display lineHeight 0.95-1.05, body 1.3-1.5. letterSpacing for tracking punches (kicker 6-9px).
- NEVER animate fontSize — animate translate/scale/opacity + letterSpacing.
- Long copy gets smaller px (hero 170→140→112→92 by length). tabular-nums for counters.


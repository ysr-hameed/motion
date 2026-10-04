---
name: example-word-carousel
description: Working cut to imitate — rotating word carousel with mask.
---
# Example: word carousel

Imitate, never copy. Shape: overflow-hidden slot, words cycle every ~45f: outgoing translateY 0→-100% easeIn while incoming comes 100%→0 easeOut, 8f overlap. Active index = floor((f - start) / span) % words.length. Bundle scope: slot div in html, render() sets per-word translate/opacity.


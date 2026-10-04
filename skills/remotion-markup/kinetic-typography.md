---
name: kinetic-typography
description: Headlines that feel alive: per-character spring cascades, masked reveals, tracking animation, and editorial lockups.
---

# Kinetic typography

Static text with a fade is the cheapest look in motion. Type should arrive
like it is being spoken — one unit at a time, with weight.

## Per-word spring cascade (default for headlines)

```tsx
{words.map((w, i) => {
  const d = 60 + i * 4; // 4f stagger per word
  const s = spring({ frame: frame - d, fps, config: { damping: 18, mass: 0.5, stiffness: 180 } });
  const y = interpolate(frame, [d, d + 18], [22, 0], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <span key={i} style={{
      display: "inline-block", opacity: s, translate: "0 " + y + "px",
      fontSize: 64, lineHeight: 1.1, fontFamily: Fonts.unbounded.family,
      color: INK, marginRight: 14,
    }}>{w}</span>
  );
})}
```

Per-character is the same with `split("")` and a 2f stagger — reserve it for
short hero words (under 12 chars), never paragraphs.

## Masked reveal (editorial, prestige)

The mask moves, not the text. Outer box `overflow: "hidden"`, inner row
slides `translateX(100% → 0)` or a `clipPath: inset(0 100% 0 0 → 0 0 0 0)`
over 30-45f with `Easing.bezier(0.16, 1, 0.3, 1)`. Uncovering reads as
confidence; sliding the text itself reads as a banner ad.

## Tracking punch (one word only)

Letter-spacing `0.35em → 0.02em` over 30f on the single most important word,
paired with an opacity 0→1. Use once per cut — twice is a tic.

## Lockup rules

- Kicker 20-24px, tracking 0.15em+, uppercase, 60-70% opacity — then headline.
- Never animate fontSize itself (layout thrash); animate translate/scale/opacity.
- Longest line sets the size: shrink until it clears the 96px safe margins.
- Attribution or CTA resolves last and holds — the eye lands where motion stops.

---
name: social-media-formats
description: Scroll-stopping cuts for the 1920x1080 canvas with a social afterlife: safe margins, hook in frame 1, mobile-readable type, loop-friendly endings. Load for promos, ads, teasers, launches.
---

# Social & promo formats

This canvas is 1920x1080 landscape, but every promo gets cropped, muted, and
skimmed on a phone. Design for the feed first: the landscape master survives
it automatically. The reverse is not true.

## Safe margins — 96px, always

Keep focal elements and type ≥96px from every frame edge. Platform chrome,
auto-captions, and square crops eat edges first.

```tsx
// stage padding, not per-element nudging
<div style={{ position: "absolute", inset: 0, padding: 96, display: "flex",
  flexDirection: "column", justifyContent: "center" }}>
```

## Hook in frame 1 — never a static start

Social dies in the first half-second. Frame 1 already moves: a spring firing
on frame 0 plus a low-amplitude constant drift so nothing ever freezes.

Wrong (waits a full second to start):

```tsx
const entrance = spring({ frame: frame - 30, fps });
```

Right (immediate hook + constant life):

```tsx
const entrance = spring({ frame, fps, config: { damping: 12, stiffness: 200 } });
const pulse = Math.sin(frame * 0.12) * 0.015 + 1; // deterministic — never Math.random
// style: {{ scale: entrance * pulse }}
```

## Type readable at thumbnail size

Headlines must survive a 300px-wide mute-preview. Floor: hero 92px+, sub 32px+
on this canvas; test by squinting — if the hook word blurs out, it is too small
or too thin. Bold display faces (anton, unbounded, bebasNeue) over elegant
ones for feed work.

```tsx
const HERO = Math.max(92, Math.round(1920 * 0.075));
const SUB = Math.max(32, Math.round(1920 * 0.024));
```

## High-contrast palette, 3 hues max

Bold saturated accents on near-black pop on oled screens (`#FF3366`,
`#00D4FF` on `#0A0A0A`). Muted pastels wash out — save them for prestige
briefs watched full-screen with sound.

## Loop-friendly or resolved — never a hard stop

Either resolve (final lockup holds 20f+) or loop (end state crossfades back to
frame-1 state over the last 15f). A cut that stops mid-motion feels broken in
a feed that replays.

```tsx
const TOTAL = 150;
const fadeOut = interpolate(frame, [TOTAL - 15, TOTAL], [1, 0], {
  extrapolateLeft: "clamp", extrapolateRight: "clamp",
});
```

## Caption-safe composition

Assume muted autoplay: the message must land with sound off. Key claim as
burned-in kinetic type, never carried by voiceover alone. Lower-third zone
(bottom 200px) stays clear for auto-captions — put the CTA above it.

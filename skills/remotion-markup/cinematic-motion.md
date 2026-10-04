---
name: cinematic-motion
description: Film-grade aliveness: anticipation, overshoot settles, secondary motion, idle breathing, parallax depth, and light play.
---

# Cinematic motion

The difference between software animation and film is what happens *around*
the main move. Layer at least three of these in every cut.

## Anticipation + overshoot (every entrance)

```tsx
// 12f wind-up, then a spring that rings out past 1.0
const anticipate = interpolate(frame, [0, 12], [1, 0.94], {
  easing: Easing.bezier(0.4, 0, 1, 1),
  extrapolateLeft: "clamp", extrapolateRight: "clamp",
});
const land = spring({ frame: frame - 12, fps, config: { damping: 18, mass: 0.8, stiffness: 120 } });
const scale = frame < 12 ? anticipate : 0.94 + land * 0.06;
```

Damping guide: 10-14 playful, 15-20 confident (default), 24-30 prestige.
Let the spring overshoot — clamping arrival at exactly 1.0 on the exact end
frame is what makes motion feel dead.

## Secondary motion (follow-through)

The quiet element answers the hero late and small: same easing, 60%
amplitude, +6 to +10f delay — or opposite direction (counter-motion). A frame
where everything moves together reads as one flat card sliding around.

## Idle breathing (never freeze the frame)

After the landing, keep 2-4px of life so the hold doesn't feel paused:

```tsx
const settleDone = 150;
const breathe = frame > settleDone
  ? Math.sin((frame - settleDone) * 0.08) * 3
  : 0;
// translate: "0 " + (heroY + breathe) + "px"
```

Deterministic (`Math.sin` of frame, never `Math.random` or wall-clock) so
every render pass is identical.

## Parallax depth

Background drifts at 20-40% of foreground travel across the same frames:

```tsx
const p = interpolate(frame, [0, 120], [0, 1], {
  easing: Easing.bezier(0.25, 0.1, 0.25, 1),
  extrapolateLeft: "clamp", extrapolateRight: "clamp",
});
// bg layer:      translate: (p * -24) + "px 0"
// hero layer:    translate: (p * -70) + "px 0"
```

## Light play (cheap, filmic)

- **Vignette**: radial-gradient overlay, opacity 0.3-0.55, static.
- **Push-in**: whole-scene `scale: 1 → 1.04` over the full beat — invisible as movement, felt as intent.
- **Glow pulse**: accent elements `opacity 0.6 → 1` on a 40f sine after landing.
- **Grain**: `@remotion/noise` at 3-5% opacity. Never per-frame blur — it blows the frame budget (see `performance_profile`).

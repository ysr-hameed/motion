---
name: charts-data-viz
description: Animated data visuals that read instantly: staggered bar entrances, Y-axis labels, value labels, pie segments. Load when the brief has numbers, charts, dashboards, or progress.
---

# Charts & data visualization

Numbers without staging read as a spreadsheet. Every chart below follows the
player scope: `scale` / `translate` shorthands (never `transform` strings),
`extrapolateLeft/Right: "clamp"` on every `interpolate()`, `Fonts.*` families
(never Inter/Roboto unless the user names them), and a default export.

## Bar entrances — stagger, spring, never together

All bars animating on the same frame reads as one block flashing on. Offset
each bar 3-5f and land it with a spring.

Wrong (all bars together, mechanical):

```tsx
const bars = data.map((item) => {
  const h = spring({ frame, fps, config: { damping: 18 } });
  return <div style={{ height: h * item.value }} />;
});
```

Right (staggered entrances, organic):

```tsx
const STAGGER = 5;
const bars = data.map((item, i) => {
  const h = spring({
    frame: frame - i * STAGGER,
    fps,
    config: { damping: 18, stiffness: 80 },
  });
  const opacity = interpolate(frame, [i * STAGGER, i * STAGGER + 12], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  return <div style={{ height: h * item.value, opacity }} />;
});
```

## Always include Y-axis labels

A chart without an axis is decoration. Add labeled ticks — they also give the
eye something static to measure motion against.

```tsx
const TICKS = [0, 25, 50, 75, 100];
<div style={{ display: "flex" }}>
  <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
    {[...TICKS].reverse().map((t) => (
      <span style={{ fontSize: 22, color: INK, opacity: 0.55, fontFamily: Fonts.manrope.family }}>{t}</span>
    ))}
  </div>
  <div style={{ display: "flex", alignItems: "flex-end", gap: 14, borderLeft: "2px solid " + INK }}>
    {bars}
  </div>
</div>
```

## Value labels fade in after the bar lands

Labels on a bar that is still growing jitter. Show them only once the bar is
tall enough, fading with the same progress.

```tsx
const barH = maxH * progress;
<div style={{ height: barH, backgroundColor: ACCENT }}>
  {barH > 44 && (
    <span style={{ opacity: progress, fontSize: 20, fontFamily: Fonts.manrope.family }}>
      {item.value.toLocaleString()}
    </span>
  )}
</div>
```

## Pie segments — stroke-dashoffset from 12 o'clock

```tsx
const C = 2 * Math.PI * R;
const segLen = (value / total) * C;
const offset = interpolate(progress, [0, 1], [segLen, 0], {
  extrapolateLeft: "clamp", extrapolateRight: "clamp",
});
<circle
  r={R} cx={C_X} cy={C_Y} fill="none" stroke={color} strokeWidth={44}
  strokeDasharray={`${segLen} ${C}`}
  strokeDashoffset={offset}
  transform={`rotate(-90 ${C_X} ${C_Y})`}
/>
```

Stagger segments 6-8f apart. Hold the full pie 20f+ at the end — a chart that
cuts the frame it completes feels unfinished.

## Progress bars — interpolate, not spring

Linear progress (0→100%) is the one place `interpolate()` beats `spring()`:
progress must track truthfully, never overshoot past 100.

```tsx
const p = interpolate(frame, [START, START + DUR], [0, 1], {
  easing: Easing.bezier(0.25, 0.1, 0.25, 1),
  extrapolateLeft: "clamp", extrapolateRight: "clamp",
});
// fill: scale: p + " 1", pct label: Math.round(p * 100) + "%"
```

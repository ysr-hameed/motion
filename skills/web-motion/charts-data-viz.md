---
name: charts-data-viz
description: Data graphics — bars, line traces, counters, progress, monotonic series. Load for stats/metrics briefs.
---

# Charts & data viz

Data that moves wrong reads as a LIE, not as style. Correctness first, choreography second.

## Bars (staggered spring rise)

```js
// init(): one .bar div per value. render(), per bar i:
var d = startF + i * 4;
var s = ctx.spring(t - d / 30, { damping: 18, mass: 0.5, stiffness: 180 });
bar.style.scaleY = Math.max(0.001, s);   // transform-origin: bottom
bar.style.opacity = Math.max(0, Math.min(1, s));
label.textContent = Math.round(ctx.interpolate(f, [d, d + 30], [0, value], { easing: ctx.Easing.easeOut }));
```

Labels count up with `tabular-nums`. Grid + zero-line decor, anchored to content edges (never `top/bottom: 100%`).

## Line trace (SVG dashoffset + dot rider)

See `shapes-paths`: hardcoded path length, eased 0→1 progress, dot riding precomputed points. Axis labels fade staggered. End-value counter punches with a spring overshoot.

## Counter (odometer)

Linear 0→N over ~60f + spring scale punch on arrival (see `kinetic-typography`). Progress is honest time — never eased.

## Monotonic law

If the brief says rising/growing/peak/record, the series MUST be monotonic. An unexplained dip reads as an error, not noise. Only dip when the brief names the dip — then annotate it (that's the story).

## Scale honesty

- Baselines at zero unless the brief justifies a truncated axis (then label it LOUDLY).
- One accent for the hero series, ink-dim for context series. Three hues max still applies.
- Value labels beat legends: put the number ON the bar, not in a key.

## Rules

- ✅ Deterministic everything (springs, counts, traces). ✅ tabular-nums. ✅ Zero baselines.
- ❌ Invented dips in rising briefs. ❌ Per-frame `getTotalLength`. ❌ 3D exploding pie charts (this is not 2007).

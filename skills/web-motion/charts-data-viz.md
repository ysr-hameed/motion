---
name: charts-data-viz
description: Data graphics — bars, counters, progress, monotonic series.
---
# Charts & data viz

- Bars: scaleY/scaleX from t with per-bar stagger; value labels tabular-nums.
- Counter: eased 0→N + spring overshoot (see textAnimationSnippet counter).
- Progress: linear 0→100% hairline (never eased).
- If the brief says rising/growing, the series MUST be monotonic — an unexplained dip reads as an error.
- Grid + zero-line decor anchored to content edges, never top/bottom 100%.


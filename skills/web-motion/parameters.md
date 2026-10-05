---
name: parameters
description: Tunable constants — UPPER_SNAKE_CASE color/text/timing/layout blocks users can customize. Load for hand-off quality.
---

# Parameters

The user customizes WITHOUT reading logic. Top of `render()`: ALL tunable values as UPPER_SNAKE_CASE consts.

```js
function render(t, ctx) {
  var f = ctx.frame;
  // ── TUNABLES ──
  var BG = "#0B0C10", INK = "#F2F3F7", ACCENT = "#FFB340";
  var HERO_PX = 140, SUB_PX = 38;
  var ENTER_F = 15, SETTLE_F = 68, EXIT_F = 120;
  var DAMP = 18, STIFF = 130;
  var EASE = ctx.Easing.easeOut;
  ...
}
```

## What gets parameterized

- COLORS (bg/ink/accent), TEXT (copy strings, sizes), TIMING (starts/ends in frames, damping/stiffness), LAYOUT (positions, widths).
- Durations derive from `meta.duration`; beat windows derive from plan frames. One duration change must not require retyping every number — compute windows from named starts (`SUB_START = ENTER_F + 27`).

## What does NOT get parameterized

- Helper wiring, easing internals, stagger arithmetic, audit-driven fixes. Users tune outcomes, not machinery.

## Rules

- ✅ Consts first, logic after. ✅ Names say what they change (`BADGE_IN_F`, not `x2`).
- ✅ Beats reference consts, so a retime edit touches ONE line.
- ❌ Magic numbers scattered through render (an edit_file retime becomes five edits).

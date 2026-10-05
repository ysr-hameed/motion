---
name: kinetic-typography
description: Type-led motion — cascades, masks, tracking punches, counters, karaoke. Load when type IS the cut.
---

# Kinetic typography

When type leads, every letter is a performer. Split to spans in `init()`, choreograph per unit in `render()`.

## charByChar (2f stagger — headlines that feel alive)

```js
// init(): one <span> per char in #headline. render(), per char i:
var d = startF + i * 2;
var s = ctx.spring(t - d / 30, { damping: 16, mass: 0.5, stiffness: 200 });
span.style.translate = "0 " + ctx.interpolate(f, [d, d + 15], [20, 0], { easing: ctx.Easing.easeOut }) + "px";
span.style.opacity = Math.max(0, Math.min(1, s));
```

## wordByWord (5f stagger — readable cascades)

Same shape, word spans, snappier springs (`damping: 18, mass: 0.5, stiffness: 180`). Readability rule: the eye needs ~5f per word to register sequence vs block.

## maskReveal (wipe + springs inside)

```js
var mask = ctx.interpolate(f, [s, e], [0, 1], { easing: ctx.Easing.easeOut });
clipEl.style.clipPath = "inset(0 " + ((1 - mask) * 100) + "% 0 0)";
// + per-char springs inside the wiped container (see charByChar)
```

Interpolate the NUMBER 0→1, then build the inset string. The mask edge should cross at a steady pace — easeOut on the progress, springs on the chars.

## Tracking punch

```js
kicker.style.letterSpacing = ctx.interpolate(f, [15, settle], [2, 9]) + "px";
```

Letter-spacing opens as the hero lands. Kickers and badges only — never body copy.

## Counter / odometer (stats, milestones)

```js
var n = Math.round(ctx.interpolate(f, [s, e], [0, target], { easing: ctx.Easing.easeOut }));
el.textContent = n.toLocaleString("en-US"); // + tabular-nums in CSS
var settle = ctx.spring(t - e / 30, { damping: 12, mass: 1, stiffness: 120 });
el.style.scale = 1 + Math.max(0, settle) * 0.08; // overshoot punch on arrival
```

Progress stays LINEAR (it's honest time). The punch AFTER arrival carries the feel.

## Karaoke (captions, lyrics)

Spoken words: ink. Active word: accent + scale 1→1.12 pop on entry. Unspoken: ink at 45%. ONE emphasis mode per cut — color karaoke for emphasis cuts, pop scale for hype cuts.

## Rules

- ✅ Type arrives in READING order. Hero before sub. Never two display faces.
- ✅ Uppercase display sparingly (kickers, badges, Anton heroes) — full-sentence caps read as shouting.
- ❌ Animating `fontSize`. ❌ Full-copy fades (opacity-only = weakest change).

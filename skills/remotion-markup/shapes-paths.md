---
name: shapes-paths
description: SVG motion with @remotion/shapes and @remotion/paths (both installed): procedural shapes, path-trim reveals via evolvePath, motion along a path, plus interpolateColors for colour transitions. Load for logo draws, diagrams, maps, progress rings, shape morphs.
---

# Shapes + paths (both packages installed and in scope)

`@remotion/shapes` and `@remotion/paths` are installed — import from them
directly. When adapting to this player, ALL of the following are REQUIRED:

- fontFamily: `Fonts.*.family`, never Inter/system fonts
- motion via scale / translate / rotate shorthands, never transform strings
- every interpolate() gets extrapolateLeft:"clamp", extrapolateRight:"clamp"
- end the file with a default export; NEVER render <Composition> inside

## @remotion/shapes — procedural SVG, no hand-drawn paths

```tsx
import { makeCircle, makeRect, makeStar, makePolygon, makePie } from "@remotion/shapes";

const circle = makeCircle({ radius: 120 });
const star = makeStar({ points: 5, outerRadius: 140, innerRadius: 60 });
const ring = makePie({ radius: 160, progress: 0.75 }); // progress ring!
// Every maker returns { path, width, height, transformOrigin, instructions }.
// Render it:
<svg width={circle.width} height={circle.height} viewBox={`0 0 ${circle.width} ${circle.height}`}>
  <path d={circle.path} fill={ACCENT} transform={`translate(${circle.width / 2}, ${circle.height / 2})`} />
</svg>
```

Animate a shape the Remotion way: drive its INPUTS by frame
(`progress: revealProgress`, `outerRadius: 60 + 80 * pop`) rather than
scaling the rendered SVG — inputs stay crisp, scale blurs edges.
`useShape()` memoises the same makers inside the component when inputs
change every frame.

## @remotion/paths — trim reveals and motion along a curve

```tsx
import { evolvePath, getLength, getPointAtLength, translatePath, scalePath } from "@remotion/paths";

// Stroke-draw reveal: the logo draws itself, frames 20→80.
const draw = interpolate(frame, [20, 80], [0, 1], {
  easing: Easing.bezier(0.16, 1, 0.3, 1),
  extrapolateLeft: "clamp", extrapolateRight: "clamp",
});
const evolved = evolvePath(draw, LOGO_PATH);
<path d={evolved.path} stroke={ACCENT} strokeWidth={6} fill="none"
  strokeDasharray={evolved.strokeDasharray} strokeDashoffset={evolved.strokeDashoffset} />
```

`evolvePath` returns ready-to-spread dash props — use them verbatim, do not
hand-roll dash math. For motion ALONG a path (a dot travelling a route,
a label following a curve):

```tsx
const len = getLength(ROUTE_PATH);
const pt = getPointAtLength(ROUTE_PATH, len * travelProgress);
// pt = { x, y } in path coordinates — position the traveller with
// left/top + translate, offset by half its own size to centre it.
```

`translatePath` / `scalePath` reposition whole paths; `getTangentAtLength`
gives the angle when the traveller should rotate into the curve
(`rotate: tangent.angle + "deg"` — rotate shorthand, not transform).

## interpolateColors — colour is animatable data

```tsx
import { interpolateColors } from "remotion";
const glow = interpolateColors(frame, [0, 60], ["#0B0E14", "#FFB340"]);
// Multi-stop: interpolateColors(frame, [0, 30, 60], [A, B, C]).
```

Rules: input range and output array must be the SAME length or it throws.
Outputs must be parseable colours (hex or rgb()). interpolateColors never
takes an easing key — ease the NUMBER first
(`const p = interpolate(frame, [0, 60], [0, 1], { easing })`, then
`interpolateColors(p, [0, 1], [A, B])`). Clamp the number, not the colour.

## Composition notes

- Trim reveals pair with a moving dot at the draw head
  (`getPointAtLength(path, len * draw)`) — the travelling point sells the
  pen; the stroke alone reads as a wipe.
- Progress rings (`makePie` with frame-driven `progress`) beat bar wipes
  for circular emblems and countdowns.
- Layer order: path art at zIndex 6–8, travelling dots at 9, text content
  at 10 — never let a stroke cross a headline without a deliberate overlap
  beat.
- Stroke widths scale with canvas: 4–8px for detail, 10–16px for hero
  strokes on 1920×1080. Hairlines (1–2px) vanish after encode.

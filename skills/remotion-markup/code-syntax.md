---
name: code-syntax
description: Code Hike-style code animations without the codehike package: token-coloured lines, line stagger, active-line highlight, typing, blinking cursor, terminal chrome. Load for code, coding, terminal, API, SDK, developer briefs.
---

# Code syntax (Code Hike mechanic, zero dependencies)

Upstream's Code Hike template needs the `codehike` npm package, which is NOT
in this player scope — so every recipe below is pure Remotion. Imitate the
structure, timing, and easing. When adapting to this player, ALL of the
following are REQUIRED:

- fontFamily: code is ALWAYS a mono face — `Fonts.spaceMono.family` works on
  every palette — never Inter/system fonts
- motion via scale / translate / rotate shorthands, never transform strings
- every interpolate() gets extrapolateLeft:"clamp", extrapolateRight:"clamp"
- end the file with a default export; NEVER render <Composition> inside
- icons: `import * as Lucide from "lucide-react"` + `<Lucide.Terminal/>`,
  never named imports (they throw at mount)

## The pattern (6 beats, ~150 frames)

1. Terminal window springs in: `spring({ damping: 18, mass: 0.9,
   stiffness: 120 })` on scale 0.92→1 plus `translateY 90→0` with
   `Easing.bezier(0.16, 1, 0.3, 1)`, frames 8→52.
2. Code lines cascade: one spring per line, start frame `26 + i * 16`,
   `translateY 24→0` + opacity from the same spring. Stagger is the
   readability — never reveal all lines at once.
3. Active-line highlight sweep: `const active = Math.min(LAST,
   Math.max(0, Math.floor((frame - 26) / 16)))` and
   `backgroundColor: i === active ? ACCENT + '26' : 'transparent'`.
   A pure function of frame — identical every render pass.
4. Typing: `CMD.slice(0, typedN)` where `typedN = Math.floor(interpolate(
   frame, [typeStart, typeStart + dur], [0, CMD.length], { clamps }))`.
   Type into ONE single-string line, never per-token (slicing tokens splits
   colours mid-word).
5. Cursor: `const cursorOn = Math.floor(frame / 14) % 2 === 0`, rendered as
   a `▍` span with `opacity: cursorOn ? 1 : 0`. Deterministic — never
   `Math.random()`, never CSS animation.
6. Chrome: traffic dots (`#FF5F57`, `#FEBC2E`, `#28C840`), a tab with
   `<Lucide.Terminal/>` + filename, a status bar with `<Lucide.GitBranch/>`.
   Chrome is static; only the body animates.

## Token colours

Pass colours as data, not logic: `[{ t: "import", c: ACCENT },
{ t: ' "remotion"', c: "#9CE56B" }]` and render
`ln.toks.map((tk, j) => <span key={j} style={{ color: tk.c }}>{tk.t}</span>)`.
Keyword = accent, string = green (`#9CE56B` on dark, `#1E7E34` on light),
comment = grey (`#5B616B` on dark, `#9AA0A6` on light), plain = ink.
Light palettes need the darker string/comment pair or the code is unreadable.

## Geometry that fits 1920×1080

- Window 1400 wide, centred, top 44%. 6 rows × 56px + 64 titlebar + 52
  status ≈ 452 tall — resolves above the 96px badge line.
- Code 30px/1.2, line numbers 24px in a 56px gutter, titlebar 24px,
  status 22px. Nothing under 18px.
- Long lines: cap code strings at ~48 chars. A 140-char headline goes in a
  `// comment` line, truncated — never in a code token.

## What NOT to do

- Never import `codehike` / `CodeTransition` — not installed, mount throws.
- Never `Math.random()` for the cursor or line order — use the seeded
  `random()` from remotion, or better, pure functions of `frame`.
- Never animate `fontSize` or `width` of the window — animate
  translate/scale/opacity only.
- One highlight colour (accent at 15–25% alpha). Rainbow line backgrounds
  read as an error state, not emphasis.

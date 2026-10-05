---
name: fonts
description: Font loading — cite by family name, verify via render report, fallback rules. Load when type must prove itself.
---

# Fonts

## How loading works

1. Cite the family in CSS: `font-family: 'Unbounded', sans-serif` (always include a generic fallback after the comma).
2. The runtime injects one Google Fonts stylesheet per cited family and holds frame 0 until `document.fonts.ready` (4s cap, then renders regardless).
3. `meta.fonts: ["Unbounded", "Manrope"]` forces families the CSS scan might miss.

## Verification (the only truth)

`read_render_report` returns per-family `{ family, ok }`: `loaded` vs silent fallback. Rules:

- A user-named family on fallback is NOT done — resolve it (`font_resolve`) and re-verify.
- Never claim a font change worked from an edit result alone. Only a `loaded` status counts.
- Unknown names fall back instead of failing the render. A cut that renders in fallback type still verifies — say so plainly.

## Fallback discipline

- Every `font-family` ends with `, sans-serif` (or `, serif` / `, monospace` for those roles).
- Script faces fall back ugly — if a script is critical, keep the hero short so fallback damage is small.
- Export snapshots resolve the same stylesheets; unresolvable names fall back silently. Confirm in preview first.

## Rules

- ✅ `font_resolve` the moment a brief names a font or style. Use the snippet verbatim.
- ✅ Two faces per cut max (display + text). Every extra face is a request and a failure mode.
- ❌ `@import` in CSS, `<link>` in html, JS font loaders — the runtime owns loading. ❌ System stacks (validator error).

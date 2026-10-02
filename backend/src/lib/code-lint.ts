/**
 * Static checks on a composition, before it ever reaches the browser.
 *
 * These are not style rules. Each one corresponds to a way a composition
 * has actually failed: a missing default export never mounts, an
 * unbalanced brace never parses, Math.random breaks frame-for-frame
 * determinism, and a Sequence running past the last frame renders
 * nothing on screen.
 *
 * Runs on a string, costs nothing, and catches the failures that would
 * otherwise cost a round trip to the repairer.
 */

/**
 * Identifiers that will always resolve, whatever the composition says.
 * Anything outside this set must be declared or provided by scope.
 */
const GLOBALS = new Set([
  // language
  "Array", "Boolean", "Date", "Error", "Infinity", "JSON", "Map", "Math",
  "NaN", "Number", "Object", "Promise", "Proxy", "RegExp", "Set", "String",
  "Symbol", "WeakMap", "WeakSet", "BigInt", "Intl", "Reflect", "globalThis",
  "undefined", "null", "true", "false", "NaN",
  // module / scope
  "console", "window", "document", "navigator", "location", "history",
  "performance", "fetch", "requestAnimationFrame", "cancelAnimationFrame",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "structuredClone", "URL", "URLSearchParams", "TextEncoder", "TextDecoder",
  "AbortController", "Image", "Audio", "AudioContext", "ResizeObserver",
  "IntersectionObserver", "MutationObserver", "matchMedia", "crypto",
  "require", "module", "exports", "process", "Buffer", "queueMicrotask",
  "Intl", "isNaN", "isFinite", "parseInt", "parseFloat", "encodeURIComponent",
  "decodeURIComponent", "TextDecoder", "DOMException", "Iterator",
  // the render scope the browser compiler injects
  "React", "createElement", "Fragment", "jsx", "jsxs", "jsxDEV", "useMemo",
  "useCallback", "useState", "useRef", "useEffect", "useLayoutEffect",
  "useContext", "createContext", "forwardRef", "memo", "Children", "isValidElement",
  "AbsoluteFill", "Sequence", "Img", "CanvasImage", "HtmlInCanvas", "IFrame", "Solid", "Video", "Audio_", "Audio_Impl", "Audio",
  "Still", "Series", "Loop", "Freeze", "Interpolate", "spring", "interpolate",
  "Easing", "random", "createEffect", "measureSpring", "noise", "noise2D", "noise3D", "noise4D", "wrap",
  "useCurrentFrame", "useVideoConfig", "continueRender", "delayRender",
  "staticFile", "getInputProps", "calculateMetadata", "registerRoot",
  "Composition", "Folder", "Audio", "OffthreadVideo", "MediaPlayer",
  "Icons", "Fonts", "TransitionSeries", "Transition", "shapes", "paths",
  "motionBlur", "Trail", "CameraMotionBlur", "HtmlInCanvasMotionBlur", "MediaVideo", "MediaAudio", "Lottie", "Gif", "AnimatedImage",
  "Img", "Media", "Rough", "RoughLine", "RoughRect", "RoughCircle", "RoughText",
  "RoughDiamond", "RoughEllipse", "RoughPath", "RoughPolygon",
  "RoughTriangle", "RoughArrow", "RoughSketch", "RoughBox", "RoughSequence",
  "Type", "parseMedia", "TikTokStyle", "Highlight", "Words", "combineTokens",
  "springValue", "interpolateColors", "makeTransform", "translate",
  "rotate", "scale", "skew", "perspective", "mapValue", "interpolateStyles",
  "interpolateTransform", "measureText", "wrapText", "wrapMarked",
  "transformPerspective", "useVideoConfig_", "createNoise2D", "createNoise3D",
  // reserved words — a keyword is never a free variable
  "break", "case", "catch", "class", "const", "continue", "debugger",
  "default", "delete", "do", "else", "export", "extends", "finally", "for",
  "function", "if", "import", "in", "instanceof", "let", "new", "of",
  "return", "static", "super", "switch", "this", "throw", "try", "typeof",
  "var", "void", "while", "with", "yield", "as", "from", "async", "await",
  "get", "set", "type", "interface", "enum", "implements", "declare",
  "readonly", "public", "private", "protected", "namespace", "satisfies",
  "arguments", "keyof", "infer", "is", "asserts", "abstract", "override",
  // JSX intrinsics — a lowercase tag is an element, not a variable
  "div", "span", "p", "a", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5",
  "h6", "img", "svg", "path", "circle", "rect", "g", "line", "polyline",
  "polygon", "text", "tspan", "defs", "linearGradient", "stop", "ellipse",
  "button", "input", "label", "canvas", "video", "audio", "table", "tbody",
  "thead", "tr", "td", "th", "section", "main", "nav", "header", "footer",
  "strong", "em", "small", "code", "pre", "b", "i", "u", "br", "hr", "useRef",
])

/**
 * Strips strings, template bodies, comments and JSX text so identifier
 * scanning does not trip over prose.
 */
/**
 * Blanks string literals, template bodies and comments.
 *
 * The base masking pass. Split out so `findUnclosedJsx` can share it instead
 * of re-running its own identical 5-regex chain — together with `codeOnly`
 * that was 13 full-text passes per lint, all on the same bytes.
 */
function maskStringsAndComments(code: string): string {
  // Strings first, so a `//` inside a quoted URL is not read as a comment.
  return code
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
}

/**
 * True when the source has already been through `codeOnly`.
 *
 * `codeOnly` blanks strings/comments to empty quotes, so the residue is
 * almost entirely quotes. This is a heuristic, not a proof — it only decides
 * whether a redundant mask can be skipped, and the JSX tag scan is tolerant
 * either way. The alternative (always re-masking) costs the pass we are
 * trying to avoid.
 */
function isMasked(code: string): boolean {
  // An unmasked composition has real text between quotes; a masked one has
  // been reduced to bare punctuation by the type/JSX strips as well.
  return !/["'][^"'\n]{2,}["']/.test(code)
}

function codeOnly(code: string): string {
  // Mask strings and comments before comments: otherwise the `//` in
  // a URL such as `src="https://…"` looks like a line comment, eats the
  // closing quote, and produces phantom undefined identifiers downstream.
  const stripped = maskStringsAndComments(code)
    // Type generics before the JSX-text strip: `Array<string>` is a type,
    // Type generics before the JSX-text strip: `Array<string>` is a type,
    // not a tag — without this, `<string>` opens a "tag" and the strip
    // below eats everything up to the next `<`, including declarations.
    // Only value-position generics are masked (preceded by a word char,
    // `)` or `]` — never `>`, `(`, space or `=` — so nested JSX tags and
    // unimported components are still seen). Spaceless `a<b>` comparisons
    // are the known ambiguity; spaced comparisons are unaffected.
    .replace(
      /([\w)\]])\s*<([A-Za-z_$][\w$]*(?:\.[\w$]+)*(?:\s*\|\s*[A-Za-z_$][\w$]*(?:\.[\w$]+)*)*(?:\s*\[\])*)>/g,
      "$1"
    )
    .replace(/>([^<>{}]*)</g, "><")

  return stripJsxAttributeNames(stripTypeAnnotations(stripped))
}

/**
 * Removes TypeScript type syntax so identifier scanning sees values only.
 * Type names (`string`, `MyProps`, `Array<string>`) are not runtime
 * variables — without this, every annotated declaration (`const x: number`,
 * `(a: Foo) =>`, `x as string`, `interface P {…}`) is reported as
 * undefined and the agent burns runs "fixing" correct code.
 *
 * Runs on masked source (strings/comments already blanked), and only
 * touches unambiguous positions: declaration sites, parameter lists,
 * `as` casts, and whole interface/type-alias declarations. Object
 * literals, ternaries, labels and comparisons are deliberately not
 * matched (their `:`/`as` never sits in these positions).
 */
function stripTypeAnnotations(src: string): string {
  let out = src
  // Whole interface declarations (pure types, may hold `x: T` members).
  out = out.replace(/^[ \t]*interface\s+[A-Za-z_$][\w$]*[^\n{]*\{[^}]*\}/gm, " ")
  // Whole `type X = …;` aliases at statement level.
  out = out.replace(/^[ \t]*type\s+[A-Za-z_$][\w$]*\s*=[^;\n]+;?/gm, " ")
  // `x as SomeType` casts (but never `import * as Foo`).
  out = out.replace(
    /(?<!\*\s)\bas\s+[A-Za-z_$][\w$]*(?:\.[\w$]+)*(?:\s*<[^=<>]*>)?(?:\s*\[\])?/g,
    ""
  )
  const base = String.raw`[A-Za-z_$][\w$]*(?:\.[\w$]+)*(?:\s*<[^=<>]*>)?(?:\s*\[\])*`
  const union = String.raw`(?:\s*\|\s*${base})*`
  const typeName = String.raw`(?:${base}${union}|\{[^}]*\})`
  // `const|let|var name: Type =` — keeps the declaration and initializer.
  out = out.replace(
    new RegExp(`((?:const|let|var)\\s+[A-Za-z_$][\\w$]*)\\s*:\\s*${typeName}(?=\\s*[=;,\n])`, "g"),
    "$1"
  )
  // `(name: Type, …)` / `(name: Type = default)` params — keeps name+default.
  out = out.replace(
    new RegExp(`([,(\\[]\\s*)([A-Za-z_$][\\w$]*)\\s*:\\s*${typeName}(?=\\s*[,)=]|\\s*=)`, "g"),
    "$1$2"
  )
  // `({a, b}: Props)` destructured params — keeps the bindings.
  out = out.replace(
    new RegExp(`([,(\\[]\\s*)(\\{[^{}]*\\})\\s*:\\s*${typeName}(?=\\s*[,)=]|\\s*=)`, "g"),
    "$1$2"
  )
  // `): ReturnType =>` / `): ReturnType {` — keeps the paren.
  out = out.replace(
    new RegExp(
      `\\)\\s*:\\s*(?:[A-Z][\\w$.<>\\[\\]\\s|]*|number|string|boolean|void|null|undefined|never|unknown|any|object|\\{[^}]*\\})\\s*(?=\\s*=>|\\s*\\{)`,
      "g"
    ),
    ")"
  )
  return out
}

/**
 * Removes `name=` attribute names that appear directly inside a JSX tag
 * interior, keeping everything else (notably the values). Tag interiors
 * are found with a brace/string-aware scan, so arbitrarily nested
 * `style={{…}}` objects are safe. Only `name=` at the tag's top level
 * counts — comparisons (`a<b`) never produce one because there is no
 * `=` after the name, and `==`/`=>` are excluded by `=(?!=)`.
 */
function stripJsxAttributeNames(src: string): string {
  const out: string[] = []
  let i = 0
  while (i < src.length) {
    const lt = src.indexOf("<", i)
    if (lt === -1) {
      out.push(src.slice(i))
      break
    }
    if (!/[A-Za-z]/.test(src[lt + 1] ?? "")) {
      // Not a tag open (`</`, `<3`, `< `) — copy through.
      out.push(src.slice(i, lt + 1))
      i = lt + 1
      continue
    }
    // Find the tag end with brace depth (strings are masked already).
    let j = lt + 1
    let depth = 0
    let head: string | null = null
    while (j < src.length) {
      const c = src[j]!
      if (c === "{") depth++
      else if (c === "}") depth = Math.max(0, depth - 1)
      else if (depth === 0 && c === ">") {
        head = src.slice(lt, j + 1)
        break
      } else if (depth === 0 && (c === "<" || (c === "/" && src[j + 1] === "<"))) {
        // Another tag starts before this one closed — not a tag.
        break
      }
      j++
    }
    if (head === null) {
      out.push(src.slice(i, lt + 1))
      i = lt + 1
      continue
    }
    out.push(src.slice(i, lt), dropAttrNames(head))
    i = lt + head.length
  }
  return out.join("")
}

/** Drops top-level `name=` pairs from one tag head, keeping the values. */
function dropAttrNames(head: string): string {
  const nameEnd = /^<[A-Za-z][\w.]*/.exec(head)?.[0].length ?? 1
  let cleaned = head.slice(0, nameEnd)
  let k = nameEnd
  let depth = 0
  while (k < head.length) {
    const c = head[k]!
    if (c === "{") depth++
    else if (c === "}") depth = Math.max(0, depth - 1)
    if (depth === 0) {
      const m = /^([A-Za-z_$][\w$]*(?:-[\w]+)*)(\s*=(?![=>]))/.exec(head.slice(k))
      if (m) {
        // Drop the name, keep ` =` so values stay parseable downstream.
        cleaned += m[2]!
        k += m[0].length
        continue
      }
    }
    cleaned += c
    k++
  }
  return cleaned
}

/**
 * Every name the file declares itself: top-level and nested declarations,
 * function parameters, destructured bindings, catch clauses, class members.
 */
/**
 * Names declared anywhere in the file.
 *
 * `masked` is the ALREADY-masked source (strings/comments/JSX/types
 * stripped). It used to be recomputed here via `codeOnly(code)`, which ran
 * an 8-regex full-text chain — and `undefinedIdentifiers` runs that same
 * chain again before calling this. Three full passes over the file per
 * lint, for one result.
 *
 * Masking is pure (it only blanks regions), so every caller needs the exact
 * same string. The caller masks once and passes it down, which removes two
 * of the three passes. Behavior is unchanged: `codeOnly` was deterministic.
 */
function declaredNamesFromMasked(src: string): Set<string> {
  const out = new Set<string>()
  const add = (re: RegExp, g = 1) => {
    for (const m of src.matchAll(re)) {
      const n = m[g]
      if (n) out.add(n)
    }
  }
  add(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)
  add(/\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)/g)
  add(/\bclass\s+([A-Za-z_$][\w$]*)/g)
  // import bindings, including default and namespace
  add(/\bimport\s+([A-Za-z_$][\w$]*)\s*(?:,|from)/g)
  add(/\bimport\s+([A-Za-z_$][\w$]*)\s+from\b/g)
  add(/\bimport\s*\*\s*as\s+([A-Za-z_$][\w$]*)/g)
  add(/\bimport\s*\{([^}]*)\}/g, 0)
  // destructuring, anywhere
  for (const m of src.matchAll(/(?:const|let|var|\bfunction\b|\([^)]*\)|\b\w+)\s*(?:=\s*)?\{([^}]*)\}/g)) {
    for (const part of m[1]!.split(",")) {
      const name = part.split(":").pop()!.split("=")[0]!.trim().replace(/^\.\.\./, "")
      if (/^[A-Za-z_$][\w$]*$/.test(name)) out.add(name)
    }
  }
  // catch parameters
  add(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)
  // single-identifier params: fn(a, b) => / function f(a, b)
  for (const m of src.matchAll(/\(([^()]*)\)\s*(?::[^=]*)?=>/g)) {
    for (const part of m[1]!.split(",")) {
      const name = part.split("=")[0]!.trim().replace(/^\.\.\./, "")
      if (/^[A-Za-z_$][\w$]*$/.test(name)) out.add(name)
    }
  }
  // Named function parameters: fn(a, b) / function f(a, b). Types are
  // already stripped, so `function C(props: P)` reaches here as
  // `function C(props)`.
  for (const m of src.matchAll(/\bfunction\s*\*?\s*(?:[A-Za-z_$][\w$]*\s*)?\(([^()]*)\)/g)) {
    for (const part of m[1]!.split(",")) {
      const name = part.split("=")[0]!.trim().replace(/^\.\.\./, "")
      if (/^[A-Za-z_$][\w$]*$/.test(name)) out.add(name)
    }
  }
  // Destructured function parameters: `function C({ a, b: c })` binds `a`
  // and `c` — the alias after the colon, never the key before it.
  for (const m of src.matchAll(/\bfunction\s*\*?\s*(?:[A-Za-z_$][\w$]*\s*)?\(\{([^}]*)\}/g)) {
    for (const part of m[1]!.split(",")) {
      const target = part.includes(":") ? part.split(":").slice(1).join(":") : part
      const name = target.split("=")[0]!.trim().replace(/^\.\.\./, "")
      if (/^[A-Za-z_$][\w$]*$/.test(name)) out.add(name)
    }
  }
  return out
}

/**
 * Free identifiers the browser would throw "X is not defined" on.
 *
 * The one failure that kept slipping through: the model writes JSX using
 * a component it never imported — `CheckCircle2`, `TrendingUp`, anything
 * from a library it only half-remembers. Every other check passes, the
 * file lints clean, the artifact is published, and the video then fails
 * to mount in the player with a bare ReferenceError. It only surfaces at
 * render time, which is the most expensive possible place to find it.
 *
 * Caught statically, it becomes an ordinary lint error and the existing
 * repair loop fixes it before anything is published.
 */
function undefinedIdentifiers(masked: string): string[] {
  const src = masked
  const declared = declaredNamesFromMasked(masked)
  const bad = new Set<string>()

  for (const m of src.matchAll(/[A-Za-z_$][\w$]*/g)) {
    const name = m[0]!
    // Skip property access, object keys, and JSX attribute names.
    const before = src[m.index - 1]
    if (before === "." || before === "?") continue
    if (declared.has(name) || GLOBALS.has(name)) continue
    // A label or a property shorthand is fine if it is declared anyway.
    bad.add(name)
  }

  // An import list is handled by declaredNames, but `import {a, b}` was
  // captured as one blob; drop anything that only appears inside braces.
  return [...bad]
    // Appearing only inside an import/export list is a binding site, and
    // an object key (`color:`) is a property, not a variable reference.
    .filter((n) => !new RegExp(`[{,]\\s*${n}\\s*[,}]`).test(src))
    .filter((n) => !new RegExp(`\\b${n}\\s*:`).test(src) || declared.has(n))
    .sort()
    .slice(0, 12)
}

export interface LintIssue {
  severity: "error" | "warn"
  code: string
  message: string
}

/** Brace/paren/bracket balance, ignoring strings, comments and JSX text. */
function balanceError(code: string): string | null {
  let depth = 0
  let paren = 0
  let bracket = 0
  let i = 0
  let str: '"' | "'" | "`" | null = null
  let line = 1
  let lineComment = false
  let blockComment = false
  while (i < code.length) {
    const c = code[i]!
    const next = code[i + 1]
    if (c === "\n") {
      line++
      lineComment = false
      i++
      continue
    }
    if (lineComment) {
      i++
      continue
    }
    if (blockComment) {
      if (c === "*" && next === "/") {
        blockComment = false
        i += 2
        continue
      }
      i++
      continue
    }
    if (str) {
      if (c === "\\") {
        i += 2
        continue
      }
      if (c === str) str = null
      i++
      continue
    }
    if (c === "/" && next === "/") {
      lineComment = true
      i += 2
      continue
    }
    if (c === "/" && next === "*") {
      blockComment = true
      i += 2
      continue
    }
    if (c === '"' || c === "'" || c === "`") {
      str = c
      i++
      continue
    }
    if (c === "{") depth++
    else if (c === "}") {
      depth--
      if (depth < 0) return `unbalanced "}" on line ${line}`
    } else if (c === "(") paren++
    else if (c === ")") paren--
    else if (c === "[") bracket++
    else if (c === "]") bracket--
    i++
  }
  if (str) return "unterminated string literal"
  if (depth !== 0) return `${depth > 0 ? "unclosed" : "extra closing"} "{" (${Math.abs(depth)} off)`
  if (paren !== 0) return `unbalanced parentheses (${Math.abs(paren)} off)`
  if (bracket !== 0) return `unbalanced brackets (${Math.abs(bracket)} off)`
  return null
}

const hasDefaultExportRe = /^\s*export\s+default\b/m
const asDefaultRe = /^\s*export\s*\{[^}]*\bas\s+default\b/m

/**
 * `interpolate()` called with a NON-NUMERIC output range.
 *
 * Why this rule exists: the renderer threw
 * "Non-numeric strings can only be interpolated using Easing.step1" at
 * playback, the preview showed nothing, and the agent reported the cut as
 * finished and working. A static check prevents the whole class of failure,
 * because this is decidable from the source — `interpolate()` accepts only
 * numbers (or `Easing.step1` for discrete values), so a string in the
 * output range is always wrong.
 *
 * Catches the shapes that actually appear: percentage strings, colour
 * strings, and any mixed array. Numeric arrays, single values, and variables
 * are left alone — a variable could hold a number at runtime and guessing
 * would produce false errors on correct code.
 */
function nonNumericInterpolations(code: string): LintIssue[] {
  const out: LintIssue[] = []
  // `interpolate(<input>, <range>, <output>[, options])` — the output range is
  // the 3rd argument. Match balanced-ish up to the closing paren.
  for (const m of code.matchAll(/\binterpolate\s*\(/g)) {
    const open = m.index + m[0].length - 1
    let depth = 0
    let i = open
    for (; i < code.length; i++) {
      const c = code[i]
      if (c === "(") depth++
      else if (c === ")") {
        depth--
        if (depth === 0) break
      }
    }
    const args = splitTopLevelArgs(code.slice(open + 1, i))
    if (args.length < 3) continue
    const outputRange = args[2]!.trim()
    if (!outputRange.startsWith("[")) continue
    const entries = splitTopLevelArgs(outputRange.slice(1, -1))
    const bad = entries.filter((e) => e.trim().length > 0 && !isNumericLiteral(e.trim()))
    if (bad.length === 0) continue
    // Easing.step1 is the one legitimate way to interpolate discrete values,
    // so only report when the call does NOT ask for it.
    const options = args.slice(3).join(",")
    if (/Easing\s*\.\s*step1/.test(options)) continue
    out.push({
      severity: "error",
      code: "interpolate-non-numeric",
      message:
        `FIX: interpolate() received a non-numeric output value (${bad.map((b) => b.trim()).join(", ").slice(0, 60)}). ` +
        "The renderer throws \"Non-numeric strings can only be interpolated using Easing.step1\" " +
        "and the video shows nothing. Interpolate a NUMBER and put it into the style instead — " +
        'e.g. interpolate(f, [0, 30], [0, 1]) then use `scale: 0.94 + 0.06 * v`, or for a ' +
        "percentage use a numeric 0-1 and multiply by 100 in the template. Only pass strings " +
        "with { easing: Easing.step1 }.",
    })
  }
  return out
}

/** Split `a, b, c` on top-level commas only (brackets/strings respected). */
function splitTopLevelArgs(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote: string | null = null
  let cur = ""
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    if (quote) {
      cur += c
      if (c === "\\") {
        cur += s[++i] ?? ""
      } else if (c === quote) {
        quote = null
      }
      continue
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c
      cur += c
      continue
    }
    if (c === "(" || c === "[" || c === "{") depth++
    else if (c === ")" || c === "]" || c === "}") depth--
    if (c === "," && depth === 0) {
      out.push(cur)
      cur = ""
      continue
    }
    cur += c
  }
  if (cur.trim()) out.push(cur)
  return out
}

/** True for numeric literals and simple numeric arithmetic. */
function isNumericLiteral(s: string): boolean {
  const t = s.replace(/\s+/g, "")
  if (t === "") return false
  if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return true
  // `1 - 0.5`, `2 * v`, `Math.PI / 2` — arithmetic on numbers is still numeric.
  if (/^[\d.eE+\-*/()\s]|Math\.[A-Za-z]+|Infinity|NaN/.test(t) && !/["'`]/.test(t)) return true
  return false
}

/**
 * Inline binary payloads: `data:` URIs and `base64,` blobs.
 *
 * This is here because of how it actually failed. A brief asked for a
 * cursor reveal, the model "added film grain" by embedding a base64 PNG
 * data URI in the composition, and that single string was larger than the
 * entire rest of the file. The consequences all compound:
 *
 *   1. `write_composition` carries the file as TOOL-CALL ARGUMENTS, so the
 *      response blew past `maxOutputTokens` (16.2K emitted against a 16K
 *      cap, twice in a row), the JSON arguments never closed, and the SDK
 *      marked the call invalid WITHOUT running it. The gateway logged 200,
 *      the Worker logged nothing, and the user got "Something went wrong".
 *   2. The model then retried the same oversized write five more times,
 *      burning ~$0.015 and eight minutes, because the failure never told
 *      it what was wrong.
 *   3. Nothing else in the pipeline would have caught it: staticFile()
 *      cannot resolve an inline blob, so the preview could not play it.
 *
 * So it is a BLOCKING error, checked in both the cheap and the full lint,
 * and it is a single regex — the point is to reject the write in about a
 * millisecond instead of discovering it 88 seconds and 16K tokens later.
 * The fix is always the same and always cheap: `noise2D()` from
 * `@remotion/noise` for grain, or `staticFile()` for a real asset.
 */
const dataUriRe = /data:(?:image|video|audio|application|font)\/[a-z0-9.+-]+\s*;\s*base64,/i

function dataUriIssue(code: string): LintIssue | null {
  const m = code.match(dataUriRe)
  if (!m) return null
  return {
    severity: "error",
    code: "data-uri",
    message:
      // LEAD WITH THE FIX, not the reason. This message is the model's next
      // input, and an observed failure was it reading the prose explanation,
      // missing the remedy, and re-issuing the identical write while
      // confidently reporting a DIFFERENT cause ("I didn't include the full
      // file content"). One imperative sentence first; the "why" after.
      `FIX: delete the base64 image and get grain/texture from noise2D() in ` +
      `@remotion/noise (or a real asset via staticFile()). Then write the file again. ` +
      `WHY: the embedded blob was ${m[0].slice(0, 24)}… — inline binary is never ` +
      `correct here and it is what makes a composition too large to write.`,
  }
}

/**
 * CPU-aware size ceiling for the static gate.
 *
 * Measured: the lint is linear at ~0.42ms/KB (2KB → 2.9ms, 61KB → 25.5ms).
 * That is free below a few KB and over budget past ~15KB, and the write
 * tool accepts 120KB — a single large composition could burn ~50ms, more
 * than the whole per-request allowance, on a CPU-capped plan.
 *
 * So above this size the gate runs a REDUCED check: balance/syntax and the
 * default export (both single cheap passes, and the two that catch the
 * failures that actually break playback), but skips the identifier analysis,
 * which is the multi-pass part and costs proportionally the most.
 *
 * This is a deliberate trade: a 40KB file loses the "unimported component"
 * check. That failure still surfaces — the browser player reports it, and
 * the existing repair loop fixes it from the real error. Trading a
 * second-line static check for keeping the request alive is the right way
 * round, and it costs nothing for the 2-15KB files that make up almost all
 * real compositions.
 */
export const LINT_FULL_SIZE_LIMIT = 15_000

/**
 * Cheap gate for oversized files: what still must hold for the thing to
 * mount at all. No cache — it is already the fast path.
 */
function lintOversized(code: string, meta?: { durationInFrames?: number }): LintIssue[] {
  const issues: LintIssue[] = []
  if (code.trim() === "") {
    return [{ severity: "error", code: "empty", message: "The composition is empty." }]
  }
  if (/^\s*```/m.test(code) && !/^\s*```[\s\S]*^\s*```\s*$/m.test(code)) {
    issues.push({
      severity: "error",
      code: "fence",
      message: "The file has an unclosed markdown fence.",
    })
  }
  if (!hasDefaultExportRe.test(code) && !asDefaultRe.test(code)) {
    issues.push({
      severity: "error",
      code: "no-default-export",
      message: "The file has no default export, so nothing can mount it.",
    })
  }
  // Inline binary. Checked on the cheap path too: this is precisely the
  // oversized-file case, and it is the reason files get oversized.
  const inline = dataUriIssue(code)
  if (inline) issues.push(inline)
  const bal = balanceError(code)
  if (bal) {
    issues.push({ severity: "error", code: "balance", message: `Syntax: ${bal}.` })
    return issues
  }
// Cheap literal scans — one pass each, no identifier analysis.
  if (/\bMath\.random\s*\(/.test(code)) {
    issues.push({
      severity: "error",
      code: "math-random",
      message: "Math.random() is not deterministic — the same frame renders differently every time. Use random(\"seed\") from remotion.",
    })
  }
  for (const bad of nonNumericInterpolations(code)) {
    issues.push(bad)
  }
  if (meta?.durationInFrames) {
    const end = meta.durationInFrames
    for (const m of code.matchAll(/\bfrom=\{?(\d+)\}?/g)) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n >= end) {
        issues.push({
          severity: "warn",
          code: "past-end",
          message: `A Sequence starts at frame ${n} but the cut ends at ${end - 1} — it will never be seen.`,
        })
        break
      }
    }
  }
  return issues
}

export function lintComposition(
  code: string,
  meta?: { durationInFrames?: number }
): LintIssue[] {
  if (code.length > LINT_FULL_SIZE_LIMIT) {
    return lintOversized(code, meta)
  }
  const issues: LintIssue[] = []
  if (code.trim() === "") {
    return [{ severity: "error", code: "empty", message: "The composition is empty." }]
  }

  // Markdown fences and prose are the most common failure, and they are
  // detectable without parsing.
  if (/^\s*```/m.test(code) && !/^\s*```[\s\S]*^\s*```\s*$/m.test(code)) {
    issues.push({
      severity: "error",
      code: "fence",
      message: "The file has an unclosed markdown fence.",
    })
  }

  if (!hasDefaultExportRe.test(code) && !asDefaultRe.test(code)) {
    issues.push({
      severity: "error",
      code: "no-default-export",
      message: "The file has no default export, so nothing can mount it.",
    })
  }

  const inlineFull = dataUriIssue(code)
  if (inlineFull) issues.push(inlineFull)

  const bal = balanceError(code)
  if (bal) {
    issues.push({ severity: "error", code: "balance", message: `Syntax: ${bal}.` })
    // Everything below assumes the file parses; reporting more would be
    // noise built on a broken parse.
    return issues
  }

  if (/\bMath\.random\s*\(/.test(code)) {
    issues.push({
      severity: "error",
      code: "math-random",
      message:
        "Math.random() is not deterministic — the same frame renders differently every time. Use random(\"seed\") from remotion.",
    })
  }

  // A non-numeric interpolate output range throws at playback, so the
  // preview goes black while the write still lints clean. Decidable from
  // source, so it is caught before the write is ever accepted.
  for (const bad of nonNumericInterpolations(code)) {
    issues.push(bad)
  }

  if (/\b(Date\.now|new\s+Date|performance\.now)\s*\(/.test(code)) {
    issues.push({
      severity: "warn",
      code: "wall-clock",
      message:
        "Wall-clock time in a composition is non-deterministic. Drive it from `frame` instead.",
    })
  }

  /**
   * Per-character spans with inline-block collapse spaces: "THE FUTURE"
   * renders "THEFUTURE" because each space becomes an empty zero-width
   * span. Seen for real on a typewriter cut. Warn (don't block — some
   * files handle it) with the exact fix.
   */
  if (/\.split\(\s*["']{2}\s*\)/.test(code) && /inline-block/.test(code)) {
    const preservesSpace =
      /whiteSpace\s*:\s*["']pre/.test(code) ||
      /\\u00a0/.test(code) ||
      /&nbsp;/.test(code) ||
      /whiteSpace\s*:\s*["']pre-wrap/.test(code)
    if (!preservesSpace) {
      issues.push({
        severity: "warn",
        code: "per-char-spacing",
        message:
          "Per-character inline-block spans collapse spaces — 'THE FUTURE IS WRITTEN' renders 'THEFUTUREISWRITTEN'. Preserve whitespace: add whiteSpace:'pre' to each char span, render spaces as \\u00A0 placeholders with width, or reveal progressively with text.slice(0, n) instead of per-char spans.",
      })
    }
  }

  /**
   * Redeclaring a scope binding is a hard SyntaxError, not a style
   * problem: the evaluator supplies `Fonts` as a parameter, so a
   * top-level `const Fonts = …` collides with it and the file will not
   * parse at all. Seen for real — the model assumed it had to construct
   * the font object and wrote `const Fonts = window.Fonts || {}`.
   */
  const redeclaresScope = ["Fonts"].filter(
    (name) => new RegExp(`^[ \\t]*(?:const|let|var|function|class)\\s+${name}\\b`, "m").test(code)
  )
  if (redeclaresScope.length > 0) {
    issues.push({
      severity: "error",
      code: "shadow-scope",
      message: `\`${redeclaresScope.join(", ")}\` is already provided to the file. Do not declare, assign to, or read it from window — just use it. Delete the line.`,
    })
  }

  // window/document touched outside a function body — the render worker has
  // no DOM at module scope.
  const moduleScopeDom = code
    .split("\n")
    .filter((l) => /^\s*(window|document|localStorage|navigator)\b/.test(l))
  if (moduleScopeDom.length > 0) {
    issues.push({
      severity: "warn",
      code: "module-dom",
      message:
        "A browser global is used at module scope. The render worker has no DOM — move it inside a hook or effect.",
    })
  }

  const unclosedTags = findUnclosedJsx(code)
  if (unclosedTags) {
    issues.push({
      severity: "error",
      code: "jsx",
      message: `JSX: ${unclosedTags}`,
    })
  }

  if (meta?.durationInFrames) {
    const end = meta.durationInFrames
    // Sequence `from` past the last frame never plays.
    for (const m of code.matchAll(/\bfrom=\{?(\d+)\}?/g)) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n >= end) {
        issues.push({
          severity: "warn",
          code: "past-end",
          message: `A Sequence starts at frame ${n} but the cut ends at ${end - 1} — it will never be seen.`,
        })
        break
      }
    }
  }

  if (/\{\s*\/\*\s*add|TODO|FIXME|placeholder/i.test(code)) {
    issues.push({
      severity: "warn",
      code: "unfinished",
      message: "The file still contains placeholder markers.",
    })
  }

  // Masked once, shared by every helper below. `codeOnly` is an 8-regex
  // full-text chain; it used to run three times per lint (twice directly,
  // once inside declaredNames), which measured at ~25ms on a realistic
  // 8KB composition — over the whole CPU budget on its own.
  const masked = codeOnly(code)
  const free = undefinedIdentifiers(masked)
  if (free.length > 0) {
    issues.push({
      severity: "error",
      code: "undefined-identifier",
      message: `Not defined anywhere in the file and not in scope: ${free.join(", ")}. ` +
        `If it is a component or hook, declare it in this file or reach it through the provided scope (Icons.*, shapes.*, TransitionSeries, etc.) — do not import a library that is not there.`,
    })
  }

  return issues
}

/**
 * Cheap JSX tag-balance check. Counts opening and closing tags for
 * capitalised and lowercase names, ignoring anything inside a string.
 * Good enough to catch the truncation that produces the classic
 * "unexpected end of file" render failure.
 */
function findUnclosedJsx(code: string): string | null {
  const stack: string[] = []
  // Strings and comments are already blanked by `codeOnly` in the caller, so
  // this re-ran 5 more full-text regex passes over the same file for a result
  // the mask already encodes. Kept as a defensive local mask (a direct caller
  // with raw source would otherwise see tags inside strings) but skipped when
  // the input is already masked.
  const clean = isMasked(code) ? code : maskStringsAndComments(code)
  const re = /<\/?([A-Za-z][\w.]*)((?:[^<>'"]|"[^"]*"|'[^']*')*?)(\/?)>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(clean))) {
    const whole = m[0]
    if (whole.startsWith("</")) {
      const name = m[1]!
      const at = stack.lastIndexOf(name)
      if (at === -1) return `</${name}> closes something that was never opened`
      stack.splice(at, 1)
    } else if (m[3] === "/" || whole.endsWith("/>")) {
      /* self-closing */
    } else {
      stack.push(m[1]!)
    }
  }
  if (stack.length > 0) return `<${stack[stack.length - 1]}> is never closed`
  return null
}

/** Issues that must be fixed before the composition is worth showing. */
export function blockingIssues(issues: LintIssue[]): LintIssue[] {
  return issues.filter((i) => i.severity === "error")
}

/** One compact block for a repair prompt. */
export function describeIssues(issues: LintIssue[]): string {
  return issues.map((i) => `- [${i.code}] ${i.message}`).join("\n")
}

/** FNV-1a 32-bit — one pass, ~0.1ms per 100KB. Cache key, not security. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Lint-result cache. Measured: ~0.25ms per KB, and a turn lints the SAME
 * content three times (edit gate → validate → preview gate). The second
 * and third runs are pure waste — same bytes, same verdict. The cache
 * (length + hash key, 200-entry LRU, module-level so warm isolates hit)
 * turns them into sub-millisecond lookups with zero behavior change.
 * This is the single biggest per-request CPU cut in the pipeline, and
 * what makes one-step-per-request viable on CPU-capped plans.
 */
const LINT_CACHE = new Map<string, LintIssue[]>()
const LINT_CACHE_MAX = 200

export function lintCompositionCached(
  code: string,
  meta?: { durationInFrames?: number }
): LintIssue[] {
  const key = `${code.length}:${fnv1a(code)}:${meta?.durationInFrames ?? "-"}`
  const hit = LINT_CACHE.get(key)
  if (hit) {
    // LRU refresh.
    LINT_CACHE.delete(key)
    LINT_CACHE.set(key, hit)
    return hit
  }
  const issues = lintComposition(code, meta)
  LINT_CACHE.set(key, issues)
  if (LINT_CACHE.size > LINT_CACHE_MAX) {
    const oldest = LINT_CACHE.keys().next()
    if (!oldest.done) LINT_CACHE.delete(oldest.value)
  }
  return issues
}

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
function codeOnly(code: string): string {
  // Mask strings and template bodies before comments: otherwise the `//` in
  // a URL such as `src="https://…"` looks like a line comment, eats the
  // closing quote, and produces phantom undefined identifiers downstream.
  const stripped = code
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
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
function declaredNames(code: string): Set<string> {
  const src = codeOnly(code)
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
function undefinedIdentifiers(code: string): string[] {
  const src = codeOnly(code)
  const declared = declaredNames(code)
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

export function lintComposition(
  code: string,
  meta?: { durationInFrames?: number }
): LintIssue[] {
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

  const free = undefinedIdentifiers(code)
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
  // Drop comments, strings and template bodies so tags inside them don't count.
  // Strings go first so `//` inside a quoted URL is not read as a comment.
  const clean = code
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
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

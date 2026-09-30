import { transform } from "sucrase"
import { SCOPE } from "./scope"
import { buildOptionalScope } from "./lazy-scope"
import { loadFontsFor, FONTS } from "./fonts"

/**
 * Compiles AI-written TSX into a mountable React component.
 *
 * Pipeline: strip imports → transpile types+JSX → rewrite the ESM export
 * into a plain assignment → evaluate with the real Remotion API in scope.
 *
 * The import strip is what makes this work without a bundler. The model
 * writes `import {AbsoluteFill} from "remotion"` because that is correct
 * Remotion code; those lines are removed and the same names are supplied
 * from `scope.ts`. So the model never has to know about this file, and a
 * composition it writes is also a composition that pastes straight into
 * a real Remotion project.
 */

export class CompileError extends Error {
  /** The offending line, when we can find one. */
  line?: number
  constructor(message: string, line?: number) {
    super(message)
    this.name = "CompileError"
    this.line = line
  }
}

export interface CompiledComposition {
  component: React.ComponentType<Record<string, unknown>>
  /** The JS actually evaluated — shown in the code viewer. */
  js: string
}

/**
 * Removes import/export-from statements. The model writes them; we
 * resolve the names from the scope instead.
 *
 * Handles the forms a model actually emits: side-effect imports, default
 * imports, named imports with aliases, namespace imports, `import type`,
 * and multi-line specifier lists.
 */
export function stripImports(source: string): string {
  // Not line-anchored: a model can put `import {X} from "y"; const C = …`
  // on one line, and an anchored pattern would leave the import in and
  // the file would not parse. The lookbehind stops `myimport` matching.
  // A dynamic `import("x")` has no `from` clause, so it is left alone.
  const WORD = "(?<![$\\w.])"
  return source
    // import ... from "x"  (specifier list may span lines)
    .replace(
      new RegExp(`${WORD}import\\s+(?:type\\s+)?[\\s\\S]*?\\s+from\\s*["'][^"']+["'];?`, "g"),
      ""
    )
    // bare `import "x"` (side-effect only)
    .replace(new RegExp(`${WORD}import\\s*["'][^"']+["'];?`, "g"), "")
    // export ... from "x"  (re-export — nothing to keep)
    .replace(
      new RegExp(
        `${WORD}export\\s+(?:type\\s+)?(?:\\*|\\{[\\s\\S]*?\\})\\s+from\\s*["'][^"']+["'];?`,
        "g"
      ),
      ""
    )
}

/**
 * Rewrites ESM module syntax into a single assignment the wrapper can
 * read. Handles every way a default export can be written.
 *
 * A named `export default function Cut() {}` keeps its hoisted
 * declaration — self-recursive compositions depend on that — and gets an
 * assignment appended at the end rather than being converted to a `const`.
 */
function rewriteExports(js: string): string {
  let out = js
  /** Name of a hoisted default-exported declaration, if there was one. */
  let hoisted: string | null = null

  // These match anywhere, not just at line start: a model routinely writes
  // `const C = () => null; export default C` on a single line, and a
  // line-anchored pattern silently leaves the `export` in the output,
  // which then fails to parse.
  //
  // The lookbehind keeps `myexport` / `obj.export` from matching.
  const WORD = "(?<![$\\w.])"

  // export default function Name(...)  →  function Name(...)  (+ tail assign)
  out = out.replace(
    new RegExp(`${WORD}export\\s+default\\s+(function\\s*\\*?\\s*)([A-Za-z_$][\\w$]*)`, "g"),
    (_m, kw: string, name: string) => {
      hoisted = name
      return `${kw}${name}`
    }
  )
  // export default class Name {}  →  class Name {}  (+ tail assign)
  out = out.replace(
    new RegExp(`${WORD}export\\s+default\\s+(class\\s+)([A-Za-z_$][\\w$]*)`, "g"),
    (_m, kw: string, name: string) => {
      hoisted = name
      return `${kw}${name}`
    }
  )
  // Anonymous function/class default exports have no name to hoist.
  out = out.replace(
    new RegExp(`${WORD}export\\s+default\\s+(function\\s*\\*?\\s*\\(|class\\s*[({])`, "g"),
    "__default = $1"
  )
  // Everything else: export default <expr>  →  __default = <expr>
  out = out.replace(new RegExp(`${WORD}export\\s+default\\s+`, "g"), "__default = ")

  // export { X as default }  /  export { X }  /  export { default }
  out = out.replace(
    new RegExp(`${WORD}export\\s*\\{([^}]*)\\}\\s*;?`, "g"),
    (_whole, inner: string) => {
      const assigns: string[] = []
      for (const spec of inner.split(",").map((s) => s.trim()).filter(Boolean)) {
        const m = spec.match(/^([\w$]+)\s+as\s+default$/)
        if (m) assigns.push(`__default = ${m[1]};`)
        // `export { default }` needs no assignment; the rewrite above
        // already assigned the default expression.
      }
      return assigns.join(" ")
    }
  )

  // Any remaining `export ` prefix is a named export the renderer never
  // reads — drop the keyword and keep the declaration.
  out = out.replace(
    new RegExp(
      `${WORD}export\\s+(?=(?:const|let|var|function|class|async|type|interface|enum)\\b)`,
      "g"
    ),
    ""
  )

  if (hoisted) out += `\n__default = ${hoisted};`
  return out
}

/** Strips a leading `"use strict"` the transpiler may add — the wrapper sets it. */
function dropUseStrict(js: string): string {
  return js.replace(/^\s*(["'])use strict\1\s*;?/, "")
}

export function transpile(source: string): string {
  // Classic JSX runtime: the transpiler emits React.createElement, and
  // `React` is in the scope. The automatic runtime would need a
  // react/jsx-runtime import, which we just stripped.
  const { code } = transform(source, {
    transforms: ["typescript", "jsx"],
    jsxRuntime: "classic",
    production: true,
    filePath: "Composition.tsx",
  })
  return dropUseStrict(code)
}

/**
 * Compiles source into a component.
 *
 * Async because the scope is built for this specific source: the heavy
 * optional packages and the Google Fonts it cites are fetched only when
 * the text actually refers to them, then handed to the evaluator. A cut
 * that mentions none of them resolves against the core scope alone.
 *
 * Throws `CompileError` with a message a repairer can act on — an unknown
 * name, a syntax error, or a file with no default export.
 */
export async function compile(source: string): Promise<CompiledComposition> {
  if (source.trim() === "") {
    throw new CompileError("The composition is empty.")
  }

  const withoutImports = stripImports(source)
  const js = rewriteExports(transpile(withoutImports))

  // Both settle independently and neither can fail the compile: a missing
  // optional package or face degrades to a ReferenceError the model can
  // repair, which beats a blank canvas.
  const [optional, fonts] = await Promise.all([
    // Use the original source here: import provenance tells the scope
    // whether `Video` means Remotion core or `@remotion/media`.
    buildOptionalScope(source),
    loadFontsFor(withoutImports).then(() => ({ Fonts: FONTS })),
  ])

  const scope: Record<string, unknown> = { ...SCOPE, ...optional, ...fonts }
  const scopeKeys = Object.keys(scope)
  const scopeValues = scopeKeys.map((k) => scope[k])

  let result: unknown
  try {
    // eslint-disable-next-line no-new-func
    const factory = new Function(
      ...scopeKeys,
      `"use strict";
let __default;
try {
${js}
} catch (e) {
  throw e;
}
if (typeof __default === "undefined") {
  throw new ReferenceError(
    "This file has no default export, so nothing can mount it."
  );
}
return __default;`
    )
    result = factory(...scopeValues)
  } catch (err) {
    throw toCompileError(err)
  }

  if (typeof result !== "function" && typeof (result as { default?: unknown })?.default !== "function") {
    throw new CompileError(
      "The default export is not a React component — it must be a function that returns JSX."
    )
  }
  const component =
    typeof result === "function"
      ? (result as React.ComponentType<Record<string, unknown>>)
      : ((result as { default: React.ComponentType<Record<string, unknown>> }).default)

  return { component, js }
}


function toCompileError(err: unknown): CompileError {
  const raw = err instanceof Error ? err.message : String(err)
  const isReference =
    err instanceof ReferenceError || /^(\w+) is not defined$/.test(raw.trim())
  const isSyntax = err instanceof SyntaxError || /unexpected|invalid or unexpected/i.test(raw)

  // Turn "Foo is not defined" into an actionable message naming what the
  // model can reach, so the repair round does not have to guess.
  if (isReference) {
    const name = raw.match(/^(\w+) is not defined/)?.[1]
    return new CompileError(
      name
        ? `"${name}" is not available. Only the Remotion API, React and the registered lucide icons are in scope.`
        : raw
    )
  }
  if (isSyntax) {
    const line = /line (\d+)/i.exec(raw)?.[1]
    return new CompileError(
      `Syntax error — the file does not parse. ${raw}`.slice(0, 400),
      line ? Number(line) : undefined
    )
  }
  return new CompileError(raw.slice(0, 400))
}

/**
 * Names the composition referenced that are not in scope. Purely
 * advisory and free — a cheap way to catch a hallucinated import before
 * the player mounts and throws.
 */
export function findUnknownNames(source: string): string[] {
  const declared = new Set<string>()
  const decl = /\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g
  for (const m of source.matchAll(decl)) declared.add(m[1]!)

  const unknown = new Set<string>()
  // Capitalised identifiers are the ones worth checking: hooks,
  // components, and anything the model imported.
  const ident = /(?<![.\w$'"`])([A-Z][A-Za-z0-9_$]{1,})\s*(?=[(<{[\s,;)}])/g
  for (const m of source.matchAll(ident)) {
    const name = m[1]!
    if (declared.has(name)) continue
    if (name in SCOPE) continue
    unknown.add(name)
  }
  return [...unknown]
}

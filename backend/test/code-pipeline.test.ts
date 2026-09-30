import { test } from "node:test"
import assert from "node:assert/strict"
import { blockingIssues, lintComposition } from "../src/lib/code-lint"
import { asArtifact, canvasFor, normalizeCode, resolveFormat } from "../src/lib/artifact"

/**
 * The lint gate is the last check before a composition reaches the
 * browser, and the browser is the only place that can prove a file
 * actually renders. These cover the failures lint exists to catch.
 */

test("an empty file is an error", () => {
  const issues = lintComposition("   ")
  assert.equal(blockingIssues(issues).length, 1)
  assert.equal(issues[0]!.code, "empty")
})

test("a missing default export is an error", () => {
  const issues = lintComposition("const A = () => null")
  assert.ok(blockingIssues(issues).some((i) => i.code === "no-default-export"))
})

test("a balanced component passes", () => {
  const code = `export default function C() {\n  return <div />\n}\n`
  assert.equal(blockingIssues(lintComposition(code)).length, 0)
})

test("an unbalanced brace is an error and stops further checks", () => {
  const issues = lintComposition("export default function C() {\n  return <div />\n")
  const codes = issues.map((i) => i.code)
  assert.ok(codes.includes("balance"))
  // Only the balance finding — every later check assumes it parses.
  assert.equal(issues.length, 1)
})

test("an unclosed JSX tag is an error", () => {
  const issues = lintComposition("export default function C() {\n  return (\n    <div>\n  )\n}\n")
  assert.ok(issues.some((i) => i.code === "jsx"))
})

test("Math.random is an error, not a warning — it breaks determinism", () => {
  const issues = lintComposition("export default () => <div>{Math.random()}</div>")
  const hit = issues.find((i) => i.code === "math-random")
  assert.equal(hit?.severity, "error")
})

test("wall-clock time is a warning", () => {
  const issues = lintComposition("export default () => <div>{Date.now()}</div>")
  const hit = issues.find((i) => i.code === "wall-clock")
  assert.equal(hit?.severity, "warn")
  assert.equal(blockingIssues(issues).length, 0)
})

test("a Sequence starting past the end is flagged", () => {
  const code = 'export default () => <Sequence from={900}><div /></Sequence>'
  const issues = lintComposition(code, { durationInFrames: 150 })
  assert.ok(issues.some((i) => i.code === "past-end"))
})

test("a Sequence inside the cut is not flagged", () => {
  const code = 'export default () => <Sequence from={90}><div /></Sequence>'
  const issues = lintComposition(code, { durationInFrames: 150 })
  assert.equal(issues.filter((i) => i.code === "past-end").length, 0)
})

test("placeholder markers are flagged", () => {
  const issues = lintComposition("export default () => <div>{/* TODO */}</div>")
  assert.ok(issues.some((i) => i.code === "unfinished"))
})

test("strings containing braces do not fake a balance error", () => {
  const code = `export default function C() {\n  const s = "} { [ ("\n  return <div>{s}</div>\n}\n`
  assert.equal(blockingIssues(lintComposition(code)).length, 0)
})

test("a tagged template does not fake a balance error", () => {
  const code = "export default function C() {\n  const s = `a } b { c`\n  return <div>{s}</div>\n}\n"
  assert.equal(blockingIssues(lintComposition(code)).length, 0)
})

// --- artifact ---------------------------------------------------------

test("a bare legacy MotionDoc reads as a doc artifact", () => {
  const legacy = { version: 1, canvas: { format: "16:9" }, bg: "#000", layers: [] }
  const a = asArtifact(legacy)
  assert.equal(a?.kind, "doc")
})

test("a tagged code artifact reads as code", () => {
  const a = asArtifact({
    kind: "code",
    code: "export default () => null",
    width: 1920,
    height: 1080,
    fps: 30,
    durationInFrames: 150,
  })
  assert.equal(a?.kind, "code")
})

test("nonsense is not an artifact", () => {
  assert.equal(asArtifact(null), null)
  assert.equal(asArtifact("hello"), null)
  assert.equal(asArtifact({ kind: "code" }), null)
})

test("out-of-range canvas values are clamped, not rejected", () => {
  const a = normalizeCode({
    kind: "code",
    code: "export default () => null",
    width: 99999,
    height: 1,
    fps: 1000,
    durationInFrames: 0,
  })
  assert.equal(a.width, 3840)
  assert.equal(a.height, 240)
  assert.equal(a.fps, 60)
  assert.equal(a.durationInFrames, 15)
})

test("an explicit aspect in the brief beats the UI picker", () => {
  assert.equal(resolveFormat("make a 9:16 reel about coffee", "16:9"), "9:16")
  assert.equal(resolveFormat("square post for the feed", "16:9"), "1:1")
  assert.equal(resolveFormat("nothing specific here", "9:16"), "9:16")
  assert.equal(resolveFormat("nothing specific here", "16:9"), "16:9")
})

test("canvasFor produces a renderable stage for every format", () => {
  for (const f of ["16:9", "9:16", "1:1"] as const) {
    const c = canvasFor(f, 5, 30)
    assert.equal(c.fps, 30)
    assert.equal(c.durationInFrames, 150)
    assert.ok(c.width > 0 && c.height > 0)
  }
})

test("redeclaring a scope binding is a blocking error", () => {
  // Seen for real: the model assumed it had to build the font object and
  // wrote `const Fonts = window.Fonts || {}`, which collides with the
  // binding the evaluator supplies and will not parse at all.
  const code = `const Fonts = window.Fonts || {}
export default () => <div style={{ fontFamily: Fonts.anton.family }} />
`
  const issues = lintComposition(code)
  const hit = issues.find((i) => i.code === "shadow-scope")
  assert.equal(hit?.severity, "error")
  assert.match(hit!.message, /already provided/)
})

test("using a provided binding is not an error", () => {
  const code = `export default () => <div style={{ fontFamily: Fonts.anton.family }} />
`
  assert.equal(issuesWithCode(lintComposition(code), "shadow-scope").length, 0)
})

function issuesWithCode(issues: ReturnType<typeof lintComposition>, code: string) {
  return issues.filter((i) => i.code === code)
}

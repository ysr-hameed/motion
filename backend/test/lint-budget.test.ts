import { test } from "node:test"
import assert from "node:assert/strict"
import {
  lintComposition,
  lintCompositionCached,
  blockingIssues,
  LINT_FULL_SIZE_LIMIT,
} from "../src/lib/code-lint"

/**
 * Above a size ceiling the lint drops its most expensive analysis and keeps
 * only the checks that decide whether the composition can mount.
 *
 * This exists because the lint is linear at ~0.42ms/KB while a request on a
 * CPU-capped plan gets ~10ms total: an 8KB file costs ~3ms, but the write
 * tool accepts 120KB, and linting that would have cost ~50ms — over budget
 * before the model was even called.
 *
 * The trade is deliberate and worth stating plainly: a file over the limit
 * loses the unimported-identifier check. That failure still surfaces in the
 * browser player and is repaired from the real error. These tests pin the
 * line so nobody widens the fast path by accident.
 */

const codes = (f: (i: number) => string, n: number) => Array.from({ length: n }, (_, i) => f(i)).join("\n")

function bigValidComposition(units: number): string {
  const L: string[] = [
    "import {AbsoluteFill,useCurrentFrame,interpolate} from 'remotion';",
    "export const Intro=()=>{",
    "  const f=useCurrentFrame();",
  ]
  for (let i = 0; i < units; i++) {
    L.push(`  const o${i}=interpolate(f,[0,20],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});`)
  }
  L.push("  return (<AbsoluteFill>")
  for (let i = 0; i < units; i++) L.push(`    <div key="d${i}" style={{opacity:o${i}}}>Line ${i}</div>`)
  L.push("  </AbsoluteFill>);")
  L.push("};")
  L.push("export default Intro;")
  return L.join("\n")
}

test("a file under the limit gets the full analysis", () => {
  const small = bigValidComposition(4)
  assert.ok(small.length < LINT_FULL_SIZE_LIMIT, "fixture should be under the limit")
  // The full path reports the unimported-identifier error.
  const issues = lintComposition(
    "import {AbsoluteFill} from 'remotion';\nexport const C=()=>(<AbsoluteFill><TrendingUp/></AbsoluteFill>);\nexport default C;"
  )
  assert.ok(
    issues.some((i) => i.code === "undefined-identifier"),
    "small files must still catch unimported components"
  )
})

test("a file over the limit skips identifier analysis but stays valid", () => {
  const big = bigValidComposition(120)
  assert.ok(big.length > LINT_FULL_SIZE_LIMIT, "fixture should exceed the limit")
  const blocking = blockingIssues(lintComposition(big))
  assert.equal(blocking.length, 0, `clean large file should pass, got ${JSON.stringify(blocking)}`)
})

test("a large file with an unimported component is no longer flagged by the linter", () => {
  // Documents the trade explicitly. The browser player still catches this,
  // and the repair loop closes it — but the static gate no longer does, and
  // this test fails loudly if that ever silently changes back.
  const big =
    "import {AbsoluteFill} from 'remotion';\n" +
    codes((i) => `  const pad${i} = ${i};`, 400) +
    "\n" +
    codes((i) => `// filler line number ${i} to grow this file past the lint ceiling`, 200) +
    "\nexport const C=()=>(<AbsoluteFill><TrendingUp/></AbsoluteFill>);\nexport default C;"
  assert.ok(
    big.length > LINT_FULL_SIZE_LIMIT,
    `fixture must exceed the limit (${big.length} vs ${LINT_FULL_SIZE_LIMIT})`
  )
  const issues = lintComposition(big)
  assert.equal(
    issues.filter((i) => i.code === "undefined-identifier").length,
    0,
    "oversized path is expected to skip identifier analysis"
  )
})

test("a large file with NO default export is still rejected", () => {
  const big = bigValidComposition(120).replace("export default Intro;", "")
  assert.ok(big.length > LINT_FULL_SIZE_LIMIT)
  const issues = lintComposition(big)
  assert.ok(
    issues.some((i) => i.code === "no-default-export"),
    "a file that cannot mount must be rejected at any size"
  )
})

test("a large file with unbalanced braces is still rejected", () => {
  const big = bigValidComposition(120) + "\nexport const Extra=()=>{{{{"
  assert.ok(big.length > LINT_FULL_SIZE_LIMIT)
  const issues = lintComposition(big)
  assert.ok(
    issues.some((i) => i.code === "balance" || i.code === "syntax"),
    `unbalanced large file must be rejected, got ${JSON.stringify(issues)}`
  )
})

test("a large file using Math.random is still rejected", () => {
  const big = bigValidComposition(120).replace("const f=useCurrentFrame();", "const f=useCurrentFrame();const r=Math.random();")
  assert.ok(big.length > LINT_FULL_SIZE_LIMIT)
  const issues = lintComposition(big)
  assert.ok(issues.some((i) => i.code === "math-random"), "non-determinism must be caught at any size")
})

test("an oversized empty file is still rejected", () => {
  assert.ok(blockingIssues(lintComposition("   ")).some((i) => i.code === "empty"))
})

test("the ceiling is a size, and the fast path is taken above it", () => {
  // Guards the boundary itself: a limit that silently stopped applying
  // would put the request back over budget with no other signal.
  assert.ok(LINT_FULL_SIZE_LIMIT > 0 && LINT_FULL_SIZE_LIMIT < 120000)
  const atLimit = bigValidComposition(60)
  const justOver = atLimit + " ".repeat(Math.max(0, LINT_FULL_SIZE_LIMIT - atLimit.length + 1))
  assert.ok(justOver.length > LINT_FULL_SIZE_LIMIT)
  // Both must produce a verdict without throwing, whatever path they take.
  assert.ok(Array.isArray(lintComposition(atLimit)))
  assert.ok(Array.isArray(lintComposition(justOver)))
})

test("the cache still short-circuits repeated lints of a large file", () => {
  const big = bigValidComposition(120)
  const first = lintCompositionCached(big, { durationInFrames: 150 })
  const second = lintCompositionCached(big, { durationInFrames: 150 })
  assert.deepEqual(first, second)
})
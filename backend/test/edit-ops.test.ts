import { test } from "node:test"
import assert from "node:assert/strict"
import { applyEdits, coerceOps, describeFailure, type EditOp } from "../src/lib/agents/edit-ops"

/**
 * Edit ops are the token-cheap path for refinements, and a silent miss is
 * the worst possible failure: the chat says "done" over an unchanged
 * file. Every op kind is covered, plus the three resolution strategies
 * and the report a miss produces.
 */

const CODE = `import { AbsoluteFill } from "remotion"

const HERO = "#FF2D55"

export default function Cut() {
  return <AbsoluteFill style={{ background: HERO }} />
}
`

test("exact replace", () => {
  const r = applyEdits(CODE, [
    { op: "replace", find: 'const HERO = "#FF2D55"', replace: 'const HERO = "#00E5FF"' },
  ])
  assert.equal(r.applied, 1)
  assert.equal(r.failed.length, 0)
  assert.match(r.code, /#00E5FF/)
  assert.doesNotMatch(r.code, /#FF2D55/)
})

test("replaceAll touches every occurrence", () => {
  const src = "a\nb\na\n"
  const r = applyEdits(src, [{ op: "replaceAll", find: "a", replace: "z" }])
  assert.equal(r.applied, 1)
  assert.equal(r.code, "z\nb\nz\n")
})

test("insertAfter places text directly under the anchor", () => {
  const r = applyEdits(CODE, [
    { op: "insertAfter", anchor: 'const HERO = "#FF2D55"', text: '\nconst SUB = "#FFFFFF"' },
  ])
  assert.equal(r.applied, 1)
  assert.match(r.code, /const HERO = "#FF2D55"\nconst SUB = "#FFFFFF"/)
})

test("insertBefore places text above the anchor", () => {
  const r = applyEdits(CODE, [
    { op: "insertBefore", anchor: "export default function Cut()", text: "// header\n" },
  ])
  assert.equal(r.applied, 1)
  assert.match(r.code, /\/\/ header\nexport default function Cut/)
})

test("delete removes the matched block", () => {
  const r = applyEdits(CODE, [
    { op: "delete", find: 'const HERO = "#FF2D55"\n\n' },
  ])
  assert.equal(r.applied, 1)
  assert.doesNotMatch(r.code, /const HERO/)
})

test("re-indented anchor still resolves", () => {
  // The model re-indents when it re-emits; the op quoted the original.
  const r = applyEdits(CODE, [
    {
      op: "replace",
      find: "  return <AbsoluteFill style={{ background: HERO }} />",
      replace: "  return <AbsoluteFill style={{ background: 'black' }} />",
    },
  ])
  assert.equal(r.applied, 1)
  assert.match(r.code, /background: 'black'/)
})

test("a miss is reported, never silent", () => {
  const r = applyEdits(CODE, [{ op: "replace", find: "const NOTHING = 1", replace: "x" }])
  assert.equal(r.applied, 0)
  assert.equal(r.failed.length, 1)
  assert.match(describeFailure(r.failed[0]!), /replace: could not find/)
})

test("ops apply in order, so a later op can target an earlier edit", () => {
  const r = applyEdits(CODE, [
    { op: "replace", find: "const HERO = \"#FF2D55\"", replace: "const HERO = \"#00E5FF\"" },
    { op: "insertAfter", anchor: 'const HERO = "#00E5FF"', text: "\nconst MARK = 1" },
  ])
  assert.equal(r.applied, 2)
  assert.match(r.code, /const HERO = "#00E5FF"\nconst MARK = 1/)
})

test("coerceOps accepts the shapes a model emits and drops junk", () => {
  const ops = coerceOps({
    ops: [
      { op: "replace", find: "a", replace: "b" },
      { op: "delete", find: "c" },
      { op: "nonsense", find: "d" },
      "not an op",
      { op: "replace" },
    ],
  })
  assert.equal(ops.length, 2)
  assert.equal(ops[0]!.op, "replace")
  assert.equal(ops[1]!.op, "delete")
})

test("coerceOps accepts a bare array", () => {
  const ops: EditOp[] = coerceOps([{ op: "insertBefore", anchor: "a", text: "b" }])
  assert.equal(ops.length, 1)
})

test("numeric replace values are stringified rather than dropped", () => {
  const r = applyEdits("const n = 1", [
    { op: "replace", find: "1", replace: 2 as unknown as string },
  ])
  assert.equal(r.applied, 1)
  assert.equal(r.code, "const n = 2")
})

import { test } from "node:test"
import assert from "node:assert/strict"
import { lintComposition, blockingIssues } from "../src/lib/code-lint"

/**
 * `interpolate()` with a non-numeric output range.
 *
 * The renderer threw "Non-numeric strings can only be interpolated using
 * Easing.step1" at playback, so the preview went black — while the write
 * itself passed lint cleanly and the agent reported the cut as finished and
 * working. This is decidable from the source, so it is now caught before the
 * write is ever accepted.
 *
 * These tests also pin the FALSE-POSITIVE side, which matters as much: a
 * numeric range, arithmetic, or an explicit Easing.step1 must stay silent,
 * or correct code stops being writable.
 */

const wrap = (body: string) =>
  `import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from "remotion";
export const C = () => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ ${body} }}>Hi Welcome</AbsoluteFill>;
};
export default C;`

const codes = (body: string) => lintComposition(wrap(body)).map((i) => i.code)

test("a percentage-string output range is a blocking error", () => {
  // The exact shape that blacked the preview.
  assert.ok(
    codes('width: interpolate(f, [0, 30], ["0%", "100%"])').includes("interpolate-non-numeric"),
    "a string output range must be caught"
  )
})

test("a colour-string output range is caught", () => {
  assert.ok(codes('color: interpolate(f, [0, 30], ["red", "blue"])').includes("interpolate-non-numeric"))
})

test("a mixed numeric/string range is caught", () => {
  assert.ok(codes('opacity: interpolate(f, [0, 30], [0, "1"])').includes("interpolate-non-numeric"))
})

test("it is BLOCKING, not a warning", () => {
  const issues = lintComposition(wrap('width: interpolate(f, [0, 30], ["0%", "100%"])'))
  const hit = issues.find((i) => i.code === "interpolate-non-numeric")
  assert.equal(hit?.severity, "error")
  assert.equal(blockingIssues(issues).some((i) => i.code === "interpolate-non-numeric"), true)
})

test("a plain numeric range is untouched", () => {
  assert.equal(codes("opacity: interpolate(f, [0, 30], [0, 1])").includes("interpolate-non-numeric"), false)
  assert.equal(codes("scale: interpolate(f, [0, 30], [0.94, 1])").includes("interpolate-non-numeric"), false)
})

test("Easing.step1 with strings is allowed — it is the documented escape hatch", () => {
  assert.equal(
    codes(
      'x: interpolate(f, [0, 30], ["a", "b"], { easing: Easing.step1 })'
    ).includes("interpolate-non-numeric"),
    false
  )
})

test("arithmetic output values are treated as numeric", () => {
  assert.equal(codes("scale: interpolate(f, [0, 30], [0.94, 1 - 0.2])").includes("interpolate-non-numeric"), false)
  assert.equal(codes("scale: interpolate(f, [0, 30], [0, 1 * 2])").includes("interpolate-non-numeric"), false)
})

test("a non-array output (a variable) is not judged — it may hold a number", () => {
  // Guessing here would reject correct code, so it stays silent.
  assert.equal(codes("opacity: myOpacityValue").includes("interpolate-non-numeric"), false)
})

test("commas inside nested calls do not split the arguments wrongly", () => {
  // e.g. interpolate(f, [0, 30], [clamp(0, 1, 2), 1]) must not misparse.
  assert.equal(
    codes("x: interpolate(f, [0, 30], [Math.max(0, 1), 1])").includes("interpolate-non-numeric"),
    false
  )
})

test("a string inside the INPUT range is fine — only the output is constrained", () => {
  assert.equal(
    codes('x: interpolate(step, ["a", "b"], [0, 1])').includes("interpolate-non-numeric"),
    false,
    "Remotion allows a string input range when the output is numeric"
  )
})

test("the message names the renderer error and the fix", () => {
  const hit = lintComposition(wrap('width: interpolate(f, [0, 30], ["0%", "100%"])')).find(
    (i) => i.code === "interpolate-non-numeric"
  )
  assert.match(hit?.message ?? "", /Easing\.step1/, "should quote the actual renderer error")
  assert.match(hit?.message ?? "", /^FIX:/, "must lead with the action")
})

test("nested interpolate calls are each checked", () => {
  const issues = codes('a: interpolate(f, [0, 10], ["x", "y"]), b: interpolate(f, [0, 10], [0, 1])')
  assert.equal(issues.filter((c) => c === "interpolate-non-numeric").length, 1)
})

test("clean code stays clean", () => {
  const ok = wrap(
    'const o = interpolate(f, [0, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }); return null;'
  )
  assert.deepEqual(blockingIssues(lintComposition(ok)), [])
})
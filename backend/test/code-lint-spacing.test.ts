/**
 * The typewriter failure: per-character `inline-block` spans collapse
 * spaces, so "THE FUTURE IS WRITTEN" renders "THEFUTUREISWRITTEN".
 * The linter must flag the pattern (warn, not block) with the fix.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { blockingIssues, lintComposition } from "../src/lib/code-lint"

const SPLIT_INLINE_BLOCK = `
export default function Composition() {
  const text = "THE FUTURE IS WRITTEN";
  return <div>{text.split("").map((ch, i) => (
    <span key={i} style={{ display: "inline-block" }}>{ch}</span>
  ))}</div>;
}`

const SPLIT_WITH_PRE = `
export default function Composition() {
  const text = "THE FUTURE IS WRITTEN";
  return <div>{text.split("").map((ch, i) => (
    <span key={i} style={{ display: "inline-block", whiteSpace: "pre" }}>{ch}</span>
  ))}</div>;
}`

const SLICE_REVEAL = `
export default function Composition() {
  const text = "THE FUTURE IS WRITTEN";
  return <div>{text.slice(0, 5)}</div>;
}`

test("per-char inline-block spans without whitespace handling warn", () => {
  const hit = lintComposition(SPLIT_INLINE_BLOCK).find(
    (i) => i.code === "per-char-spacing"
  )
  assert.ok(hit, "expected a per-char-spacing issue")
  assert.equal(hit!.severity, "warn")
  assert.match(hit!.message, /whiteSpace/)
})

test("the warning never blocks a publish", () => {
  const blocking = blockingIssues(lintComposition(SPLIT_INLINE_BLOCK)).map(
    (i) => i.code
  )
  assert.ok(!blocking.includes("per-char-spacing"))
})

test("whiteSpace:pre silences the warning", () => {
  const hit = lintComposition(SPLIT_WITH_PRE).find(
    (i) => i.code === "per-char-spacing"
  )
  assert.equal(hit, undefined)
})

test("substring reveals never trigger it", () => {
  const hit = lintComposition(SLICE_REVEAL).find(
    (i) => i.code === "per-char-spacing"
  )
  assert.equal(hit, undefined)
})

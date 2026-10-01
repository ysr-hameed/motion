import { test } from "node:test"
import assert from "node:assert/strict"

import { lintComposition, blockingIssues, LINT_FULL_SIZE_LIMIT } from "../src/lib/code-lint"
import { truncatedByLength, toUiParts } from "../src/lib/agent/nonstream-ui"

/**
 * Regression cover for the failure that burned a whole turn.
 *
 * A cursor-reveal brief came back "Something went wrong — retry and I'll
 * pick it up" six times in a row. Every gateway response was HTTP 200,
 * every one emitted 16.2K output tokens, and the Worker logs were empty.
 *
 * What happened: the model "added film grain" by inlining a base64 PNG
 * data URI into Composition.tsx. `write_composition` carries the file as
 * tool-call arguments, so that one string pushed the response past
 * `maxOutputTokens` (16K), the JSON arguments never closed, and the SDK
 * marked the call invalid *without executing it*. No exception is raised
 * on that path, which is why nothing was logged. The model was then told
 * only "The tool failed.", so it re-issued the identical oversized write
 * five more times.
 *
 * These tests pin the three things that fix it: the write is rejected
 * cheaply, the truncation is recognisable, and the reason is preserved.
 */

const BASE64_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"

test("an inline data URI is a blocking error, not a warning", () => {
  const code = `import { AbsoluteFill } from "remotion";
export default function Composition() {
  return <AbsoluteFill style={{ backgroundImage: "url(${BASE64_PNG})" }} />;
}`
  const issues = lintComposition(code)
  const hit = issues.find((i) => i.code === "data-uri")
  assert.ok(hit, "a base64 data URI must be reported")
  assert.equal(hit!.severity, "error")
  // The message has to name the cheap fix, because this is what the model
  // gets back and acts on.
  assert.match(hit!.message, /noise2D/)
  assert.match(hit!.message, /staticFile/)
  assert.ok(blockingIssues(issues).some((i) => i.code === "data-uri"))
})

test("the data-uri check also runs on the oversized fast path", () => {
  // Oversized files are exactly the ones that get inlined binary, and this
  // is the path that skips most other analysis — so it must not skip this.
  const filler = "\n// ".concat("x".repeat(200))
  const code =
    `import { AbsoluteFill } from "remotion";\nexport default function Composition() {` +
    `\n  const src = "${BASE64_PNG}";${filler.repeat(80)}\n  return <AbsoluteFill />;\n}`
  assert.ok(code.length > LINT_FULL_SIZE_LIMIT, "fixture must exceed the full-lint limit")
  const hit = lintComposition(code).find((i) => i.code === "data-uri")
  assert.ok(hit, "the cheap path must still catch inline binary")
  assert.equal(hit!.severity, "error")
})

test("a clean composition is not accused of embedding anything", () => {
  const code = `import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { noise2D } from "@remotion/noise";
export default function Composition() {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: interpolate(f, [0, 10], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
    grain {noise2D("g" + f, 0, 0)}
  </AbsoluteFill>;
}`
  assert.equal(
    lintComposition(code).filter((i) => i.code === "data-uri").length,
    0,
    "noise2D is the correct approach and must pass"
  )
})

test("a non-base64 data URI is not flagged", () => {
  const code = `export default function Composition() {
  return <svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" /></svg>;
}`
  assert.equal(lintComposition(code).filter((i) => i.code === "data-uri").length, 0)
})

test("truncatedByLength only fires for a cut-off step with a pending call", () => {
  const cut = [{ type: "tool-call", toolCallId: "c1", toolName: "write_composition", input: {} }]
  assert.equal(truncatedByLength(cut, "length"), true)
  // Every other finish reason is a normal step.
  for (const reason of ["stop", "tool-calls", "content-filter", undefined]) {
    assert.equal(truncatedByLength(cut, reason), false, `reason=${String(reason)}`)
  }
  // A length-capped step with no tool call is not this failure.
  assert.equal(truncatedByLength([{ type: "text", text: "hi" }], "length"), false)
  assert.equal(truncatedByLength(null, "length"), false)
})

test("the truncation error names the real cause and forbids the same retry", () => {
  const parts = toUiParts(
    [{ type: "tool-call", toolCallId: "c1", toolName: "write_composition", input: {} }],
    { finishReason: "length" }
  )
  const part = parts[0] as unknown as { state: string; errorText: string }
  assert.equal(part.state, "output-error")
  // This text is read by the model on its next step. It must carry the
  // cause (inline binary) and an instruction, otherwise the loop repeats.
  assert.match(part.errorText, /cut off/i)
  assert.match(part.errorText, /base64|image/i)
  assert.match(part.errorText, /noise2D/)
  assert.match(part.errorText, /do NOT resend/i)
})

test("a real SDK tool-error still reaches the user verbatim", () => {
  const parts = toUiParts([
    { type: "tool-call", toolCallId: "c1", toolName: "write_composition", input: {} },
    {
      type: "tool-error",
      toolCallId: "c1",
      error: "Invalid input for tool write_composition: JSON parse error: Unterminated string",
    },
  ])
  const part = parts[0] as unknown as { state: string; errorText: string }
  assert.equal(part.state, "output-error")
  assert.match(part.errorText, /Unterminated string/)
})
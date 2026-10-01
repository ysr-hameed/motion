import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

import { lintComposition, blockingIssues, LINT_FULL_SIZE_LIMIT } from "../src/lib/code-lint"
import { truncatedByLength } from "../src/lib/agent/settled-parts"

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

test("truncatedByLength: a length-capped step with a tool part is the failure", () => {
  const cut = [{ type: "tool-write_composition", toolCallId: "c1", state: "output-error" }]
  assert.equal(truncatedByLength(cut, "length"), true)
  for (const reason of ["stop", "tool-calls", "content-filter", undefined]) {
    assert.equal(truncatedByLength(cut, reason), false, `reason=${String(reason)}`)
  }
  // Capped mid-narration with no tool call: still reported. A real
  // transcript showed the model cut off at "Let me write the full…" and the
  // user got a bare "Interrupted mid-step" because the old check only
  // looked for a tool part.
  assert.equal(truncatedByLength([{ type: "text", text: "hi" }], "length"), true)
  // Nothing was actually lost, so there is nothing to explain.
  assert.equal(truncatedByLength(null, "length"), false)
  assert.equal(truncatedByLength([], "length"), false)
})

test("the route tells the model AND the user why a write was cut off", () => {
  // The SDK discards a length-capped tool call WITHOUT running it and throws
  // nothing, so without an explicit note the model re-sends the identical
  // oversized payload — which is exactly what happened: six identical plans,
  // six 16.2K-token responses, nothing saved. The note has to name the cause
  // and forbid the identical retry, because it is the model's next input.
  const route = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "src", "routes", "agent.ts"),
    "utf8"
  )
  assert.match(route, /truncatedByLength\(/, "the route must detect truncation")
  assert.match(route, /ran out before the file/, "the note says what happened")
  assert.match(route, /noise2D/, "the note names the cheap fix")
  assert.match(route, /won't resend it unchanged/, "the note forbids the retry loop")
  // And it has to reach the model, which means the stored row — not just the wire.
  assert.match(route, /parts\.push\(\{ type: "text", text: note \}/)
})

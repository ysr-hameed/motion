import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

/**
 * The chat route writes the AI SDK's UI message stream BY HAND (because it
 * runs the model non-streaming to fit a CPU-capped plan). That means the
 * wire format is ours to get right, and the SDK does not validate what we
 * write — a wrong frame just produces an empty chat bubble in the browser
 * with no error in any log.
 *
 * These read the actual route source and assert the format, because that
 * regression already happened once: frames were written as
 * `event: message\ndata: {...}`, which the client silently ignores.
 */

const here = dirname(fileURLToPath(import.meta.url))
const routeSrc = readFileSync(join(here, "..", "src", "routes", "agent.ts"), "utf8")

test("SSE frames use bare `data:` (no `event:` line)", () => {
  // The client parser only reads `data:` frames. A named event is dropped.
  assert.ok(
    !/writeSSE\(\{\s*event:/.test(routeSrc),
    "route writes a named SSE event; the AI SDK client ignores those"
  )
})

test("every emit path is a bare data frame", () => {
  const emits = [...routeSrc.matchAll(/stream\.writeSSE\(\{([^}]*)\}/g)].map((m) => m[1] ?? "")
  assert.ok(emits.length > 0, "expected the route to write SSE frames")
  for (const args of emits) {
    assert.match(args, /data:/, `writeSSE call without data: ${args}`)
    assert.doesNotMatch(args, /event:/, `writeSSE call with a named event: ${args}`)
  }
})

test("the stream is terminated with [DONE]", () => {
  // Without the terminator the client never completes the turn and the UI
  // hangs until it times out.
  assert.match(routeSrc, /data:\s*"\[DONE\]"/, "missing the [DONE] terminator")
})

test("the success path emits [DONE] after the finish chunk", () => {
  const finishIdx = routeSrc.indexOf('await emit({ type: "finish" })')
  assert.ok(finishIdx > 0, "no finish chunk emitted")
  const doneIdx = routeSrc.indexOf("await done()", finishIdx)
  assert.ok(
    doneIdx > finishIdx,
    "[DONE] must come after the finish chunk, or the client cuts the message off"
  )
})

test("the error path also terminates the stream", () => {
  // An error frame without [DONE] leaves the request pending forever.
  const failBody = routeSrc.slice(routeSrc.indexOf("const fail = async"), routeSrc.indexOf("const fail = async") + 600)
  assert.match(failBody, /await done\(\)/, "fail() must terminate the stream")
})

test("the route is non-streaming (no agent.stream / toUIMessageStreamResponse)", () => {
  // Streaming cost ~18.8ms of CPU per turn on the gateway's SSE frames and
  // is the reason this route exists in its current form. Reverting to a
  // streamed call would silently reintroduce the CPU death on Free plans.
  assert.doesNotMatch(routeSrc, /\.agent\.stream\(/, "route is streaming again")
  assert.doesNotMatch(routeSrc, /toUIMessageStreamResponse/, "route uses the SDK streamed response")
})

test("the route uses generate() (one non-streamed model call)", () => {
  assert.match(routeSrc, /\.agent\.generate\(/, "route should call agent.generate()")
})

test("tool progress is reported as a transient data chunk", () => {
  // This is what keeps the UI honest now that tokens aren't streamed:
  // a real event per tool that actually ran, not a timer.
  assert.match(routeSrc, /data-toolstart/, "no tool-start progress event")
  assert.match(routeSrc, /transient:\s*true/, "progress chunks must be transient so they aren't persisted")
})

test("text is sent in one delta, not per token", () => {
  // Per-token deltas were the other half of the streaming CPU cost.
  const converter = readFileSync(join(here, "..", "src", "lib", "agent", "nonstream-ui.ts"), "utf8")
  assert.match(converter, /text-delta/)
  assert.match(converter, /delta: p\.text \?\? ""/, "text should be emitted as a single delta")
})
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

/**
 * The chat SSE wire format.
 *
 * The AI SDK's UI message stream has a precise format: bare `data: {json}`
 * frames terminated by `data: [DONE]`, with NO `event:` line. The client's
 * parser ignores named events, so writing them produces a stream the browser
 * cannot read at all — an empty chat with no error anywhere. That regression
 * happened once and is why these assertions exist.
 *
 * The route no longer BUILDS the message stream by hand. It relays the SDK's
 * own `toUIMessageStream()` chunks, which is why there is no vocabulary to
 * get wrong: the SDK owns it. What is still ours, and still worth pinning,
 * is the frame format, the terminator, and the ordering.
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

/**
 * The regression that motivated streaming.
 *
 * The route used to call `agent.generate()` and dump the finished turn in one
 * burst. A step takes 77-88s, so for every one of those seconds the client
 * had nothing but a `start` frame: the bubble rendered a bare "Thinking…"
 * with no text, no tool chips, no sign of work. The model writes its
 * acknowledgement and plan FIRST, so streaming lands them in ~2s.
 */
test("the route streams the model so the UI is never a blank spinner", () => {
  assert.match(routeSrc, /\.stream\(\{/, "route must stream the model, not buffer it")
  assert.match(
    routeSrc,
    /toUIMessageStream\(/,
    "relay the SDK's own UI message stream rather than rebuilding the vocabulary"
  )
  assert.doesNotMatch(
    routeSrc,
    /\.agent\.generate\(/,
    "generate() buffers the whole turn, which is what produced the 77s blank spinner"
  )
})

test("chunks are relayed one at a time, not collected then emitted", () => {
  // The shape that matters: emit inside the loop. Collecting first and
  // emitting after would restore the buffering bug while still "streaming".
  assert.match(
    routeSrc,
    /for await \(const chunk of chunks\)[\s\S]{0,400}await emit\(chunk\)/,
    "each chunk must be written as it arrives"
  )
})

test("the route emits exactly one `start`, and the SDK owns it", () => {
  // The route used to emit its own `start` and then relay the SDK's, which
  // opened the message twice and could leave a bubble empty.
  assert.doesNotMatch(
    routeSrc,
    /emit\(\{\s*type:\s*"start"/,
    "the route must not emit its own start; toUIMessageStream already does"
  )
  assert.match(routeSrc, /generateMessageId:\s*\(\)\s*=>\s*messageId/, "pass the message id to the SDK")
})

test("the route owns `finish` so a truncation correction can precede it", () => {
  // Nothing may be written after the terminator, and the correction has to
  // reach the model on the next step, so the SDK must not close the message.
  assert.match(routeSrc, /sendFinish:\s*false/, "the SDK must not emit finish; the route owns it")
  const correction = routeSrc.indexOf("truncatedByLength(")
  const finish = routeSrc.indexOf('await emit({ type: "finish" })')
  assert.ok(correction > 0 && correction < finish, "the correction must precede finish")
})

test("tool progress is reported as a transient data chunk", () => {
  assert.match(routeSrc, /data-toolstart/, "no tool-start progress event")
  assert.match(routeSrc, /transient:\s*true/, "progress chunks must be transient so they aren't persisted")
})

test("model-chain fallback still works while streaming", () => {
  // Nothing reaches the client until the first chunk, so a model that fails
  // to start can still fall through to the next one in the same response.
  assert.match(routeSrc, /built\.chain\.slice\(1\)/, "the fallback chain must still be walked")
  assert.match(routeSrc, /await relay\(fallback\)/, "fallbacks must go through the same relay")
})
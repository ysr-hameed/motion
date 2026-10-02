import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

/**
 * The chat SSE wire format, and why the model is called non-streaming.
 *
 * FORMAT. The AI SDK's UI message stream has a precise shape: bare
 * `data: {json}` frames terminated by `data: [DONE]`, with NO `event:` line.
 * The client's parser ignores named events, so writing them produces a stream
 * the browser cannot read at all — an empty chat with no error anywhere. That
 * regression happened once and is why these assertions exist.
 *
 * NON-STREAMING. The route calls `agent.generate()` and converts the finished
 * parts. Streaming was reverted once already and the reason is worth keeping
 * in a test rather than a comment: the Worker parses ~3.9us of CPU per output
 * token, so a realistic 16K response is ~62ms against a ~10ms Workers Free
 * budget and the request is killed mid-write. Users saw that as
 * "Interrupted mid-step". One `res.json()` on the finished body is ~0.27ms at
 * any length, which is what finally let the model write a whole composition.
 *
 * The cost of that choice is no token-level stream. The UI is not left blank:
 * `onToolStart` emits a real event per executed tool, so progress is reported
 * from work that actually happened rather than a timer.
 */

const here = dirname(fileURLToPath(import.meta.url))
const routeSrc = readFileSync(join(here, "..", "src", "routes", "agent.ts"), "utf8")

test("SSE frames use bare `data:` (no `event:` line)", () => {
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

test("the model is called non-streaming, so a long write can survive", () => {
  // Streaming costs ~3.9us of CPU per output token in this Worker; a 16K
  // response is ~62ms against a ~10ms Free-plan budget and gets the request
  // killed mid-write. This is the assertion that has to fail first if anyone
  // tries to "improve the UX by streaming again".
  assert.match(routeSrc, /\.generate\(\{\s*messages:/, "route must call generate()")
  assert.doesNotMatch(routeSrc, /\.stream\(\{/, "streaming is what killed the long writes")
  assert.doesNotMatch(routeSrc, /toUIMessageStream\(/, "no SDK stream to relay")
})

test("the message is opened exactly once", () => {
  // `toSseChunks` emits `start` itself. A second one in the route opened the
  // same messageId twice, which is what left a bubble empty and rendering a
  // bare "Thinking…" after its content had already been sent.
  const runOn = routeSrc.slice(routeSrc.indexOf("const runOn = async"), routeSrc.indexOf("const runOn = async") + 900)
  const starts = [...runOn.matchAll(/type:\s*"start"/g)]
  assert.equal(
    starts.length,
    1,
    "runOn must only emit `start` on the empty-result path, never alongside toSseChunks"
  )
  assert.match(
    runOn,
    /if \(isEmptyParts\(settledParts\)\)[\s\S]{0,200}type:\s*"start"/,
    "the lone `start` belongs to the empty-result branch"
  )
})

test("tool progress is reported as a transient data chunk", () => {
  // With no token stream, this is the only thing telling the user work is
  // happening — so it has to be a real per-tool event, and transient so it
  // never lands in the persisted conversation.
  assert.match(routeSrc, /data-toolstart/, "no tool-start progress event")
  assert.match(routeSrc, /transient:\s*true/, "progress chunks must be transient so they aren't persisted")
  assert.match(routeSrc, /onToolStart/, "progress must be wired from a real tool event")
})

test("model-chain fallback still works", () => {
  // Nothing reaches the client until a model has actually returned, so a model
  // that fails to start can still fall through to the next one in the same
  // response — without the user seeing a seam.
  assert.match(routeSrc, /built\.chain\.slice\(1\)/, "the fallback chain must still be walked")
  assert.match(routeSrc, /await runOn\(fallback\)/, "fallbacks must go through the same path")
})
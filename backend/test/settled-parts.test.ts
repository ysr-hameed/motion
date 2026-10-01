import { test } from "node:test"
import assert from "node:assert/strict"
import { isEmptyParts, toolActivity, truncatedByLength } from "../src/lib/agent/settled-parts"

/**
 * Inspecting a finished assistant message.
 *
 * This module used to convert the model's part vocabulary into the browser's
 * by hand — `collectTools`, `toUiParts`, `toSseChunks`, 326 lines of it. The
 * route now streams, so the SDK owns that translation and this file only
 * answers three questions about a message that already arrived.
 *
 * The bug that lived in the deleted code is worth remembering: it read
 * `errorText` off the SDK's `tool-error` part, which only ever sets `error`.
 * Every truncated write therefore collapsed to the literal "The tool failed."
 * — a turn that returned HTTP 200, logged nothing, and explained nothing.
 * The SDK does this correctly now; these tests are here so the remaining
 * helpers stay honest.
 */

const TOOL = { type: "tool-write_composition", toolCallId: "c1", state: "output-available", output: {} }

test("isEmptyParts: nothing a user would see", () => {
  assert.equal(isEmptyParts([]), true)
  assert.equal(isEmptyParts(undefined), true)
  assert.equal(isEmptyParts([{ type: "text", text: "   " }] as never), true)
  // A call the SDK never resolved carries nothing yet.
  assert.equal(
    isEmptyParts([{ type: "tool-write_composition", toolCallId: "c1", state: "input-available" }] as never),
    true
  )
})

test("isEmptyParts: real content is not empty", () => {
  assert.equal(isEmptyParts([{ type: "text", text: "done" }] as never), false)
  assert.equal(isEmptyParts([TOOL] as never), false)
  // A settled failure IS something the user has to read.
  assert.equal(
    isEmptyParts([{ type: "tool-write_composition", toolCallId: "c1", state: "output-error" }] as never),
    false
  )
})

test("toolActivity: names without the tool- prefix, in order", () => {
  assert.deepEqual(
    toolActivity([
      { type: "tool-write_composition", toolCallId: "c1", state: "output-available" },
      { type: "tool-preview_composition", toolCallId: "c2", state: "output-error" },
      { type: "text", text: "ignored" },
    ] as never),
    [
      { name: "write_composition", state: "output-available" },
      { name: "preview_composition", state: "output-error" },
    ]
  )
  assert.deepEqual(toolActivity(undefined), [])
  assert.deepEqual(toolActivity([{ type: "text", text: "no tools" }] as never), [])
})

test("truncatedByLength: only a length-capped step that was making a tool call", () => {
  // `finishReason: "length"` is the whole-file-write failure. The SDK
  // discards the call without running it, nothing throws, and without this
  // signal the model re-sends the identical oversized payload.
  const parts = [{ type: "tool-write_composition", toolCallId: "c1", state: "output-error" }]

  assert.equal(truncatedByLength(parts, "length"), true)

  for (const reason of ["stop", "tool-calls", "content-filter", undefined]) {
    assert.equal(truncatedByLength(parts, reason), false, `reason=${String(reason)}`)
  }
  // Capped, but the model was writing prose rather than a file.
  assert.equal(truncatedByLength([{ type: "text", text: "hi" }], "length"), false)
  assert.equal(truncatedByLength(null, "length"), false)
})

test("truncatedByLength: a tool part counts whatever its state", () => {
  // Depending on where the cap landed, the SDK leaves the call pending or
  // emits a tool error. Both are this failure.
  for (const state of ["input-available", "output-error", "output-available"]) {
    assert.equal(
      truncatedByLength([{ type: "tool-write_composition", toolCallId: "c1", state }], "length"),
      true,
      `state=${state}`
    )
  }
})
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  toUiParts,
  toSseChunks,
  isEmptyParts,
  toolActivity,
  _collectToolsForTest,
} from "../src/lib/agent/nonstream-ui"

/**
 * The chat route runs the model NON-streaming (agent.generate) and these
 * functions are the only bridge from the model's part vocabulary to the UI
 * message vocabulary the browser's useChat transport requires. A mismatch
 * here does not throw — it silently produces an empty or broken chat, so
 * these tests are the only thing standing between a refactor and a blank
 * transcript in production.
 */

/** What the model actually returns: tool-call / tool-result pairs. */
const MODEL_CONTENT = [
  { type: "text", text: "On it — composing your 5s typewriter." },
  { type: "tool-call", toolCallId: "call_1", toolName: "write_composition", input: { content: "tsx" } },
  { type: "tool-result", toolCallId: "call_1", output: { ok: true, version: 1 } },
  { type: "tool-call", toolCallId: "call_2", toolName: "preview_composition", input: {} },
  { type: "tool-result", toolCallId: "call_2", output: { artifact: { code: "..." }, version: 1 } },
]

test("toUiParts: text becomes a text part", () => {
  const parts = toUiParts([{ type: "text", text: "hello" }])
  assert.equal(parts.length, 1)
  assert.equal((parts[0] as { type: string }).type, "text")
  assert.equal((parts[0] as { text: string }).text, "hello")
})

test("toUiParts: tool call+result merge into ONE tool-<name> part", () => {
  const parts = toUiParts(MODEL_CONTENT)
  const tools = parts.filter((p) => (p as { type: string }).type.startsWith("tool-"))
  // 2 calls + 2 results must NOT become 4 parts.
  assert.equal(tools.length, 2)
  const first = tools[0] as unknown as {
    type: string
    state: string
    toolCallId: string
    output: { ok: boolean }
  }
  assert.equal(first.type, "tool-write_composition")
  assert.equal(first.toolCallId, "call_1")
  assert.equal(first.state, "output-available")
  assert.equal(first.output.ok, true)
})

test("toUiParts: tool type is exactly tool-<name> (client keys on it)", () => {
  const parts = toUiParts([
    { type: "tool-call", toolCallId: "c", toolName: "preview_composition", input: {} },
    { type: "tool-result", toolCallId: "c", output: { ok: true } },
  ])
  // A regression here silently breaks the activity card icon/label.
  assert.equal((parts[0] as { type: string }).type, "tool-preview_composition")
})

test("toUiParts: a call with no result stays visible as pending", () => {
  const parts = toUiParts([
    { type: "tool-call", toolCallId: "c1", toolName: "read_file", input: { path: "a.tsx" } },
  ])
  const t = parts[0] as unknown as { state: string }
  assert.equal(t.state, "input-available")
})

test("toUiParts: a tool-error renders as output-error, never dropped", () => {
  const parts = toUiParts([
    { type: "tool-call", toolCallId: "c1", toolName: "edit_file", input: {} },
    { type: "tool-error", toolCallId: "c1", errorText: "no match" },
  ])
  const t = parts[0] as unknown as { state: string; errorText: string }
  assert.equal(t.state, "output-error")
  assert.equal(t.errorText, "no match")
})

test("toUiParts: a result with no preceding call is still surfaced", () => {
  const parts = toUiParts([
    { type: "tool-result", toolCallId: "orphan", toolName: "validate_composition", output: { ok: true } },
  ])
  assert.equal(parts.length, 1)
  assert.equal((parts[0] as { type: string }).type, "tool-validate_composition")
})

test("toUiParts: text comes before tools (what the user reads first)", () => {
  const parts = toUiParts(MODEL_CONTENT)
  assert.equal((parts[0] as { type: string }).type, "text")
  assert.ok(parts.slice(1).every((p) => (p as { type: string }).type.startsWith("tool-")))
})

test("toUiParts: blank text is dropped", () => {
  const parts = toUiParts([{ type: "text", text: "   " }])
  assert.equal(parts.length, 0)
})

test("toSseChunks: emits start ... finish and the text-delta vocabulary", () => {
  const parts = toUiParts(MODEL_CONTENT)
  const chunks = toSseChunks(parts, "msg_1") as Array<Record<string, unknown>>
  assert.equal(chunks[0]!.type, "start")
  assert.equal(chunks[0]!.messageId, "msg_1")
  assert.equal(chunks[chunks.length - 1]!.type, "finish")
  const delta = chunks.find((c) => c.type === "text-delta")
  assert.ok(delta, "must emit a text-delta")
  // The wire key is `delta`, NOT `text` — getting this wrong renders nothing.
  assert.equal(typeof delta!.delta, "string")
  assert.equal(delta!.text, undefined)
})

test("toSseChunks: tool-input-available then tool-output-available", () => {
  const parts = toUiParts(MODEL_CONTENT)
  const chunks = toSseChunks(parts, "msg_1") as Array<Record<string, unknown>>
  const input = chunks.find((c) => c.type === "tool-input-available")
  const output = chunks.find((c) => c.type === "tool-output-available")
  assert.ok(input, "must emit tool-input-available")
  assert.ok(output, "must emit tool-output-available")
  assert.equal(input!.toolCallId, "call_1")
  assert.equal(input!.toolName, "write_composition")
  assert.equal(output!.toolCallId, "call_1")
})

test("toSseChunks: one input and one output per tool (not doubled)", () => {
  const chunks = toSseChunks(toUiParts(MODEL_CONTENT), "m") as Array<Record<string, unknown>>
  assert.equal(chunks.filter((c) => c.type === "tool-input-available").length, 2)
  assert.equal(chunks.filter((c) => c.type === "tool-output-available").length, 2)
})

test("isEmptyParts: nothing usable", () => {
  assert.equal(isEmptyParts([]), true)
  assert.equal(isEmptyParts(toUiParts([{ type: "text", text: "  " }])), true)
  // A pending tool with no text/output is not worth rendering alone.
  assert.equal(
    isEmptyParts(toUiParts([{ type: "tool-call", toolCallId: "c", toolName: "read_file", input: {} }])),
    true
  )
})

test("isEmptyParts: real content is not empty", () => {
  assert.equal(isEmptyParts(toUiParts(MODEL_CONTENT)), false)
  assert.equal(isEmptyParts(toUiParts([{ type: "text", text: "done" }])), false)
})

test("toolActivity: names without the tool- prefix, in order", () => {
  assert.deepEqual(toolActivity(toUiParts(MODEL_CONTENT)), [
    { name: "write_composition", state: "output-available" },
    { name: "preview_composition", state: "output-available" },
  ])
})

test("stored parts and SSE chunks agree (reload shows the same turn)", () => {
  const parts = toUiParts(MODEL_CONTENT)
  const chunks = toSseChunks(parts, "m") as Array<Record<string, unknown>>
  const fromWire = chunks.filter((c) => String(c.type).startsWith("tool-") && c.type !== "tool-output-error")
  const fromParts = parts.filter((p) => (p as { type: string }).type.startsWith("tool-"))
  // Every tool in the stored message must appear on the wire, and vice versa.
  assert.equal(
    fromWire.filter((c) => c.type === "tool-input-available").length,
    fromParts.length
  )
})

test("_collectToolsForTest: merge preserves call order and pairs by id", () => {
  const tools = _collectToolsForTest(MODEL_CONTENT)
  assert.equal(tools.length, 2)
  assert.equal(tools[0]!.toolCallId, "call_1")
  assert.equal(tools[1]!.toolCallId, "call_2")
  assert.equal(tools[0]!.hasOutput, true)
})

test("non-array / malformed content degrades safely", () => {
  for (const bad of [null, undefined, "nope", 42, {}]) {
    assert.deepEqual(toUiParts(bad), [])
    assert.equal(isEmptyParts(toUiParts(bad)), true)
  }
  assert.equal(isEmptyParts(toUiParts(null) as never), true)
})

test("nullish entries inside content are skipped, not thrown on", () => {
  const parts = toUiParts([null, undefined, { type: "text", text: "ok" }])
  assert.equal(parts.length, 1)
})
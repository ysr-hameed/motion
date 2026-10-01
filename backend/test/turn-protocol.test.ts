/**
 * Turn-protocol guardrails: one request runs ONE model step, chained by
 * the hidden continuation token. These pin the counting, the token
 * handling and the lint cache that make per-step requests cheap enough
 * for CPU-capped plans — no model involved.
 */
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { UIMessage } from "ai"
import {
  CONTINUE_TOKEN,
  MAX_STEPS_PER_TURN,
  isContinueMessage,
  stepsUsedOf,
} from "../src/lib/agent/turns"
import { lintCompositionCached } from "../src/lib/code-lint"

const user = (id: string, text: string): UIMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
})

const assistantTools = (id: string, n = 1): UIMessage => ({
  id,
  role: "assistant",
  parts: Array.from({ length: n }, (_, i) => ({
    type: `tool-read_file`,
    toolCallId: `call-${id}-${i}`,
    state: "output-available",
    input: { path: "src/Composition.tsx" },
    output: { ok: true },
  })),
})

const assistantText = (id: string): UIMessage => ({
  id,
  role: "assistant",
  parts: [{ type: "text", text: "Done." }],
})

describe("continuation token", () => {
  it("matches only the exact token as a full user message", () => {
    assert.equal(isContinueMessage(user("1", CONTINUE_TOKEN) as never), true)
    assert.equal(isContinueMessage(user("2", ` ${CONTINUE_TOKEN} `) as never), true)
    assert.equal(isContinueMessage(user("3", "please continue") as never), false)
    assert.equal(
      isContinueMessage(user("4", `${CONTINUE_TOKEN} and make it spin`) as never),
      false
    )
    assert.equal(
      isContinueMessage({ ...assistantText("a"), role: "assistant" } as never),
      false
    )
  })

  it("cap is a sane bound for inspect→write→validate→preview→fix", () => {
    assert.ok(MAX_STEPS_PER_TURN >= 5 && MAX_STEPS_PER_TURN <= 10)
  })
})

describe("stepsUsedOf", () => {
  it("counts tool steps since the last real user message", () => {
    const history = [
      user("u1", "make a countdown"),
      assistantTools("s1"),
      assistantTools("s2"),
    ] as UIMessage[]
    assert.equal(stepsUsedOf(history), 2)
  })

  it("ignores continuation tokens and resets on real turns", () => {
    const history = [
      user("u1", "make a countdown"),
      assistantTools("s1"),
      user("t1", CONTINUE_TOKEN),
      assistantTools("s2"),
      user("u2", "make it red"),
    ] as UIMessage[]
    assert.equal(stepsUsedOf(history), 0)
  })

  it("ignores text-only closings", () => {
    const history = [user("u1", "hi there"), assistantText("s1")] as UIMessage[]
    assert.equal(stepsUsedOf(history), 0)
  })
})

describe("lint cache", () => {
  const code = `import {AbsoluteFill} from "remotion";\nexport default function Composition(){return <AbsoluteFill/>;}\n`

  it("returns the same verdict for identical content", () => {
    const a = lintCompositionCached(code)
    const b = lintCompositionCached(code)
    assert.deepEqual(a, b)
  })

  it("distinguishes changed content", () => {
    const ok = lintCompositionCached(code)
    const broken = lintCompositionCached(`${code}\nMath.random();\n`)
    assert.equal(ok.length, 0)
    assert.ok(broken.some((i) => i.code === "math-random"))
  })
})

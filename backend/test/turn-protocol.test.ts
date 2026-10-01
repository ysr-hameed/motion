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
  TURN_LIMITS,
  isContinueMessage,
  resolveMode,
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
    assert.ok(MAX_STEPS_PER_TURN >= 5 && MAX_STEPS_PER_TURN <= 30)
  })

  it("advanced mode allows a deeper loop than standard", () => {
    // The whole point of the mode: a full piece needs room for a second
    // compose→preview→revise cycle that a tweak never needs.
    assert.ok(TURN_LIMITS.advanced.maxSteps > TURN_LIMITS.standard.maxSteps)
    assert.equal(MAX_STEPS_PER_TURN, TURN_LIMITS.advanced.maxSteps)
  })

  it("the output budget stays inside the CPU ceiling in BOTH modes", () => {
    // Streaming costs ~3.9us of CPU per output token (measured on this
    // account), and Workers Free allows ~10ms per request. 16K tokens was
    // 62ms — a guaranteed kill mid-write, which users saw as
    // "Interrupted mid-step". Advanced buys MORE STEPS, never a longer
    // single response, so the two modes must share this ceiling.
    const BUDGET_MS = 10
    const US_PER_TOKEN = 0.0039
    for (const mode of ["standard", "advanced"] as const) {
      const est = TURN_LIMITS[mode].maxOutputTokens * US_PER_TOKEN
      assert.ok(
        est < BUDGET_MS,
        `${mode}: ${TURN_LIMITS[mode].maxOutputTokens} tokens ≈ ${est.toFixed(1)}ms of streaming CPU, over the ${BUDGET_MS}ms budget`
      )
    }
    assert.equal(
      TURN_LIMITS.advanced.maxOutputTokens,
      TURN_LIMITS.standard.maxOutputTokens,
      "advanced must not raise the per-response ceiling"
    )
  })

  it("resolveMode only accepts known modes", () => {
    assert.equal(resolveMode("advanced"), "advanced")
    assert.equal(resolveMode("standard"), "standard")
    // Anything untrusted falls back rather than widening the budget.
    for (const bad of [undefined, null, "", "ADVANCED", "pro", 1, {}, []]) {
      assert.equal(resolveMode(bad), "standard", `expected fallback for ${JSON.stringify(bad)}`)
    }
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

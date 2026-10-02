/**
 * Turn-protocol guardrails: one request runs ONE model step, chained by
 * the hidden continuation token. These pin the counting, the token
 * handling and the lint cache that make per-step requests cheap enough
 * for CPU-capped plans — no model involved.
 */
import { describe, it } from "node:test"
import { readFileSync } from "node:fs"
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

  it("the output budget is safe BECAUSE the route no longer streams", () => {
    // Streaming cost ~3.9us of CPU per output token: 16K tokens is ~62ms
    // against a ~10ms Free-plan budget, so streaming once forced a
    // 1,200-token ceiling — small enough that the model spent the whole
    // budget on its PLAN narration and the tool arguments arrived empty.
    // The model reported its own writes as "a placeholder" and retried the
    // identical plan indefinitely. Shrinking the cap did not make it safer;
    // it made it unable to write code at all.
    //
    // The route now calls generate() (non-streaming): one res.json() on the
    // finished body costs ~0.27ms at any length, so there is no reason to
    // cap output near real scene size. This is the tripwire — if anyone
    // re-enables streaming, the per-token cost returns and this is the
    // assertion that has to be revisited first.
    const routeSrc = readFileSync(
      new URL("../src/routes/agent.ts", import.meta.url),
      "utf8"
    )
    const isStreaming = /\.stream\(\{/.test(routeSrc)

    for (const mode of ["standard", "advanced"] as const) {
      const tokens = TURN_LIMITS[mode].maxOutputTokens
      if (isStreaming) {
        assert.ok(
          tokens * 0.0039 < 10,
          `${mode}: ${tokens} streamed tokens ≈ ${(tokens * 0.0039).toFixed(1)}ms, over the ~10ms budget`
        )
      } else {
        // Non-streaming: one parse of the finished body regardless of
        // length, so the ceiling is only a runaway backstop.
        assert.ok(
          tokens > 64000,
          `${mode}: ${tokens} tokens leaves no room for a real composition`
        )
      }
    }
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

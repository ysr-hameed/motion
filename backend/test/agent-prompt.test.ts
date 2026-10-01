import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

import { buildAgent } from "../src/lib/agent/agent"
import { MOTION_CRAFT } from "../src/lib/agent/craft"
import { DIRECTION_RULES } from "../src/lib/remotion-guide"

/**
 * The operating manual, the craft patterns and the renderer contract all
 * have to arrive in ONE system prompt.
 *
 * This file exists because that silently stopped being true. The SDK's
 * Agent does `generateText({ ...this.settings, ...options })` — a shallow
 * spread — so the chat route's `generate({ system: canvasPreamble })`
 * REPLACED the whole manual. The model kept receiving a detailed-looking
 * prompt and produced work that ignored every rule in it: it narrated its
 * own reasoning in the first turn and shipped flat cuts, which is exactly
 * what you see when the instructions are not actually being sent.
 */

const here = dirname(fileURLToPath(import.meta.url))
const ROUTE = readFileSync(join(here, "..", "src", "routes", "agent.ts"), "utf8")

/** The prompt the route actually sends, assembled the way it assembles it. */
function assembledSystem(opts: Parameters<typeof buildAgent>[2] = {}): string {
  const agent = buildAgent(
    { AI_MODEL: "test/model", AI_GATEWAY_API_KEY: "k" },
    {} as never,
    opts
  )
  // ToolLoopAgent keeps `system` on its settings; read it back off the
  // instance rather than re-implementing the assembly here.
  return (agent.agent as unknown as { settings: { system: string } }).settings.system
}

test("the chat route never shadows the manual with a per-call system prompt", () => {
  // A `system` passed to generate() REPLACES the agent's whole system. The
  // canvas contract must go through buildAgent's opts instead.
  assert.ok(
    !/agent\.generate\(\{[^}]*\bsystem\s*:/.test(ROUTE),
    "routes/agent.ts must not pass `system` to agent.generate() — it overwrites the manual"
  )
  assert.ok(
    /canvasPreamble:\s*systemPreamble/.test(ROUTE),
    "the canvas contract must be threaded through buildAgent opts"
  )
})

test("one system prompt carries manual + craft + direction + canvas contract", () => {
  const sys = assembledSystem({ canvasPreamble: "CANVAS_CONTRACT_MARKER", freshProject: true })
  assert.match(sys, /REPLY SHAPE/, "the reply shape must reach the model")
  assert.match(sys, /PLAN/, "the plan block must reach the model")
  assert.match(sys, /MOTION CRAFT/, "the craft patterns must reach the model")
  assert.match(sys, /DIRECTING THIS CUT/, "the direction brief must reach the model")
  assert.match(
    sys,
    /CANVAS_CONTRACT_MARKER/,
    "the canvas contract must be included, not substituted for the manual"
  )
})

test("advanced mode is appended, and does not replace the manual", () => {
  const sys = assembledSystem({ mode: "advanced" })
  assert.match(sys, /ADVANCED MODE/)
  assert.match(sys, /REPLY SHAPE/)
  assert.match(sys, /MOTION CRAFT/)
})

test("fresh-project mode adds creation guidance", () => {
  assert.match(assembledSystem({ freshProject: true }), /CREATION:/)
})

test("MOTION_CRAFT teaches the patterns that separate a cut from a template", () => {
  // Both clamps and perceptual-scale are the specifics a model will not
  // infer; if these go, the output regresses to opacity + translateY.
  assert.match(MOTION_CRAFT, /extrapolateLeft: "clamp"/)
  assert.match(MOTION_CRAFT, /extrapolateRight: "clamp"/)
  assert.match(MOTION_CRAFT, /output: "perceptual-scale"/)
  // Spring damping as a deliberate choice.
  assert.match(MOTION_CRAFT, /damping: 8/)
  assert.match(MOTION_CRAFT, /spring\(/)
  // Parallax rig with distinct per-plane rates.
  assert.match(MOTION_CRAFT, /BACK = 0\.4, MID = 0\.8, FRONT = 1\.4/)
  // Per-character reveal that preserves spaces.
  assert.match(MOTION_CRAFT, /whiteSpace: "pre"/)
  // Animated grain, not static.
  assert.match(MOTION_CRAFT, /noise2D/)
  // Determinism rules that back the linter's blocking errors.
  assert.match(MOTION_CRAFT, /random\("seed"\)/)
  assert.match(MOTION_CRAFT, /Never `Math\.random\(\)`/)
})

test("MOTION_CRAFT and DIRECTION_RULES agree on the one closing sentence", () => {
  // These two are read by the same model in the same prompt. The old
  // wording ("emit the file and stop, no trailing prose") contradicted the
  // reply shape and produced silent turns.
  assert.ok(
    !/no explanation, no trailing prose/i.test(DIRECTION_RULES),
    "DIRECTION_RULES must not ban the closing sentence the reply shape requires"
  )
  assert.match(DIRECTION_RULES, /ONE sentence/i)
})
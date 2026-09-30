/**
 * A follow-up has to read as a follow-up.
 *
 * Observed failure: the user asked for a 3-month earnings graph, then
 * sent a refinement, and got a second unrelated graph with a different
 * concept. `direct` passed only the latest prompt to the director and
 * dropped the history entirely, so every message was a fresh brief.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, "../src/lib/gateway.ts"), "utf8")
const director = readFileSync(
  join(here, "../src/lib/agents/director.ts"),
  "utf8"
)

test("direct builds prior context from the conversation history", () => {
  assert.match(src, /priorContext/)
  // Derived from req.history, and tolerant of it being absent.
  assert.match(src, /req\.history \?\? \[\]/)
  assert.match(src, /role === "user" \? "User" : "AI"/)
})

test("the history reaches the director", () => {
  assert.match(src, /priorContext: priorContext \|\| undefined/)
  assert.match(src, /runDirector\(\{/)
})

test("the director is told to continue rather than restart", () => {
  assert.match(director, /priorContext\?: string/)
  assert.match(director, /continuing session/)
  assert.match(director, /not a fresh brief/)
  // Continuity is the default for a follow-up, not something optional.
  assert.match(director, /refinement of the same idea rather than a new one/)
})

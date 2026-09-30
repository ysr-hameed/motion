/**
 * The gate must not publish code it knows is broken.
 *
 * Observed: the model returned a composition using `CheckCircle2`
 * without importing it. Every existing check passed, so the artifact was
 * published — and the player then failed with a bare ReferenceError and
 * a black frame. Two separate failures: nothing caught the missing
 * import, and the single repair pass gave up and shipped anyway.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const gw = readFileSync(join(here, "../src/lib/gateway.ts"), "utf8")

test("a missing import is a blocking lint error", () => {
  assert.match(gw, /REPAIR_PASSES/)
  // The loop re-lints and re-repairs instead of trying once.
  assert.match(gw, /for \(let attempt = 1; attempt <= REPAIR_PASSES/)
  assert.match(gw, /if \(!fixed\.advanced\)/)
})

test("code that is still broken is never returned", () => {
  // It has to throw, not fall through to a return of broken source.
  assert.match(gw, /const remaining = blockingIssues\(/)
  assert.match(gw, /if \(remaining\.length > 0\) \{[\s\S]*?throw new Error\(/)
  // A pass that made no progress is reported as such, not mistaken for a fix.
  assert.match(gw, /advanced: false/)
})

test("the loop gets more than one attempt", () => {
  const m = gw.match(/const REPAIR_PASSES = (\d+)/)
  assert.ok(m, "REPAIR_PASSES must be declared")
  assert.ok(Number(m[1]) >= 2, "one attempt is what we had, and it leaked")
})

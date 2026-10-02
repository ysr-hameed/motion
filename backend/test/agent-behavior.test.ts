/**
 * Agent behavior guardrails — the adversarial suite.
 *
 * Every test here is a way the agent has actually misbehaved or could be
 * broken from the outside: chit-chat burning the tool loop, giant or
 * hostile inputs, missing files, invalid edits, blocked previews. None
 * of them touch the model — they pin the deterministic machinery around
 * it (smalltalk gate, history pruning, tool ok:false containment) so a
 * bad prompt can never stop the agent with a throw.
 */
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { smalltalkReply } from "../src/lib/smalltalk"
import { MAX_MODEL_HISTORY, pruneForModel, userTextOf } from "../src/lib/agent/history"
import { buildTools } from "../src/lib/agent/tools"
import { COMPOSITION_PATH, CONFIG_PATH } from "../src/lib/agent/store"
import { projectFiles, versions } from "../src/db/schema"
import {
  BROKEN_CODE,
  VALID_CODE,
  createFakeDb,
  fakeCtx,
  fakeProject,
} from "./fake-db"

function toolsFor(seed?: Parameters<typeof createFakeDb>[0]) {
  const db = createFakeDb(seed)
  const tools = buildTools(fakeCtx(db) as never)
  return { db, tools }
}

async function run(tool: { execute: unknown }, input: unknown): Promise<Record<string, unknown>> {
  const fn = tool.execute as (
    input: unknown,
    opts: { toolCallId: string; messages: unknown[] }
  ) => Promise<Record<string, unknown>>
  return fn(input, { toolCallId: "t1", messages: [] })
}

function seededFiles(code = VALID_CODE) {
  return {
    projects: [fakeProject()],
    projectFiles: [
      { id: "f1", projectId: "proj-1", path: COMPOSITION_PATH, content: code },
      {
        id: "f2",
        projectId: "proj-1",
        path: CONFIG_PATH,
        content: JSON.stringify({ format: "16:9", width: 1920, height: 1080, fps: 30, durationInFrames: 150 }),
      },
    ],
  }
}

describe("smalltalk gate", () => {
  it("answers greetings without the model", () => {
    for (const g of ["hi", "Hi!", "hello", "hey!!!", "namaste", "good morning"]) {
      const r = smalltalkReply(g)
      assert.ok(typeof r === "string" && r.length > 0, g)
    }
  })

  it("answers thanks, goodbye and capability questions", () => {
    assert.ok(smalltalkReply("thanks"))
    assert.ok(smalltalkReply("Thank you so much"))
    assert.ok(smalltalkReply("thanks a lot"))
    assert.ok(smalltalkReply("hey there"))
    assert.ok(smalltalkReply("bye"))
    assert.ok(smalltalkReply("what can you do?"))
    assert.ok(smalltalkReply("who are you"))
  })

  it("never swallows real work, even next to a greeting", () => {
    const tasks = [
      "make a countdown",
      "hi, make it red and bigger",
      "hello world is the title text",
      "fix the title timing",
      "thanks, now make it faster",
      "make a countdown animation (Duration: 5 seconds. Format: 16:9.)",
      "ok",
      "5s",
      "",
      "DELETE EVERYTHING",
      "../../etc/passwd",
      "a".repeat(5000),
    ]
    for (const t of tasks) {
      assert.equal(smalltalkReply(t), null, JSON.stringify(t.slice(0, 60)))
    }
  })

  it("never throws on hostile input", () => {
    for (const bad of [null, undefined, 42, {}, [], "a".repeat(100000)]) {
      assert.doesNotThrow(() => smalltalkReply(bad))
    }
  })
})

describe("history pruning", () => {
  const msg = (i: number, parts: unknown[]) => ({ id: `m${i}`, role: i % 2 ? "user" : "assistant", parts })

  it("bounds history length for the model", () => {
    const history = Array.from({ length: 30 }, (_, i) =>
      msg(i, [{ type: "text", text: `message ${i}` }])
    )
    const pruned = pruneForModel(history as never)
    assert.ok(pruned.length <= MAX_MODEL_HISTORY, `window grew to ${pruned.length}`)
    // Most recent turn survives.
    const last = pruned[pruned.length - 1] as { parts: Array<{ text?: string }> }
    assert.match(last.parts[0]?.text ?? "", /message 29/)
  })

  it("NEVER drops the user's brief, however many steps a turn takes", () => {
    // The regression this pins: one turn chains a request per model step, so
    // a long turn produced a dozen assistant step-messages. A plain
    // `slice(-12)` window filled with those and pushed the original brief
    // off the end — the model then said out loud that it had lost the brief,
    // re-planned the identical cut four times, and the next continuation
    // failed outright because no user message remained.
    const brief = { id: "brief", role: "user", parts: [{ type: "text", text: "make me a 5s welcome hook" }] }
    const steps = Array.from({ length: 24 }, (_, i) => ({
      id: `step${i}`,
      role: "assistant",
      parts: [
        { type: "text", text: `step ${i}` },
        { type: "tool-write_composition", toolCallId: `c${i}`, state: "output-available", output: { ok: true } },
      ],
    }))
    const pruned = pruneForModel([brief, ...steps] as never) as Array<{ role: string; parts: Array<{ text?: string }> }>
    assert.ok(
      pruned.some((m) => m.role === "user" && /welcome hook/.test(m.parts[0]?.text ?? "")),
      "the user's brief must always be in the window"
    )
  })

  it("does not mistake the continuation token for a brief", () => {
    const brief = { id: "brief", role: "user", parts: [{ type: "text", text: "make me a hook" }] }
    const steps = Array.from({ length: 20 }, (_, i) => ({
      id: `s${i}`,
      role: i % 2 ? "user" : "assistant",
      parts: [{ type: "text", text: i % 2 ? "[continue-turn]" : `working ${i}` }],
    }))
    const pruned = pruneForModel([brief, ...steps] as never) as Array<{ parts: Array<{ text?: string }> }>
    const pinned = pruned.filter((m) => /make me a hook/.test(m.parts[0]?.text ?? ""))
    assert.equal(pinned.length, 1, "the real brief is pinned; tokens are not briefs")
  })

  it("keeps images only on the newest user turn", () => {
    const img = { type: "file", mediaType: "image/jpeg", url: "data:image/jpeg;base64,XXXX" }
    const history = [
      msg(0, [img]),
      msg(1, [{ type: "text", text: "reply" }]),
      { id: "m2", role: "user", parts: [img] },
    ]
    const pruned = pruneForModel(history as never)
    const oldFiles = JSON.stringify(pruned[0]).includes("base64,XXXX")
    assert.equal(oldFiles, false)
    assert.match(JSON.stringify(pruned[0]), /attached earlier/)
    assert.match(JSON.stringify(pruned[2]), /base64,XXXX/)
  })

  it("truncates full-code snapshots but keeps canvas facts", () => {
    const big = "x".repeat(5000)
    const history = [
      msg(0, [
        {
          type: "tool-preview_composition",
          toolCallId: "c1",
          state: "output-available",
          output: {
            ok: true,
            version: 2,
            artifact: { kind: "code", width: 1920, height: 1080, fps: 30, durationInFrames: 150, code: big },
          },
        },
      ]),
      msg(1, [{ type: "text", text: "next" }]),
    ]
    const pruned = pruneForModel(history as never)
    const s = JSON.stringify(pruned[0])
    assert.ok(!s.includes(big))
    assert.match(s, /"version":2/)
    assert.match(s, /1920/)
  })

  it("caps adversarial user pastes", () => {
    const history = [{ id: "m0", role: "user", parts: [{ type: "text", text: "a".repeat(20000) }] }]
    const pruned = pruneForModel(history as never)
    const text = (pruned[0] as { parts: Array<{ text: string }> }).parts[0]?.text ?? ""
    assert.ok(text.length < 5000)
    assert.match(text, /truncated/)
  })

  it("never throws on malformed parts", () => {
    assert.doesNotThrow(() =>
      pruneForModel([
        { id: "x", role: "user", parts: [null, 42, "str", { type: "tool-x", input: BigInt(1) }] },
      ] as never)
    )
  })
})

describe("userTextOf", () => {
  it("joins text parts and flags files", () => {
    const r = userTextOf({ parts: [{ type: "text", text: "hi " }, { type: "file" }] })
    assert.equal(r.text, "hi ")
    assert.equal(r.hasFiles, true)
  })

  it("tolerates missing and malformed parts", () => {
    assert.deepEqual(userTextOf({}), { text: "", hasFiles: false })
    assert.deepEqual(userTextOf({ parts: null }), { text: "", hasFiles: false })
    assert.deepEqual(userTextOf({ parts: [null, { type: "text" }] }), { text: "", hasFiles: false })
  })
})

describe("tool failure containment", () => {
  it("read_file on a missing file returns ok:false, never throws", async () => {
    const { tools } = toolsFor(seededFiles())
    const out = await run(tools.read_file, { path: "src/Nope.tsx" })
    assert.equal(out.ok, false)
    assert.match(String(out.error), /File not found/)
  })

  it("read_file refuses traversal as ok:false", async () => {
    const { tools } = toolsFor(seededFiles())
    const out = await run(tools.read_file, { path: "../../etc/passwd" })
    assert.equal(out.ok, false)
    assert.match(String(out.error), /unsafe/i)
  })

  it("create_file on an existing path returns ok:false", async () => {
    const { tools } = toolsFor(seededFiles())
    const out = await run(tools.create_file, { path: COMPOSITION_PATH, content: "x".repeat(300) })
    assert.equal(out.ok, false)
    assert.match(String(out.error), /already exists/)
  })

  it("create_file with an overlong path returns ok:false", async () => {
    const { tools } = toolsFor(seededFiles())
    const out = await run(tools.create_file, { path: `${"a".repeat(201)}.tsx`, content: "x".repeat(300) })
    assert.equal(out.ok, false)
  })

  it("edit_file with no ops and no instruction returns ok:false", async () => {
    const { tools } = toolsFor(seededFiles())
    const out = await run(tools.edit_file, { path: COMPOSITION_PATH })
    assert.equal(out.ok, false)
  })

  it("edit_file with a bad find returns ok:false with misses", async () => {
    const { tools } = toolsFor(seededFiles())
    const out = await run(tools.edit_file, {
      path: COMPOSITION_PATH,
      ops: [{ op: "replace", find: "THIS DOES NOT EXIST ANYWHERE", replace: "x" }],
    })
    assert.equal(out.ok, false)
    assert.equal(out.applied, 0)
  })

  it("edit_file applies a verbatim find", async () => {
    const { db, tools } = toolsFor(seededFiles())
    const out = await run(tools.edit_file, {
      path: COMPOSITION_PATH,
      ops: [{ op: "replace", find: "Hello", replace: "Countdown" }],
    })
    assert.equal(out.ok, true)
    const files = db.tables.get(projectFiles) ?? []
    assert.match(String(files[0]?.content), /Countdown/)
    assert.ok(!String(files[0]?.content).includes("Hello"))
  })

  it("search_code with an invalid regex returns ok:false", async () => {
    const { tools } = toolsFor(seededFiles())
    const out = await run(tools.search_code, { pattern: "([", regex: true })
    assert.equal(out.ok, false)
    assert.match(String(out.error), /Invalid regex/)
  })

  it("preview on broken code returns ok:false with blocking errors, saves nothing", async () => {
    const { db, tools } = toolsFor(seededFiles(BROKEN_CODE))
    const out = await run(tools.preview_composition, { note: "try" })
    assert.equal(out.ok, false)
    assert.ok(Array.isArray(out.blocking) && (out.blocking as unknown[]).length > 0)
    assert.equal((db.tables.get(versions) ?? []).length, 0)
  })

  it("preview on clean code publishes a version", async () => {
    const { tools } = toolsFor(seededFiles())
    const out = await run(tools.preview_composition, { note: "first cut" })
    assert.equal(out.ok, true)
    assert.equal(out.version, 1)
    assert.ok(out.artifact)
  })

  it("write_composition rejects code without a default export", async () => {
    const { tools } = toolsFor(seededFiles())
    const out = await run(tools.write_composition, {
      content: `export const x = 1;\n${"// pad\n".repeat(30)}`,
    })
    assert.equal(out.ok, false)
  })

  it("write_composition rejects unparseable code", async () => {
    const { tools } = toolsFor(seededFiles())
    const out = await run(tools.write_composition, { content: `${BROKEN_CODE}\n${"// pad\n".repeat(40)}` })
    assert.equal(out.ok, false)
  })

  it("write_composition accepts a valid full rewrite", async () => {
    const { tools } = toolsFor(seededFiles())
    const out = await run(tools.write_composition, { content: VALID_CODE })
    assert.equal(out.ok, true)
  })

  it("delete without confirmation does not delete", async () => {
    const { tools } = toolsFor(seededFiles())
    const out = await run(tools.delete_file, { path: "src/Extra.tsx", confirmed: false })
    assert.equal(out.ok, true)
    assert.equal(out.deleted, false)
  })

  it("the main composition can never be deleted", async () => {
    const { tools } = toolsFor(seededFiles())
    const out = await run(tools.delete_file, { path: COMPOSITION_PATH, confirmed: true })
    assert.equal(out.ok, false)
  })

  it("unknown assets resolve to ok:false, not a throw", async () => {
    const { tools } = toolsFor(seededFiles())
    const imp = await run(tools.import_asset, { assetId: "nope" })
    assert.equal(imp.ok, false)
    const insp = await run(tools.inspect_asset, { assetId: "nope" })
    assert.equal(insp.ok, false)
  })
})

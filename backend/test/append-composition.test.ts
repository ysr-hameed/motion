import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { buildTools } from "../src/lib/agent/tools"
import { COMPOSITION_PATH, CONFIG_PATH } from "../src/lib/agent/store"
import { projectFiles } from "../src/db/schema"
import { createFakeDb, fakeCtx, fakeProject, VALID_CODE } from "./fake-db"

/**
 * Incremental composition building.
 *
 * A whole-file write is structurally incapable of working here, because the
 * file IS the tool-call argument and the response has a hard output cap. When
 * a scene outgrows the cap the JSON never closes, the SDK discards the call
 * WITHOUT running it, nothing throws, and the model is told nothing useful —
 * so it resends the identical payload. Six identical plans, six 16.2K-token
 * responses, nothing saved.
 *
 * `append_composition` is the structural fix: each beat is its own bounded
 * call, spliced above a marker that `write_composition` guarantees and that
 * survives every append. These tests pin the properties that make that safe —
 * the marker survives, the file still lints and mounts, order is stable, and
 * a bad beat is rejected rather than corrupting the file.
 */

const MARKER = "/* @@BEATS@@ */"

type Tool = { execute?: (a: unknown, o?: unknown) => Promise<unknown> }

function toolsFor(seed?: Parameters<typeof createFakeDb>[0]) {
  const db = createFakeDb(seed)
  return { db, tools: buildTools(fakeCtx(db) as never) as unknown as Record<string, Tool> }
}

async function run(tool: Tool | undefined, input: unknown) {
  assert.ok(tool?.execute, "tool must have execute")
  return (await tool!.execute!(input)) as Record<string, unknown>
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

function storedContent(db: ReturnType<typeof createFakeDb>): string {
  const rows = db.tables.get(projectFiles) ?? []
  const row = rows.find((r) => r.path === COMPOSITION_PATH)
  return String(row?.content ?? "")
}

/** The marker, escaped for use inside a RegExp. */
const MARKER_RE = new RegExp(MARKER.replace(/[/*]/g, "\\$&"))

/** A beat is ordinary JSX-scoped code with no module-level statements. */
const BEAT = `  <div style={{ color: "#0f0", fontSize: 40 }}>Beat</div>`

describe("append_composition", () => {
  it("adds a beat without resending the file", async () => {
    const { db, tools } = toolsFor(seededFiles())
    // First write the skeleton — which must plant the splice point itself,
    // so the model never has to remember to.
    const wrote = await run(tools.write_composition, { content: VALID_CODE })
    assert.equal(wrote.ok, true)
    assert.match(String(storedContent(db)), MARKER_RE)

    const out = await run(tools.append_composition, { content: BEAT })
    assert.equal(out.ok, true, "append must succeed")
    assert.equal(out.strategy, "append")

    const file = storedContent(db)
    assert.match(file, /Beat/, "the beat is in the file")
    assert.match(file, MARKER_RE, "the marker survives the append")
    assert.ok(
      file.indexOf("Beat") < file.indexOf(MARKER),
      "the beat lands ABOVE the marker, so the next append still has room"
    )
  })

  it("survives many appends — a scene can grow past any single reply", async () => {
    const { db, tools } = toolsFor(seededFiles())
    await run(tools.write_composition, { content: VALID_CODE })

    for (let i = 0; i < 12; i++) {
      const out = await run(tools.append_composition, {
        content: `  <div style={{ opacity: 0.${i} }}>beat${i}</div>`,
      })
      assert.equal(out.ok, true, `append ${i} must succeed`)
    }
    const file = storedContent(db)
    assert.match(file, MARKER_RE, "marker still there after 12")
    // Order is call order: this is what makes the composition predictable.
    const order = [...file.matchAll(/beat(\d+)/g)].map((m) => Number(m[1]))
    assert.deepEqual(order, [...Array(12).keys()], "beats keep their call order")
  })

  it("rejects an append with no splice point rather than corrupting the file", async () => {
    const { db, tools } = toolsFor(seededFiles())
    // A file written before this feature existed: no marker.
    const out = await run(tools.append_composition, { content: BEAT })
    assert.equal(out.ok, false)
    assert.match(String(out.hint), /write_composition/, "the hint says how to fix it")
    assert.equal(storedContent(db), VALID_CODE, "the file is untouched")
  })

  it("rejects a beat carrying imports, pointing at edit_file", async () => {
    const { db, tools } = toolsFor(seededFiles())
    await run(tools.write_composition, { content: VALID_CODE })
    const out = await run(tools.append_composition, {
      content: `import { spring } from "remotion";\n${BEAT}`,
    })
    assert.equal(out.ok, false, "imports at the end of a file are invalid")
    assert.match(String(out.hint), /edit_file/)
    assert.ok(!storedContent(db).includes("import { spring }"), "nothing was written")
  })

  it("rejects a beat that does not parse, and leaves the file intact", async () => {
    const { db, tools } = toolsFor(seededFiles())
    await run(tools.write_composition, { content: VALID_CODE })
    const before = storedContent(db)

    // Unbalanced braces — the shape the static gate does catch.
    const out = await run(tools.append_composition, { content: `  <div style={{ color: "#fff" }}>x` })
    assert.equal(out.ok, false, "a broken beat must be rejected with reasons")
    assert.ok(Array.isArray(out.misses) && (out.misses as string[]).length > 0)
    assert.equal(storedContent(db), before, "a failed append changes nothing")
  })

  it("a beat can pass the static gate and still fail at render", async () => {
    // Documents a real limit rather than pretending it does not exist. The
    // gate is regex-based: `<div style={{ color: }}>` has balanced braces and
    // a closed tag, so it is accepted here and rejected later by the render
    // error path + repair loop. Worth knowing which failures the static gate
    // CANNOT catch before trusting a preview.
    const { tools } = toolsFor(seededFiles())
    await run(tools.write_composition, { content: VALID_CODE })
    const out = await run(tools.append_composition, { content: `  <div style={{ color: }}>x</div>` })
    assert.equal(out.ok, true, "documented limit: the static gate does not see this")
  })

  it("rejects a beat that would embed binary — the failure that burned the turn", async () => {
    const { db, tools } = toolsFor(seededFiles())
    await run(tools.write_composition, { content: VALID_CODE })
    const before = storedContent(db)

    const out = await run(tools.append_composition, {
      content: `  <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==" />`,
    })
    assert.equal(out.ok, false, "inline binary must be refused on the append path too")
    assert.equal(storedContent(db), before)
  })

  it("the whole file is still gated after the splice", async () => {
    const { db, tools } = toolsFor(seededFiles())
    await run(tools.write_composition, { content: VALID_CODE })
    // Math.random() is a blocking lint error, so the append must fail even
    // though the beat itself is syntactically fine.
    const out = await run(tools.append_composition, {
      content: `  <div>{Math.random()}</div>`,
    })
    assert.equal(out.ok, false)
    assert.ok((out.misses as string[]).some((m) => /math-random|deterministic/i.test(m)))
  })
})
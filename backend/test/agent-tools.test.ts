import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { assertSafePath, COMPOSITION_PATH } from "../src/lib/agent/store"
import { buildTools } from "../src/lib/agent/tools"

describe("agent workspace paths", () => {
  it("accepts normal relative paths", () => {
    assert.equal(assertSafePath("src/Composition.tsx"), "src/Composition.tsx")
    assert.equal(assertSafePath("src/scenes/Intro.tsx"), "src/scenes/Intro.tsx")
  })

  it("rejects traversal, null bytes and empty paths", () => {
    for (const bad of ["../secret", "src/../../x", "..", "", ".", "a\0b", "src/../.."]) {
      assert.throws(() => assertSafePath(bad), undefined, bad || "(empty)")
    }
  })

  it("normalises a leading slash to a relative key", () => {
    assert.equal(assertSafePath("/src/Intro.tsx"), "src/Intro.tsx")
  })

  it("composition entrypoint is stable", () => {
    assert.equal(COMPOSITION_PATH, "src/Composition.tsx")
  })
})

describe("agent tool system", () => {
  it("exposes the full clean tool surface, no tiny prop tools", () => {
    const tools = buildTools({} as never)
    const names = Object.keys(tools).sort()
    assert.deepEqual(names, [
      "ask_user",
      "create_file",
      "delete_file",
      "edit_file",
      "get_errors",
      "get_logs",
      "get_project",
      "get_project_structure",
      "import_asset",
      "inspect_asset",
      "inspect_composition",
      "inspect_render_error",
      "inspect_timeline",
      "preview_composition",
      "read_file",
      "remove_asset",
      "rename_file",
      "render_video",
      "request_approval",
      "search_assets",
      "search_code",
      "validate_composition",
    ])
  })
})

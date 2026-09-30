import { test } from "node:test"
import assert from "node:assert/strict"
import { buildKnowledge, renderSkills, selectSkills, skillIds } from "../src/lib/remotion-skills"

/**
 * Selection decides what the composer actually knows. Too narrow and the
 * composition comes back wrong; too broad and the prompt stops being read.
 */

test("the corpus is populated and the core skills are present", () => {
  const ids = skillIds()
  assert.ok(ids.length >= 25, `expected a real corpus, got ${ids.length}`)
  for (const must of ["SKILL", "timing", "sequencing", "compositions"]) {
    assert.ok(ids.includes(must), `missing ${must}`)
  }
})

test("the core skills are on every prompt", () => {
  for (const brief of ["", "a red circle", "make me something"]) {
    const ids = selectSkills(brief).map((s) => s.id)
    for (const must of ["SKILL", "timing", "sequencing", "compositions"]) {
      assert.ok(ids.includes(must), `"${must}" dropped for brief "${brief}"`)
    }
  }
})

test("a bare brief pulls in nothing extra", () => {
  const ids = selectSkills("a red circle").map((s) => s.id)
  assert.equal(ids.length, 4)
})

test("topic keywords select their skill", () => {
  const cases: Array<[string, string]> = [
    ["a video with music and a waveform visualizer", "audio-visualization"],
    ["rotate the card in 3d with a perspective camera", "3d"],
    ["use a google font for the headline", "google-fonts"],
    ["animate the logo with lottie", "lottie"],
    ["subtitles that highlight each word", "text-highlights"],
    ["trim the footage down to the good parts", "video-editing"],
    ["light leaks and lens flare over the shot", "light-leaks"],
    ["motion blur on the fast part", "motion-blur"],
    ["cut between scenes with a wipe", "transitions"],
  ]
  for (const [brief, expect] of cases) {
    const ids = selectSkills(brief).map((s) => s.id)
    assert.ok(
      ids.includes(expect),
      `brief "${brief}" did not select ${expect} (got ${ids.join(", ")})`
    )
  }
})

test("a UI-interaction brief does not drag in 3D it does not need", () => {
  // The cursor/click family is deliberately not mapped to any of the
  // visual-effect skills — an interaction demo should not be handed a
  // perspective-camera reference.
  const ids = selectSkills("a cursor clicks the search button and results type out").map(
    (s) => s.id
  )
  assert.equal(ids.includes("3d"), false)
  assert.equal(ids.includes("effects"), false)
})

test("selection is capped so keyword stuffing cannot blow the budget", () => {
  const stuffed = [
    "video", "audio", "music", "voiceover", "sfx", "waveform", "image", "gif",
    "lottie", "3d", "glitch", "light leak", "highlight", "google font", "crop",
    "ffmpeg", "transitions", "montage", "html in canvas", "parameters",
  ].join(" ")
  const ids = selectSkills(stuffed)
  assert.ok(ids.length <= 7, `selected ${ids.length} skills`)
  assert.ok(ids.length > 4)
})

test("selection is stable across identical calls", () => {
  const brief = "a luxury product reveal with music and a slow camera push"
  const a = selectSkills(brief).map((s) => s.id)
  const b = selectSkills(brief).map((s) => s.id)
  assert.deepEqual(a, b)
})

test("the rendered block is wrapped and carries the content", () => {
  const block = buildKnowledge("a video with music")
  assert.match(block, /^# REMOTION REFERENCE/)
  assert.match(block, /<skill name="SKILL">/)
  assert.match(block, /<\/skill>/)
  // It must be real guidance, not a stub.
  assert.ok(block.length > 5000, `block is only ${block.length} chars`)
})

test("an empty selection renders nothing rather than an empty header", () => {
  assert.equal(renderSkills([]), "")
})

/**
 * AGENT_UPGRADE_PLAN Phase 4: motion quality + validation regression tests.
 *
 * Run: compile with tsc to CommonJS, then `node --test` on the output.
 * Every assertion is on a pure helper — no model, no network.
 */
import { describe, it } from "node:test"
import * as assert from "node:assert/strict"
import { checkComposition } from "../validate"
import {
  MotionPatterns,
  SpringPresets,
  cascadeSpring,
  presetForBeat,
  presetSnippet,
  textAnimationSnippet,
} from "../motion-library"
import { LayoutEngine, analyzeCodeOverflow } from "../layout-engine"
import { TYPE_SCALE, TypographyPresets, adaptiveTextSize } from "../type"

const wrap = (body: string) =>
  `import { useCurrentFrame, interpolate, spring, Easing } from "remotion";\nexport default function MyCut() {\n  const frame = useCurrentFrame();\n  return <div>${body}</div>;\n}`

const errors = (code: string) => checkComposition(code).filter((c) => c.level === "error")
const warns = (code: string) => checkComposition(code).filter((c) => c.level === "warn")

describe("Motion Quality Enforcement", () => {
  it("flags linear interpolations without easing", () => {
    const w = warns(wrap(`style={{ opacity: interpolate(frame, [0, 60], [0, 1]) }}`))
    assert.ok(w.some((x) => /linear/i.test(x.message)), "expected a linear-timing warning")
  })

  it("stays quiet when easing is explicit", () => {
    const w = warns(
      wrap(`style={{ opacity: interpolate(frame, [0, 60], [0, 1], { easing: Easing.bezier(0.16, 1, 0.3, 1) }) }}`)
    )
    assert.ok(!w.some((x) => /linear/i.test(x.message)), "unexpected linear-timing warning")
  })

  it("requires z-index on positioned elements", () => {
    const same = warns(
      wrap(
        `<div style={{ position: 'absolute', left: 100, top: 100, zIndex: 10 }} /><div style={{ position: 'absolute', left: 200, top: 200, zIndex: 10 }} />`
      )
    )
    assert.ok(same.some((x) => /z-index/i.test(x.message)), "expected a z-index conflict warning")

    const distinct = warns(
      wrap(
        `<div style={{ position: 'absolute', left: 100, top: 100, zIndex: 1 }} /><div style={{ position: 'absolute', left: 200, top: 200, zIndex: 10 }} />`
      )
    )
    assert.ok(!distinct.some((x) => /z-index/i.test(x.message)), "unexpected z-index warning")
  })

  it("catches off-canvas translate ranges", () => {
    const w = warns(wrap(`style={{ translate: interpolate(frame, [0, 60], [0, -2500]) }}`))
    assert.ok(w.some((x) => /overflow|off-canvas|canvas/i.test(x.message)), "expected an overflow warning")
    assert.equal(analyzeCodeOverflow(wrap(`interpolate(frame, [0, 60], [0, -2500])`)).length, 1)
    assert.equal(analyzeCodeOverflow(wrap(`interpolate(frame, [0, 60], [0, 100])`)).length, 0)
  })

  it("requires stagger on mapped lists", () => {
    const w = warns(wrap(`{items.map((item) => <div style={{ opacity: x }} />)}`))
    assert.ok(w.some((x) => /stagger/i.test(x.message)), "expected a stagger warning")

    const ok = warns(wrap(`{items.map((item, i) => <div style={{ opacity: y, delay: i * 3 }} />)}`))
    assert.ok(!ok.some((x) => /stagger/i.test(x.message)), "unexpected stagger warning")
  })

  it("requires a spring landing", () => {
    const w = warns(wrap(`style={{ opacity: interpolate(frame, [0, 60], [0, 1], { easing: Easing.bezier(0.16, 1, 0.3, 1) }) }}`))
    assert.ok(w.some((x) => /spring|settle/i.test(x.message)), "expected a missing-spring warning")
  })

  it("flags sub-15-frame transitions", () => {
    const w = warns(
      wrap(`style={{ opacity: interpolate(frame, [0, 10], [0, 1], { easing: Easing.bezier(0.16, 1, 0.3, 1) }) }}`)
    )
    assert.ok(w.some((x) => /too fast/i.test(x.message)), "expected a too-fast transition warning")
  })
})

describe("Validation Correctness", () => {
  it("rejects wall-clock time", () => {
    const e = errors(wrap(`{Date.now()}`))
    assert.ok(e.some((x) => /non-deterministic/i.test(x.message)))
  })

  it("rejects event listeners", () => {
    const e = errors(wrap(`<div onClick={() => {}} />`))
    assert.ok(e.some((x) => /Event listeners/i.test(x.message)))
  })

  it("rejects interpolate(frame) with no frame binding", () => {
    const code = `import { interpolate } from "remotion";\nexport default function MyCut() {\n  return <div style={{ opacity: interpolate(frame, [0, 60], [0, 1]) }} />;\n}`
    const e = errors(code)
    assert.ok(e.some((x) => /no frame variable/i.test(x.message)))
  })

  it("rejects Math.random", () => {
    const e = errors(wrap(`{Math.random()}`))
    assert.ok(e.some((x) => /Math\.random/.test(x.message)))
  })

  it("rejects a missing default export", () => {
    const e = errors(`import { useCurrentFrame } from "remotion";\nexport function MyCut() { return <div />; }`)
    assert.ok(e.some((x) => /default export/i.test(x.message)))
  })

  it("warns on async work without a render gate", () => {
    const w = warns(wrap(`{fetch("/x")}`))
    assert.ok(w.some((x) => /continueRender|delayRender/i.test(x.message)))
  })
})

describe("Motion Library", () => {
  it("maps beat types to presets with a fallback", () => {
    assert.equal(presetForBeat("entrance").id, "heroEntrance")
    assert.equal(presetForBeat("transition").id, "seamlessHandoff")
    assert.equal(presetForBeat("settle").id, "elasticSettle")
    assert.equal(presetForBeat("exit").id, "fadeToBlack")
    assert.equal(presetForBeat("emphasis").id, "punchIn")
    assert.equal(presetForBeat("something-new").id, "heroEntrance")
  })

  it("emits paste-ready snippets naming frames", () => {
    const snippet = presetSnippet("heroEntrance", 30)
    assert.ok(snippet.includes("[30, 90]"), "snippet should name frames 30→90")
    assert.ok(snippet.includes("spring"), "hero entrance should include a spring")
    assert.ok(presetSnippet("fadeToBlack", 0).includes("hold"), "exit should name its hold")
  })

  it("cascades springs with a 3-frame stagger", () => {
    const steps = cascadeSpring(3, 10, "snappy")
    assert.deepEqual(
      steps.map((s) => s.delay),
      [10, 13, 16]
    )
    assert.deepEqual(steps[0]?.spring, SpringPresets.snappy)
    assert.equal(cascadeSpring(0, 0).length, 0)
  })

  it("ships product + text patterns", () => {
    assert.equal(MotionPatterns.productReveal.length, 3)
    assert.equal(MotionPatterns.textSequence.length, 3)
    for (const beat of [...MotionPatterns.productReveal, ...MotionPatterns.textSequence]) {
      assert.ok(beat.delay >= 0, "pattern delays must be non-negative")
    }
  })

  it("generates text animation snippets with baked-in staggers", () => {
    const chars = textAnimationSnippet("charByChar", "Hello", 20)
    assert.ok(chars.includes("[20 + i * 2"), "char stagger must start at frame 20")
    const words = textAnimationSnippet("wordByWord", "Hello world", 20)
    assert.ok(words.includes("spring("), "word reveal lands per-word with a spring")
    const mask = textAnimationSnippet("maskReveal", "Hello", 20)
    assert.ok(mask.includes("[20, 65]") && mask.includes("clipPath"), "mask reveal spans 45 frames")
  })
})

describe("Layout Engine", () => {
  it("detects overflow against the safe margin", () => {
    const engine = new LayoutEngine()
    assert.equal(
      engine.detectOverflow({ id: "a", type: "text", bounds: { x: 10, y: 10, width: 100, height: 40 }, zIndex: 10 }),
      true
    )
    assert.equal(
      engine.detectOverflow({ id: "b", type: "text", bounds: { x: 800, y: 400, width: 320, height: 120 }, zIndex: 10 }),
      false
    )
  })

  it("auto-layout clamps inside the canvas and emits hints", () => {
    const engine = new LayoutEngine()
    const plan = engine.autoLayout(
      [
        { id: "title", type: "text", width: 1200, height: 160 },
        { id: "bg", type: "image", width: 1800, height: 900 },
      ],
      "hierarchy"
    )
    assert.equal(plan.elements.length, 2)
    assert.equal(plan.conflicts.filter((c) => c.type === "overflow").length, 0)
    assert.equal(plan.codeHints.length, 2)
    assert.ok(plan.codeHints[0]?.includes("zIndex"), "hints must carry z-index")
  })

  it("flags same-plane overlaps but not separated layers", () => {
    const engine = new LayoutEngine()
    const a = { id: "a", type: "text" as const, bounds: { x: 100, y: 100, width: 400, height: 200 }, zIndex: 10 }
    const b = { id: "b", type: "text" as const, bounds: { x: 200, y: 150, width: 400, height: 200 }, zIndex: 10 }
    const c = { id: "c", type: "text" as const, bounds: { x: 200, y: 150, width: 400, height: 200 }, zIndex: 30 }
    assert.equal(engine.detectOverlap(a, b), true)
    assert.equal(engine.detectOverlap(a, c), false)
    assert.ok(engine.detectConflicts([a, b]).some((x) => x.type === "z-conflict"))
  })
})

describe("Typography Engine", () => {
  it("adapts size to copy length", () => {
    const [base, max] = TYPE_SCALE.hero
    assert.equal(adaptiveTextSize("Hi", "hero"), max)
    assert.equal(adaptiveTextSize("x".repeat(80), "hero"), base)
    const mid = adaptiveTextSize("x".repeat(40), "hero")
    assert.ok(mid < max && mid > base, "mid-length copy lands between base and max")
  })

  it("keeps display presets in a video-safe range", () => {
    for (const lockup of Object.values(TypographyPresets)) {
      for (const role of Object.values(lockup)) {
        assert.ok(role.size >= 20 && role.size <= 200, `size ${role.size} out of range`)
        assert.ok(role.lineHeight >= 0.85 && role.lineHeight <= 1.6, `leading ${role.lineHeight} out of range`)
      }
    }
  })
})

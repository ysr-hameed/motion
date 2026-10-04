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
  applyLucideNamespace,
  autoRepairInline,
  browserFixHint,
  ensureRandomImport,
  gateVerification,
  suggestCloseMatch,
} from "../tools"
import { goldenStarter } from "../templates"
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

describe("Verification Gate", () => {
  it("passes warnings-only code as advisory, never blocking", () => {
    const gate = gateVerification(
      [{ level: "warn", message: "translate range reaches 2000px — past the canvas edge (advisory)" }],
      null
    )
    assert.equal(gate.ok, true)
    assert.equal(gate.blocking, false)
    assert.equal(gate.advisory.length, 1)
  })

  it("blocks on static errors", () => {
    const gate = gateVerification([{ level: "error", message: "Math.random() is non-deterministic" }], null)
    assert.equal(gate.ok, false)
    assert.equal(gate.blocking, true)
  })

  it("blocks on a failed player report even with zero static errors", () => {
    const gate = gateVerification([], { phase: "runtime", message: "runtime: cannot read x (line 42)" })
    assert.equal(gate.ok, false)
    assert.equal(gate.blocking, true)
    assert.ok(/browser/i.test(gate.errors[0] ?? ""))
  })

  it("lets entrance motion through: off-canvas start is advisory, not an error", () => {
    const code = wrap(`style={{ translateY: interpolate(frame, [0, 60], [2000, 540]) }}`)
    assert.equal(errors(code).length, 0, "an entrance must not be an error")
  })
})

describe("AI-Friendly Edits", () => {
  it("suggests the closest real lines for a missed find", () => {
    const code = `const a = 1;\n  const eyeY = interpolate(frame, [0, 60], [0, 540]);\nconst b = 2;`
    const s = suggestCloseMatch(code, "const eyeY = interpolate(frame, [0, 60], [0, 500]);")
    assert.ok(s.length > 0, "expected a suggestion")
    assert.equal(s[0]?.line, 2)
    assert.ok((s[0]?.text ?? "").includes("eyeY"))
  })

  it("returns no suggestion for unrelated text", () => {
    const s = suggestCloseMatch(`const a = 1;\nconst b = 2;`, "quux zzz top-level wobble fnord")
    assert.equal(s.length, 0)
  })

  it("converts lucide named imports to the Lucide namespace", () => {
    const src = `import { Zap, Play } from "lucide-react";\nexport const A = () => <div><Zap size={12} /><Play /></div>;`
    const { code, names } = applyLucideNamespace(src)
    assert.deepEqual(names, ["Zap", "Play"])
    assert.ok(code.includes(`import * as Lucide from "lucide-react"`))
    assert.ok(code.includes("<Lucide.Zap") && code.includes("<Lucide.Play"))
    assert.ok(!code.includes("{ Zap"))
  })

  it("adds the random import once, idempotently", () => {
    const src = `import { interpolate } from "remotion";\nconst x = random(1);`
    const first = ensureRandomImport(src)
    assert.equal(first.added, true)
    assert.ok(/import\s*\{[^}]*\brandom\b[^}]*\}\s*from\s*"remotion"/.test(first.code))
    assert.equal(ensureRandomImport(first.code).added, false)
  })

  it("maps browser failures to the cheapest fix path", () => {
    assert.ok(/auto_fix_code/.test(browserFixHint(`"Zap" is not available`)))
    assert.ok(/edit_file/.test(browserFixHint(`oops (line 42)`)))
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

describe("Golden Starters + Inline Repair (fast path)", () => {
  it("every golden validates with zero errors and real motion", () => {
    for (const id of ["product-reveal", "logo-animation", "quote-card", "social-ad", "no-such-template"]) {
      const g = goldenStarter(id, { product: "Acme", headline: "Motion that lands" })
      const errs = errors(g.code)
      assert.equal(errs.length, 0, `${id} errors: ${errs.map((e) => e.message).join(" | ")}`)
      assert.ok(g.plan.beats.length >= 2, `${id} needs at least two beats`)
      for (const re of [/\bspring\(/, /Easing\.bezier/, /extrapolateRight: "clamp"/, /export default/]) {
        assert.ok(re.test(g.code), `${id} missing ${re}`)
      }
    }
  })

  it("ignores JSX copy and comments in scope checks", () => {
    const code = [
      `import { AbsoluteFill, useCurrentFrame } from "remotion";`,
      `// Beat 1 — hero Entrance for Acme Corp`,
      `export default function MyCut() {`,
      `  const frame = useCurrentFrame();`,
      `  return <AbsoluteFill><div>SCROLL FOR MORE</div></AbsoluteFill>;`,
      `}`,
    ].join("\n")
    const scopeErrs = errors(code).filter((e) => /not in the player scope|not available/.test(e.message))
    assert.equal(scopeErrs.length, 0, `copy flagged as code: ${scopeErrs.map((e) => e.message).join(" | ")}`)
  })

  it("repairs multi-import files without touching other imports", () => {
    const src = `import { interpolate, spring } from "remotion";\nimport { Zap, Play as Go } from "lucide-react";\nexport const A = () => <div><Zap /><Go /></div>;`
    const { code, names } = applyLucideNamespace(src)
    assert.deepEqual(names, ["Zap", "Go"])
    assert.ok(code.includes(`import { interpolate, spring } from "remotion"`), "remotion import mangled")
    assert.ok(code.includes(`import * as Lucide from "lucide-react"`))
    assert.ok(code.includes("<Lucide.Zap") && code.includes("<Lucide.Play"), "alias must map to the original icon")
  })

  it("autoRepairInline fixes a dirty write to zero errors in one pass", () => {
    const dirty = `import { interpolate, spring } from "remotion"\nimport { Zap } from "lucide-react"\nexport default function C() {\n const x = Math.random()\n const o = interpolate(frame, [0,60], [0,1])\n return <div><Zap /></div>\n}`
    const fixed = autoRepairInline(dirty)
    assert.ok(fixed.applied.length >= 4, `expected 4+ repairs, got ${fixed.applied.join(", ")}`)
    const errs = errors(fixed.code)
    assert.equal(errs.length, 0, `still broken: ${errs.map((e) => e.message).join(" | ")}`)
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

/**
 * Web-bundle motion quality + validation regression tests.
 *
 * Run: compile with tsc to CommonJS, then `node --test` on the output.
 * Every assertion is on a pure helper — no model, no network.
 */
import { describe, it } from "node:test"
import * as assert from "node:assert/strict"
import { checkComposition, checkJsSyntax, preValidatePlan } from "../validate"
import { parseBundle, serializeBundle } from "../bundle"
import {
  autoRepairBundle,
  autoRepairInline,
  browserFixHint,
  gateVerification,
  suggestCloseMatch,
} from "../tools"
import { goldenStarter, minimalStarter } from "../templates"
import {
  MotionPatterns,
  SpringPresets,
  cascadeSpring,
  presetForBeat,
  presetSnippet,
  textAnimationSnippet,
} from "../motion-library"
import { LayoutEngine } from "../layout-engine"
import { TYPE_SCALE, TypographyPresets, adaptiveTextSize } from "../type"

const bundle = (js: string, html = `<div id="a"></div>`, css = `#a{position:absolute}`) =>
  serializeBundle({
    version: 1,
    html,
    css,
    js,
    meta: { title: "t", duration: 5, fps: 30, width: 1920, height: 1080 },
  })

const RENDER = (body: string) => `function render(t, ctx) {\n  var f = ctx.frame;\n${body}\n}`

const errors = (code: string) => checkComposition(code).filter((c) => c.level === "error")
const warns = (code: string) => checkComposition(code).filter((c) => c.level === "warn")

describe("Bundle contract", () => {
  it("parses a valid bundle", () => {
    const p = parseBundle(bundle(RENDER(`ctx.el("a").style.opacity = 1;`)))
    assert.equal(p.ok, true)
    assert.equal(p.legacy, false)
  })

  it("flags legacy Remotion TSX instead of validating it", () => {
    const tsx = `import { AbsoluteFill } from "remotion"\nexport default function C() { return null }`
    const p = parseBundle(tsx)
    assert.equal(p.legacy, true)
    const e = errors(tsx)
    assert.equal(e.length, 1)
    assert.match(e[0]!.message, /Legacy Remotion/)
  })

  it("requires a render(t, ctx) entry point", () => {
    const e = errors(bundle(`var x = 1;`))
    assert.ok(e.some((x) => /render\(t, ctx\)/.test(x.message)), JSON.stringify(e))
  })

  it("refuses wall-clock time, Math.random, and event handlers", () => {
    assert.ok(errors(bundle(RENDER(`var x = Date.now();`))).length > 0)
    assert.ok(errors(bundle(RENDER(`var x = Math.random();`))).length > 0)
    assert.ok(
      errors(bundle(RENDER(`ctx.el("a").addEventListener("click", function(){});`))).length > 0,
      "handlers break export determinism"
    )
  })

  it("refuses eval, imports, and script tags", () => {
    assert.ok(errors(bundle(RENDER(`eval("1");`))).length > 0)
    assert.ok(errors(bundle(`import x from "y";\n` + RENDER(`1;`))).length > 0)
    assert.ok(
      errors(bundle(RENDER(`1;`), `<div></div><script>alert(1)</script>`)).some((e) =>
        /<script>/.test(e.message)
      )
    )
  })

  it("refuses http URLs and system font stacks", () => {
    assert.ok(
      errors(bundle(RENDER(`1;`), `<img src="http://x.test/a.png">`)).some((e) => /https/.test(e.message))
    )
    assert.ok(
      errors(bundle(RENDER(`1;`), `<div></div>`, `#a{font-family: Arial}`)).some((e) =>
        /page default/.test(e.message)
      )
    )
  })

  it("enforces the type scale", () => {
    assert.ok(
      errors(bundle(RENDER(`1;`), `<div></div>`, `#a{font-size: 10px}`)).some((e) => /floor/.test(e.message))
    )
    assert.ok(
      errors(bundle(RENDER(`1;`), `<div></div>`, `#a{font-size: 400px}`)).some((e) =>
        /ceiling/.test(e.message)
      )
    )
  })

  it("warns on linear-only timing, stays quiet when eased", () => {
    const w = warns(bundle(RENDER(`ctx.el("a").style.opacity = ctx.interpolate(f, [0, 60], [0, 1]);`)))
    assert.ok(w.some((x) => /robotic/.test(x.message)), JSON.stringify(w))
    const quiet = warns(
      bundle(
        RENDER(
          `ctx.el("a").style.opacity = ctx.interpolate(f, [0, 60], [0, 1], { easing: ctx.Easing.easeOut });`
        )
      )
    )
    assert.ok(!quiet.some((x) => /robotic/.test(x.message)), JSON.stringify(quiet))
  })

  it("catches JS syntax errors with a clear message (not a preview SyntaxError)", () => {
    const broken = bundle(
      `function render(t, ctx) {\n  var f = ctx.frame;\n  ctx.el("a").style.opacity = ctx.interpolate(f, [0, 60], [0, 1];\n}`
    )
    const e = errors(broken)
    assert.ok(e.some((x) => /syntax/i.test(x.message)), JSON.stringify(e))
  })

  it("checkJsSyntax passes tricky-but-valid JS", () => {
    const ok = [
      `function render(t, ctx) { var re = /ab+c[xy]*\\d+\\/ef/g; return re.test("abbbcx1/ef"); }`,
      "function render(t, ctx) { var q = `a${`b${1 + (2 * 3)}c`}d`; var x = a / b / c; }",
      `function render(t, ctx) { // parens (unclosed [bracket {brace\n/* comment ( ] } */ var o = { a: [1, (2)] }; }`,
      `function render(t, ctx) { var s = "don't stop"; var d = "a)b]c}"; }`,
      `function render(t, ctx) { if (a < b && c > d) { x--; } }`,
    ]
    for (const js of ok) {
      assert.equal(checkJsSyntax(js), null, `false positive: ${checkJsSyntax(js)} :: ${js.slice(0, 80)}`)
    }
  })

  it("checkJsSyntax names the line of real breakage", () => {
    assert.match(checkJsSyntax(`var a = 1;\nvar b = (2 + 3;\nvar c = 4;`) ?? "", /line 2/)
    assert.match(checkJsSyntax(`var s = "oops;\nvar b = 1;`) ?? "", /unterminated string/)
    assert.match(checkJsSyntax(`var a = 1; }`) ?? "", /unexpected/)
    assert.match(checkJsSyntax(`function r() {\n var x = 1;`) ?? "", /unclosed/)
    assert.equal(checkJsSyntax(`function render(t, ctx) { return 1; }`), null)
  })

  it("warns (not errors) on <!-- sequences in JS", () => {
    const code = bundle(RENDER(`// <!-- divider -->\nctx.el("a").style.opacity = 1;`))
    assert.equal(errors(code).length, 0, JSON.stringify(errors(code)))
    assert.ok(warns(code).some((x) => /<!--/.test(x.message)))
  })

  it("warns on opacity-only motion and stagger-less lists", () => {
    const w = warns(
      bundle(RENDER(`ctx.el("a").style.opacity = ctx.interpolate(f, [0, 60], [0, 1], { easing: ctx.Easing.easeOut });`))
    )
    assert.ok(w.some((x) => /opacity only/.test(x.message)), JSON.stringify(w))
    const w2 = warns(
      bundle(
        `function render(t, ctx) { var f = ctx.frame; var items = ctx.qa(".x"); for (var i = 0; i < items.length; i++) { items[i].style.opacity = ctx.interpolate(f, [0, 60], [0, 1], { easing: ctx.Easing.easeOut }); } }`
      )
    )
    assert.ok(w2.some((x) => /stagger/.test(x.message)), JSON.stringify(w2))
  })
})

describe("Golden starters", () => {
  for (const mood of ["cinematic", "energetic", "playful", "minimal", "elegant", "tech", "romantic"]) {
    it(`golden (${mood}) validates with zero errors`, () => {
      const g = goldenStarter({ product: "Acme", headline: "Motion that lands", mood, seconds: 5 })
      const e = errors(g.code)
      assert.equal(e.length, 0, `${mood}: ${e.map((x) => x.message).join(" | ")}`)
      const p = parseBundle(g.code)
      assert.ok(p.ok && p.bundle)
      assert.match(p.bundle!.js, /function render\(t, ctx\)/)
      assert.match(p.bundle!.js, /function init\(ctx\)/)
      const plan = preValidatePlan(g.plan.beats)
      assert.equal(plan.ok, true, JSON.stringify(plan.issues))
    })
  }

  it("every golden js part parses exactly like the driver evaluates it", () => {
    const moods = ["cinematic", "energetic", "playful", "minimal", "elegant", "tech", "romantic"]
    for (const mood of moods) {
      const g = goldenStarter({ product: "Acme", headline: "Motion that lands", mood, seconds: 5 })
      const p = parseBundle(g.code)
      assert.ok(p.ok && p.bundle, mood)
      // Mirror of the iframe driver: new Function("WM", js + return-shim).
      const factory = new Function(
        "WM",
        `${p.bundle!.js}\nreturn { render: (typeof render !== "undefined" ? render : undefined) };`
      )
      const api = factory({}) as { render?: unknown }
      assert.equal(typeof api.render, "function", `${mood}: no render()`)
    }
  })

  it("minimal fallback starter validates with zero errors", () => {
    const m = minimalStarter({ product: "Acme", headline: "Hello", seconds: 5 })
    assert.equal(errors(m.code).length, 0)
    const p = parseBundle(m.code)
    assert.ok(p.ok && p.bundle)
    new Function("WM", `${p.bundle!.js}\nreturn {};`)
  })

  it("code and overlay briefs pick their starter", () => {
    const code = goldenStarter({ product: "ShipIt", headline: "npm install shipit", mood: "tech" })
    assert.match(code.plan.title, /terminal/)
    const lower = goldenStarter({ product: "Jane Doe", headline: "Keynote speaker", mood: "minimal" })
    assert.ok(/lower third|overlay/i.test(lower.plan.title + lower.plan.intent), lower.plan.title)
  })
})

describe("Inline repair", () => {
  it("repairs random, fonts, naked easing, and frame binding in one pass", () => {
    const dirty = bundle(
      `function render(t, ctx) {\n  var x = Math.random();\n  ctx.el("a").style.opacity = ctx.interpolate(f, [0, 60], [0, 1]);\n}`,
      `<div id="a"></div>`,
      `#a{font-family: Arial}`
    )
    const fixed = autoRepairBundle(parseBundle(dirty).bundle!)
    assert.ok(fixed.applied.some((a) => /ctx\.rand/.test(a)), JSON.stringify(fixed.applied))
    assert.ok(fixed.applied.some((a) => /Unbounded/.test(a)), JSON.stringify(fixed.applied))
    assert.ok(fixed.applied.some((a) => /easeOut/.test(a)), JSON.stringify(fixed.applied))
    assert.ok(fixed.applied.some((a) => /frame binding/.test(a)), JSON.stringify(fixed.applied))
    assert.equal(errors(serializeBundle(fixed.bundle)).length, 0)
  })

  it("autoRepairInline accepts a serialized bundle", () => {
    const dirty = bundle(`function render(t, ctx) { var f = ctx.frame; var x = Math.random(); }`)
    const fixed = autoRepairInline(dirty)
    assert.ok(fixed.applied.length > 0)
    assert.ok(parseBundle(fixed.code).ok)
  })
})

describe("Snippets speak bundle dialect", () => {
  it("presetSnippet uses ctx.* and no extrapolate options", () => {
    for (const beat of ["entrance", "reveal", "cascade", "anticipation", "parallax", "counter-motion", "hold"]) {
      const { id } = presetForBeat(beat)
      const s = presetSnippet(id, 30)
      assert.ok(/ctx\.interpolate|ctx\.spring/.test(s), `${beat}: no ctx helpers`)
      assert.ok(!/extrapolate/.test(s), `${beat}: stale extrapolate option`)
      assert.ok(!/from "remotion"|useCurrentFrame/.test(s), `${beat}: stale remotion`)
    }
  })

  it("textAnimationSnippet is DOM + render guidance", () => {
    const s = textAnimationSnippet("charByChar", "Hello", 15)
    assert.ok(/render\(\)/.test(s))
    assert.ok(!/<span key=/.test(s), "no JSX in snippets")
  })

  it("spring presets and cascade helpers intact", () => {
    assert.ok(SpringPresets.snappy.damping === 18)
    assert.equal(cascadeSpring(3, 10).length, 3)
    assert.ok(MotionPatterns.productReveal.length > 0)
  })
})

describe("Gates and hints", () => {
  it("gateVerification blocks on errors, passes clean", () => {
    const bad = gateVerification([{ level: "error", message: "x" }], null)
    assert.equal(bad.ok, false)
    const good = gateVerification([{ level: "warn", message: "y" }], null)
    assert.equal(good.ok, true)
    assert.deepEqual(good.advisory, ["y"])
  })

  it("browserFixHint names the bundle part", () => {
    assert.match(browserFixHint("Bundle JS must define function render"), /part js/)
    assert.match(browserFixHint("runtime: cannot read properties"), /part/)
  })

  it("suggestCloseMatch finds near lines", () => {
    const s = suggestCloseMatch("line one\nhero title here\nline three", "hero title")
    assert.ok(s.length > 0 && s[0]!.line === 2)
  })
})

describe("Unchanged contracts", () => {
  it("layout engine still auto-layouts", () => {
    const eng = new LayoutEngine()
    const plan = eng.autoLayout(
      [{ id: "hero", type: "text", width: 900, height: 160 }],
      "hierarchy"
    )
    assert.ok(plan.elements.length === 1)
  })

  it("type scale helpers intact", () => {
    assert.deepEqual(TYPE_SCALE.hero, [130, 200])
    assert.ok(TypographyPresets.heroLockup.headline.size === 140)
    assert.ok(adaptiveTextSize("Hi", "hero") >= adaptiveTextSize("A very long headline indeed, over sixty characters long yes", "hero"))
  })
})

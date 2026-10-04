/**
 * End-to-end agent simulation: drives the REAL tool implementations through
 * scripted turns the way the model would call them, and tracks everything —
 * which tools ran, what each returned, issues caught, warnings, failures, and
 * motion-quality scores. A live-model chat needs a gateway key and budget; this
 * harness covers every deterministic link in the chain with zero model calls.
 *
 * Run: compile with tsc to CommonJS, then `node --test` on the output.
 * The console report is the deliverable — rows per scenario plus a ledger of
 * every non-ok tool result. Assertions fail the suite on regressions.
 */
import { describe, it } from "node:test"
import * as assert from "node:assert/strict"
import { buildTools } from "../tools"
import type { CompositionStore } from "../store"
import type { Chat } from "../../chat"

/** In-memory stand-in for the DO-backed CompositionStore. */
class FakeStore {
  code = ""
  plan: { title: string; intent: string; beats: Array<{ from: number; to: number; what: string }>; ending: string } | null = null
  version = 0
  bb = new Map<string, string>()
  current() {
    return { code: this.code, plan: this.plan, version: this.version }
  }
  write(code: string, opts: { bumpVersion: boolean; plan?: FakeStore["plan"] }): number {
    this.code = code
    if (opts.plan !== undefined) this.plan = opts.plan
    if (opts.bumpVersion) this.version += 1
    return this.version
  }
  setPlan(plan: NonNullable<FakeStore["plan"]>): void {
    this.plan = plan
  }
  versions() {
    return this.version > 0
      ? [{ n: this.version, code: this.code, createdAt: Date.now(), plan: this.plan ?? undefined }]
      : []
  }
  restore(n: number): string | null {
    return n === this.version ? this.code : null
  }
  blackboardWrite(key: string, value: string): void {
    this.bb.set(key, value)
  }
  blackboardRead(key: string): string | null {
    return this.bb.get(key) ?? null
  }
  blackboardList() {
    return [...this.bb.keys()].map((key) => ({ key, updatedAt: Date.now() }))
  }
  blackboardClear(): void {
    this.bb.clear()
  }
  trackEvent(): void {}
  recordTurn(): void {}
  recordRating(): void {}
  tagVersion(): void {}
  tags() {
    return []
  }
  commentAdd(): string {
    return "c-1"
  }
  comments() {
    return []
  }
}

type ToolFn = (args: Record<string, unknown>) => Promise<unknown>

interface CallRow {
  scenario: string
  tool: string
  ms: number
  ok: boolean | null
  errors: number
  warnings: number
  note: string
}

const LEDGER: CallRow[] = []

function toolsFor(store: FakeStore, audit: Record<string, unknown> | null) {
  const agent = { state: { audit } } as unknown as Chat
  const set = buildTools(store as unknown as CompositionStore, agent) as unknown as Record<
    string,
    { execute: ToolFn }
  >
  return async (scenario: string, tool: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
    const t0 = Date.now()
    const out = (await set[tool]!.execute(args)) as Record<string, unknown>
    const ms = Date.now() - t0
    const errs = Array.isArray(out.errors) ? out.errors.length : 0
    const warns = Array.isArray(out.warnings)
      ? out.warnings.length
      : Array.isArray(out.advisory)
        ? (out.advisory as unknown[]).length
        : 0
    const ok = typeof out.ok === "boolean" ? (out.ok as boolean) : out.status === "verified" ? true : null
    const note =
      (out.status as string) ??
      (typeof out.error === "string" ? (out.error as string).slice(0, 90) : "") ??
      ""
    LEDGER.push({ scenario, tool, ms, ok, errors: errs, warnings: warns, note })
    return out
  }
}

const GOOD_WRITE = {
  html: `<div class="hero" id="hero"><span>Fast</span><span>Alive</span><span>Clean</span></div><div class="sub" id="sub">Settles with spring</div>`,
  css: `.hero{position:absolute;left:50%;top:40%;font-family:'Unbounded',sans-serif;font-size:64px;color:#F2F3F7}\n.hero span{display:inline-block;margin-right:12px}\n.sub{position:absolute;left:50%;top:60%;font-family:'Manrope',sans-serif;font-size:32px;color:#F2F3F7}`,
  js: `function render(t, ctx) {
  var f = ctx.frame;
  var enter = ctx.spring(t, { damping: 18, mass: 0.8, stiffness: 120 });
  var spans = ctx.el("hero").children;
  for (var i = 0; i < spans.length; i++) {
    var d = 20 + i * 4;
    spans[i].style.opacity = ctx.interpolate(f, [d, d + 20], [0, 1], { easing: ctx.Easing.easeOut });
    spans[i].style.translate = "0 " + ctx.interpolate(f, [d, d + 18], [22, 0], { easing: ctx.Easing.easeOut }) + "px";
  }
  ctx.el("sub").style.opacity = Math.max(0, Math.min(1, enter));
}`,
  title: "Good cut",
}

const BAD_WRITE = {
  html: `<div id="a">Hello</div>`,
  css: `#a{font-family: Arial; font-size: 64px}`,
  js: `function render(t, ctx) {
  var f = ctx.frame;
  var x = Math.random();
  ctx.el("a").style.opacity = ctx.interpolate(f, [0, 60], [0, x]);
}`,
  title: "Bad cut",
}

const CHEAP_WRITE = {
  html: `<div id="a">Hello</div>`,
  css: `#a{font-family:'Unbounded',sans-serif;font-size:120px;color:#fff}`,
  js: `function render(t, ctx) {
  var f = ctx.frame;
  ctx.el("a").style.opacity = ctx.interpolate(f, [0, 90], [0, 1], { easing: ctx.Easing.easeOut });
}`,
  title: "Cheap fade",
}

function printReport() {
  console.log("\n==== AGENT SIMULATION REPORT ====")
  console.log("scenario | tool | ms | ok | errors | warns | note")
  for (const r of LEDGER) {
    const ok = r.ok === null ? "-" : r.ok ? "ok" : "FAIL"
    console.log(`${r.scenario} | ${r.tool} | ${r.ms}ms | ${ok} | ${r.errors} | ${r.warnings} | ${r.note}`)
  }
  const fails = LEDGER.filter((r) => r.ok === false)
  console.log(`\ntools called: ${LEDGER.length}, failures: ${fails.length}`)
  for (const f of fails) console.log(`  FAIL [${f.scenario}] ${f.tool}: ${f.note}`)
  const caught = LEDGER.reduce((n, r) => n + r.errors, 0)
  console.log(`issues surfaced by validator across all turns: ${caught}`)
  console.log("================================\n")
}

describe("Agent simulation — scripted turns through real tools", () => {
  it("S1 fast path (product): quick_start → verify → preview → verified report", async () => {
    const store = new FakeStore()
    const call = toolsFor(store, null)
    const q = await call("S1", "quick_start", { product: "Acme", headline: "Motion that lands" })
    assert.equal(q.ok, true, `quick_start failed: ${JSON.stringify(q.errors ?? q.error)}`)
    const v = await call("S1", "verify_no_errors")
    assert.equal(v.ok, true, `gate blocked a golden: ${JSON.stringify(v)}`)
    const p = await call("S1", "preview_composition")
    assert.equal(p.ok, true)
    // Browser mounted the cut — the only render truth.
    const call2 = toolsFor(store, { version: 1, ok: true, phase: "mount", findings: [], at: Date.now() })
    const r = await call2("S1", "read_render_report")
    assert.equal((r as { status: string }).status, "verified")
    const d = await call("S1", "design_analyze")
    assert.ok(((d as { score: number }).score ?? 0) >= 90, `golden score too low: ${JSON.stringify(d)}`)
  })

  it("S2 golden verifies clean with brand-only context", async () => {
    const store = new FakeStore()
    const call = toolsFor(store, null)
    const q = await call("S2", "quick_start", { brand: "Acme" })
    assert.equal(q.ok, true, `golden failed: ${JSON.stringify(q.errors ?? q.error)}`)
    const v = await call("S2", "verify_no_errors")
    assert.equal(v.ok, true, `golden blocked: ${JSON.stringify(v)}`)
  })

  it("S4 browser failure blocks preview, names the fix, auto-fix recovers", async () => {
    const store = new FakeStore()
    const call = toolsFor(store, null)
    await call("S4", "quick_start", { product: "Acme" })
    // v1 shipped wall-clock randomness: inline repair would normally fix it
    // at write, so force the broken row the way a pre-validator turn would
    // have stored it — then prove the gate + auto-fix recovery path.
    const forced = JSON.stringify({
      version: 1,
      html: BAD_WRITE.html,
      css: BAD_WRITE.css,
      js: BAD_WRITE.js,
      meta: { title: "v1", duration: 5, fps: 30, width: 1920, height: 1080 },
    })
    store.code = forced
    const failed = { version: store.current().version, ok: false, phase: "runtime", message: "runtime: x is not defined", findings: [], at: Date.now() }
    const callF = toolsFor(store, failed)
    const v = await callF("S4", "verify_no_errors")
    assert.equal(v.ok, false, "gate must block on a failed sandbox report")
    const r = await callF("S4", "read_render_report")
    assert.equal((r as { status: string }).status, "failed")
    assert.ok((r as { fixHint: string }).fixHint, "failed report must carry a fixHint")
    // The exact recovery path: browser message → auto_fix → gate passes on the new version.
    const f = (await callF("S4", "auto_fix_code", { errors: ["runtime: x is not defined"] })) as {
      ok: boolean
      applied: Array<{ issue: string }>
    }
    assert.equal(f.ok, true, `auto-fix failed: ${JSON.stringify(f)}`)
    assert.ok(f.applied.some((a) => /random|font|easing/i.test(a.issue)), `no mechanical fix applied: ${JSON.stringify(f)}`)
    const v2 = await callF("S4", "verify_no_errors")
    assert.equal(v2.ok, true, `fixed version still blocked: ${JSON.stringify(v2)}`)
    await callF("S4", "preview_composition")
  })

  it("S5 full path: creative_direct → layout → plan → write good bundle → preview", async () => {
    const store = new FakeStore()
    const call = toolsFor(store, null)
    const cd = await call("S5", "creative_direct", { brief: "Energetic 5s product reveal for Acme with staggered headline words" })
    const cdr = cd as { palette: unknown; fonts: unknown; beats: Array<{ beat: string }> }
    assert.ok(cdr.palette && cdr.fonts && cdr.beats.length >= 5, `thin direction: ${JSON.stringify(cd).slice(0, 200)}`)
    assert.ok(cdr.beats.some((b) => /cascade|settle|idle/.test(b.beat)), "direction must name aliveness beats")
    await call("S5", "layout_plan", {
      elements: [
        { id: "hero", type: "text", approximate_size: { width: 900, height: 160 }, role: "hero" },
        { id: "sub", type: "text", approximate_size: { width: 700, height: 60 }, role: "body" },
      ],
      strategy: "hierarchy",
    })
    const pm = await call("S5", "plan_motion", {
      title: "Acme reveal",
      intent: "Punchy staggered headline with spring settle",
      beats: [
        { from: 0, to: 12, what: "anticipation compress scale 1→0.94, easeIn" },
        { from: 12, to: 72, what: "headline cascade per-word spring stagger 4f" },
        { from: 72, to: 150, what: "settle + idle breathing, hold resolve" },
      ],
      ending: "Headline resolved, badge held.",
    })
    assert.equal(pm.ok, true)
    const w = await call("S5", "write_composition", GOOD_WRITE)
    assert.equal(w.ok, true, `good bundle rejected: ${JSON.stringify(w)}`)
    const v = await call("S5", "verify_no_errors")
    assert.equal(v.ok, true, `good bundle blocked: ${JSON.stringify(v)}`)
    await call("S5", "preview_composition")
  })

  it("S6 bad model bundle is repaired inline — zero round-trips, zero errors left", async () => {
    const store = new FakeStore()
    const call = toolsFor(store, null)
    const w = await call("S6", "write_composition", BAD_WRITE)
    // Inline repair fixes random + font + easing; the write lands.
    assert.equal(w.ok, true, `bad bundle should be repaired inline: ${JSON.stringify(w)}`)
    const repaired = (w as { autoRepaired: string[] }).autoRepaired ?? []
    assert.ok(repaired.length >= 2, `expected 2+ inline repairs, got ${JSON.stringify(repaired)}`)
    const v = await call("S6", "verify_no_errors")
    assert.equal(v.ok, true, `repaired bundle blocked: ${JSON.stringify(v)}`)
  })

  it("S7 edit path: retitle without rewrite, still clean", async () => {
    const store = new FakeStore()
    const call = toolsFor(store, null)
    await call("S7", "quick_start", { product: "Acme", headline: "Motion that lands" })
    const e = await call("S7", "edit_file", {
      ops: [{ part: "js", find: "Motion that lands", replace: "Motion that truly lands" }],
    })
    assert.equal(e.ok, true, `edit failed: ${JSON.stringify(e)}`)
    assert.ok(store.current().code.includes("truly"), "edit did not apply")
    const v = await call("S7", "verify_no_errors")
    assert.equal(v.ok, true)
  })

  it("S8 golden motion outscores a cheap fade by 15+ points", async () => {
    const store = new FakeStore()
    const call = toolsFor(store, null)
    await call("S8", "quick_start", { product: "Acme" })
    const gold = (await call("S8", "design_analyze")) as { score: number }
    const w = await call("S8", "write_composition", CHEAP_WRITE)
    assert.equal(w.ok, true, `cheap fade refused: ${JSON.stringify(w)}`)
    const cheap = (await call("S8", "design_analyze")) as { score: number; findings: string[] }
    assert.ok(gold.score - cheap.score >= 15, `gold ${gold.score} vs cheap ${cheap.score}`)
    assert.ok(cheap.findings.join(" ").length > 20, "cheap fade must produce actionable findings")
  })

  it("S9 placement: the golden carries no overlap/overflow/safe-margin findings", async () => {
    const store = new FakeStore()
    const call = toolsFor(store, null)
    await call("S9", "quick_start", { product: "Acme" })
    const v = (await call("S9", "validate_composition")) as { warnings: string[] }
    const placement = v.warnings.filter((m) => /share the spot|outside|overlap|cropped|safe margin|off-canvas/i.test(m))
    assert.equal(placement.length, 0, `placement warnings: ${placement.join(" | ")}`)
  })

  it("prints the tracked report", () => {
    printReport()
    const fails = LEDGER.filter((r) => r.ok === false)
    // S4's blocked gate + refused write are the only expected non-oks.
    assert.ok(
      fails.every((f) => f.scenario === "S4" && (f.tool === "verify_no_errors" || f.tool === "write_composition")),
      `unexpected tool failures: ${fails.map((f) => `${f.scenario}/${f.tool}`).join(", ")}`
    )
  })
})

/**
 * End-to-end agent simulation: drives the REAL tool implementations through
 * scripted turns the way the model would call them, and tracks everything —
 * which tools ran, what each returned, issues caught, warnings, failures, and
 * motion-quality scores. A live-model chat needs a gateway key and budget; this
 * harness covers every deterministic link in the chain (the links where all
 * observed breakage has lived) with zero model calls.
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

const GOOD_CUT = `import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion"
import * as Lucide from "lucide-react"
export default function GoodCut() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = spring({ frame, fps, config: { damping: 18, mass: 0.8, stiffness: 120 } })
  const items = ["Fast", "Alive", "Clean"]
  return (
    <AbsoluteFill style={{ backgroundColor: "#0B0C10", fontFamily: Fonts.unbounded.family, alignItems: "center", justifyContent: "center" }}>
      <Lucide.Sparkles size={48} color="#FFB340" />
      <div style={{ display: "flex", gap: 12 }}>
        {items.map((w, i) => {
          const d = 20 + i * 4
          const o = interpolate(frame, [d, d + 20], [0, 1], { easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" })
          const y = interpolate(frame, [d, d + 18], [22, 0], { easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" })
          return <span key={i} style={{ opacity: o, translate: "0 " + y + "px", fontSize: 64, color: "#F2F3F7" }}>{w}</span>
        })}
      </div>
      <div style={{ opacity: enter, fontSize: 32, fontFamily: Fonts.manrope.family, color: "#F2F3F7" }}>Settles with spring</div>
    </AbsoluteFill>
  )
}
`

const BAD_CUT = `import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion"
import { Zap } from "lucide-react"
export default function BadCut() {
  const frame = useCurrentFrame()
  const x = Math.random()
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily: "Arial" }}>
      <Zap />
      <div style={{ opacity: interpolate(frame, [0, 60], [0, 1]) }}>Hello {x}</div>
    </AbsoluteFill>
  )
}
`

const CHEAP_FADE = `import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from "remotion"
export default function CheapFade() {
  const frame = useCurrentFrame()
  const o = interpolate(frame, [0, 90], [0, 1], { easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily: Fonts.unbounded.family, alignItems: "center", justifyContent: "center" }}>
      <div style={{ opacity: o, fontSize: 120, color: "#fff" }}>Hello</div>
    </AbsoluteFill>
  )
}
`

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
    const q = await call("S1", "quick_start", { template: "product-reveal", product: "Acme", headline: "Motion that lands" })
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

  it("S2+S3 fast path goldens verify clean (logo, quote)", async () => {
    for (const [s, t] of [["S2", "logo-animation"], ["S3", "quote-card"]] as const) {
      const store = new FakeStore()
      const call = toolsFor(store, null)
      const q = await call(s, "quick_start", { template: t, brand: "Acme" })
      assert.equal(q.ok, true, `${t}: ${JSON.stringify(q.errors ?? q.error)}`)
      const v = await call(s, "verify_no_errors")
      assert.equal(v.ok, true, `${t} blocked: ${JSON.stringify(v)}`)
    }
  })

  it("S4 browser failure blocks preview, names the fix, auto-fix recovers", async () => {
    const store = new FakeStore()
    const call = toolsFor(store, null)
    await call("S4", "quick_start", { template: "product-reveal", product: "Acme" })
    // v1 shipped with a named lucide import: compiles, throws at mount.
    store.code = `import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from "remotion"
import { Zap } from "lucide-react"
export default function NamedCut() {
  const frame = useCurrentFrame()
  const o = interpolate(frame, [0, 30], [0, 1], { easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  return <AbsoluteFill style={{ backgroundColor: "#000" }}><Zap size={40} color="#fff" /><div style={{ opacity: o, fontSize: 64, color: "#fff" }}>Hi</div></AbsoluteFill>
}
`
    const failed = { version: 1, ok: false, phase: "runtime", message: '"Zap" is not available (line 8)', findings: [], at: Date.now() }
    const callF = toolsFor(store, failed)
    const v = await callF("S4", "verify_no_errors")
    assert.equal(v.ok, false, "gate must block on a failed player report")
    const r = await callF("S4", "read_render_report")
    assert.equal((r as { status: string }).status, "failed")
    assert.ok((r as { fixHint: string }).fixHint, "failed report must carry a fixHint")
    // The exact recovery path: browser message → auto_fix → gate passes on the new version.
    const f = (await callF("S4", "auto_fix_code", { errors: ['"Zap" is not available (line 8)'] })) as {
      ok: boolean
      applied: Array<{ issue: string }>
    }
    assert.equal(f.ok, true, `auto-fix failed: ${JSON.stringify(f)}`)
    assert.ok(f.applied.some((a) => /lucide|Lucide/i.test(a.issue)), "must convert to the Lucide namespace")
    const v2 = await callF("S4", "verify_no_errors")
    assert.equal(v2.ok, true, `fixed version still blocked: ${JSON.stringify(v2)}`)
    await callF("S4", "preview_composition")
  })

  it("S5 full path: creative_direct → layout → plan → write good code → preview", async () => {
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
        { from: 0, to: 12, what: "anticipation compress scale 1→0.94, Easing.bezier(0.4,0,1,1)" },
        { from: 12, to: 72, what: "headline cascade per-word spring stagger 4f" },
        { from: 72, to: 150, what: "settle + idle breathing, hold resolve" },
      ],
      ending: "Headline resolved, badge held.",
    })
    assert.equal(pm.ok, true)
    const w = await call("S5", "write_composition", { code: GOOD_CUT })
    assert.equal(w.ok, true, `good code rejected: ${JSON.stringify(w)}`)
    const v = await call("S5", "verify_no_errors")
    assert.equal(v.ok, true, `good code blocked: ${JSON.stringify(v)}`)
    await call("S5", "preview_composition")
  })

  it("S6 bad model code is repaired inline — zero round-trips, zero errors left", async () => {
    const store = new FakeStore()
    const call = toolsFor(store, null)
    const w = await call("S6", "write_composition", { code: BAD_CUT })
    // Inline repair fixes lucide + random + easing + font; the write lands.
    assert.equal(w.ok, true, `bad code should be repaired inline: ${JSON.stringify(w)}`)
    const repaired = (w as { autoRepaired: string[] }).autoRepaired ?? []
    assert.ok(repaired.length >= 3, `expected 3+ inline repairs, got ${JSON.stringify(repaired)}`)
    const v = await call("S6", "verify_no_errors")
    assert.equal(v.ok, true, `repaired code blocked: ${JSON.stringify(v)}`)
  })

  it("S7 edit path: retitle without rewrite, still clean", async () => {
    const store = new FakeStore()
    const call = toolsFor(store, null)
    await call("S7", "quick_start", { template: "product-reveal", product: "Acme" })
    const e = await call("S7", "edit_file", { ops: [{ find: "Acme", replace: "Nova" }] })
    assert.equal(e.ok, true, `edit failed: ${JSON.stringify(e)}`)
    assert.ok(store.current().code.includes("Nova"), "edit did not apply")
    const v = await call("S7", "verify_no_errors")
    assert.equal(v.ok, true)
  })

  it("S8 golden motion outscores a cheap fade by 15+ points", async () => {
    const store = new FakeStore()
    const call = toolsFor(store, null)
    await call("S8", "quick_start", { template: "product-reveal", product: "Acme" })
    const gold = (await call("S8", "design_analyze")) as { score: number }
    store.code = CHEAP_FADE
    const cheap = (await call("S8", "design_analyze")) as { score: number; findings: string[] }
    assert.ok(gold.score - cheap.score >= 15, `gold ${gold.score} vs cheap ${cheap.score}`)
    assert.ok(cheap.findings.join(" ").length > 20, "cheap fade must produce actionable findings")
  })

  it("S9 placement: goldens carry no overlap/overflow/safe-margin findings", async () => {
    const store = new FakeStore()
    const call = toolsFor(store, null)
    for (const t of ["product-reveal", "logo-animation", "quote-card"]) {
      await call("S9", "quick_start", { template: t })
      const v = (await call("S9", "validate_composition")) as { warnings: string[] }
      const placement = v.warnings.filter((m) => /share the spot|outside|overlap|cropped|safe margin|off-canvas/i.test(m))
      assert.equal(placement.length, 0, `${t} placement warnings: ${placement.join(" | ")}`)
    }
  })

  it("prints the tracked report", () => {
    printReport()
    const fails = LEDGER.filter((r) => r.ok === false)
    // S4's blocked gate is the only expected non-ok: it proves the gate works.
    assert.ok(
      fails.every((f) => f.scenario === "S4" && f.tool === "verify_no_errors"),
      `unexpected tool failures: ${fails.map((f) => `${f.scenario}/${f.tool}`).join(", ")}`
    )
  })
})

import { useMemo, useState } from "react"
import type { UIMessage } from "ai"
import type { MotionPlan } from "~/lib/composition"
import { suggest } from "~/components/Timeline"
import { openExport } from "~/lib/exportPresets"
import { agentUrl } from "~/lib/composition"

/**
 * Phase 1: real-time feedback (IMPLEMENTATION_PLAN.md §4.4) +
 * Phase 2: satisfaction capture (§8.3).
 *
 * - Live quality bars computed from the actual source (same heuristics as
 *   review_motion, so the panel and the agent agree).
 * - Multi-agent progress checklist derived from real tool activity in the
 *   transcript — no fake stages, only tools that actually ran.
 * - Pre-export check: deterministic warnings with one-click agent fixes.
 * - ★ rating posts to the DO (off-transcript) for the feedback loop.
 */

interface Props {
  code: string
  plan: MotionPlan | null
  version: number
  busy: boolean
  messages: UIMessage[]
  sessionId: string
}

function Bar({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 font-mono text-[10px] text-dim">{label}</span>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-panel-2">
        <div
          className="h-full rounded-full bg-tungsten transition-all"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right font-mono text-[10px] text-muted tabular-nums">
        {Math.round(pct)}%
      </span>
    </div>
  )
}

function toolNames(messages: UIMessage[]): Set<string> {
  const out = new Set<string>()
  for (const m of messages) {
    for (const p of (m.parts ?? []) as Array<Record<string, unknown>>) {
      const t = p.type
      if (typeof t === "string" && t.startsWith("tool-")) {
        out.add(t.replace(/^tool-/, ""))
        const n = p.toolName
        if (typeof n === "string") out.add(n)
      }
    }
  }
  return out
}

export function ProgressView({ code, plan, version, busy, messages, sessionId }: Props) {
  const [showCheck, setShowCheck] = useState(false)
  const [stars, setStars] = useState(0)
  const [rated, setRated] = useState(false)

  const q = useMemo(() => {
    if (!code.trim()) return { motion: 0, perf: 0, a11y: 0 }
    let motion = 70
    if (/\bspring\(/.test(code)) motion += 12
    if (/Easing\./.test(code)) motion += 8
    if (/translate[XY]|scale|rotate/i.test(code)) motion += 6
    if (/delay|stagger|index\s*\*/i.test(code)) motion += 4
    const heavy = (code.match(/Noise|motion-blur|displacement/gi) ?? []).length
    return {
      motion: Math.min(100, motion),
      perf: Math.max(40, 100 - heavy * 12),
      a11y: /prefers-reduced-motion/i.test(code) ? 95 : 85,
    }
  }, [code])

  const tools = useMemo(() => toolNames(messages), [messages])
  const stages = useMemo(
    () => [
      { label: "Prefetching (intent, skills, assets)", done: tools.has("prefetch_tools") || tools.has("execute_batch") },
      { label: "Analyzing intent", done: tools.has("intent_deep_analyze") || tools.has("plan_motion") || tools.has("pre_validate_plan") },
      { label: "Planning motion", done: tools.has("plan_motion") },
      { label: "Sourcing assets", done: tools.has("asset_search") || tools.has("font_suggest") },
      { label: "Writing code", done: tools.has("write_composition") || tools.has("edit_file") },
      { label: "Validating", done: tools.has("validate_composition") },
      { label: "Reviewing", done: tools.has("review_motion") || tools.has("design_analyze") },
      { label: "Previewing", done: tools.has("preview_composition") },
    ],
    [tools]
  )

  const issues = useMemo(() => {
    const out: Array<{ text: string; fix: string }> = []
    if (!code.trim()) return out
    if (/<(Audio|Video|OffthreadVideo)\b/.test(code) && plan) {
      const last = plan.beats.at(-1)
      if (last) out.push({ text: "Audio/video element present — confirm it ends with the cut", fix: "Trim audio to the cut length with a 15-frame fade-out at the end" })
    }
    const imgs = [...code.matchAll(/https?:\/\/[^\s"'`]+/g)].map((m) => m[0])
    if (imgs.some((u) => u.includes("w=640") || u.includes("w=800"))) {
      out.push({ text: "Low-resolution remote image for a 1080p canvas", fix: "Replace remote images with 1920px-wide versions or vector art" })
    }
    if (!/fade|opacity.*0/.test(code) && /Audio/.test(code)) {
      out.push({ text: "No audio fade-out detected", fix: "Add an audio fade-out over the last 15 frames" })
    }
    return out
  }, [code, plan])

  async function rate(n: number) {
    setStars(n)
    try {
      await fetch(agentUrl(sessionId, "rating"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, stars: n }),
      })
      setRated(true)
    } catch {
      // Rating is advisory — never block the cut on it.
      setRated(true)
    }
  }

  return (
    <div className="panel min-w-0 flex-1 px-3 py-2.5" aria-label="Progress">
      <p className="eyebrow mb-2">{busy ? "working" : "quality"}</p>
      <div className="space-y-1.5">
        <Bar label="motion" pct={q.motion} />
        <Bar label="performance" pct={q.perf} />
        <Bar label="accessibility" pct={q.a11y} />
      </div>

      {busy && (
        <ul className="mt-2 space-y-0.5">
          {stages.map((s) => (
            <li key={s.label} className="flex items-center gap-1.5 font-mono text-[10.5px] text-muted">
              <span className={s.done ? "text-ok" : "text-dim"}>{s.done ? "✓" : "⏳"}</span>
              {s.label}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setShowCheck((v) => !v)}
          className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted transition-colors hover:border-tungsten hover:text-tungsten"
        >
          pre-export check{issues.length > 0 ? ` (${issues.length})` : ""}
        </button>
        <div className="ml-auto flex items-center gap-1" aria-label="Rate this cut">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => void rate(n)}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              className={`text-[13px] transition-colors ${n <= stars ? "text-tungsten" : "text-dim hover:text-tungsten"}`}
            >
              ★
            </button>
          ))}
          {rated && <span className="font-mono text-[10px] text-dim">thanks</span>}
        </div>
      </div>

      {showCheck && (
        <div className="mt-2 rounded-sm border border-line-soft bg-panel-2/60 p-2">
          {issues.length === 0 ? (
            <p className="text-[11.5px] text-muted">✓ No export blockers found.</p>
          ) : (
            <ul className="space-y-1.5">
              {issues.map((i) => (
                <li key={i.text} className="text-[11.5px] text-muted">
                  <span className="text-tungsten">⚠</span> {i.text}
                  <button
                    type="button"
                    onClick={() => suggest(i.fix)}
                    className="ml-2 rounded border border-line px-1 py-px font-mono text-[10px] hover:border-tungsten hover:text-tungsten"
                  >
                    fix
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => {
              setShowCheck(false)
              openExport()
            }}
            className="mt-2 rounded bg-tungsten px-2 py-1 text-[11px] font-medium text-ink"
          >
            Export anyway
          </button>
        </div>
      )}
    </div>
  )
}

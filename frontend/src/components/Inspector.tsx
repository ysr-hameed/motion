import { useEffect, useState } from "react"
import type { MotionPlan } from "~/lib/composition"
import { SELECT_EVENT, suggest } from "~/components/Timeline"
import { openExport } from "~/lib/exportPresets"

/**
 * Phase 1: context-aware side panel (IMPLEMENTATION_PLAN.md §4.3).
 * Three states: beat selected → beat actions; text-like beat → text
 * animation options; nothing selected → composition summary + auto-improve.
 * Every button suggests an edit to the agent; nothing writes code directly.
 */

interface Props {
  plan: MotionPlan | null
  code: string
  version: number
}

function score(code: string): { motion: number; perf: number; a11y: number; lines: string[] } {
  if (!code.trim()) return { motion: 0, perf: 0, a11y: 0, lines: ["No cut yet — describe the clip to begin."] }
  let motion = 70
  const lines: string[] = []
  if (/\bspring\(/.test(code)) {
    motion += 12
    lines.push("✓ Settles with spring()")
  } else {
    lines.push("⚠ Nothing settles — ask for a spring landing")
  }
  if (/Easing\.bezier|Easing\./.test(code)) motion += 8
  else lines.push("⚠ Linear timing — ask for easing curves")
  if (/translate[XY]|scale|rotate/i.test(code)) motion += 6
  else lines.push("⚠ Opacity-only — ask for movement in space")
  if (/delay|stagger|index\s*\*/i.test(code)) motion += 4
  const heavy = (code.match(/Noise|motion-blur|displacement/gi) ?? []).length
  const perf = Math.max(40, 100 - heavy * 12)
  const a11y = /prefers-reduced-motion|a11y|accessible/i.test(code) ? 95 : 85
  return { motion: Math.min(100, motion), perf, a11y, lines }
}

export function Inspector({ plan, code, version }: Props) {
  const [selected, setSelected] = useState<number | null>(null)

  useEffect(() => {
    const onSelect = (e: Event) => setSelected((e as CustomEvent<number | null>).detail ?? null)
    window.addEventListener(SELECT_EVENT, onSelect)
    return () => window.removeEventListener(SELECT_EVENT, onSelect)
  }, [])

  const beat = selected !== null ? plan?.beats[selected] ?? null : null
  const s = score(code)
  const isText = beat ? /text|title|headline|caption|type/i.test(beat.what) : false

  return (
    <div className="panel min-w-0 flex-1 px-3 py-2.5" aria-label="Inspector">
      {beat ? (
        <div>
          <p className="eyebrow mb-1.5">
            beat {(selected ?? 0) + 1} · {beat.from}–{beat.to}f
          </p>
          <p className="mb-2 text-[12px] leading-relaxed text-muted">{beat.what}</p>
          {isText && (
            <div className="mb-2">
              <p className="mb-1 font-mono text-[10px] text-dim">animation style</p>
              <div className="flex flex-wrap gap-1.5">
                {["Fade In", "Slide In", "Typewriter", "Glitch"].map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => suggest(`Animate beat ${(selected ?? 0) + 1} text with ${style} style, staggered per character`)}
                    className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:border-tungsten hover:text-paper"
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {[
              ["Faster", `Make beat ${(selected ?? 0) + 1} faster`],
              ["Slower", `Make beat ${(selected ?? 0) + 1} slower with room to land`],
              ["Change easing", `Change beat ${(selected ?? 0) + 1} easing to a spring with overshoot`],
              ["Replace asset", `Replace the asset in beat ${(selected ?? 0) + 1} with a higher-resolution one`],
            ].map(([label, text]) => (
              <button
                key={label}
                type="button"
                onClick={() => suggest(text)}
                className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted transition-colors hover:border-tungsten hover:text-tungsten"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <p className="eyebrow mb-1.5">composition {version > 0 ? `v${version}` : "draft"}</p>
          <p className="mb-1 font-mono text-[12px] text-tungsten tabular-nums">
            quality {Math.round((s.motion + s.perf + s.a11y) / 3)}/100
          </p>
          <ul className="mb-2 space-y-0.5 text-[11.5px] text-muted">
            {s.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => suggest("Auto-improve this cut: fix the weakest quality finding, keep everything else identical")}
              className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted transition-colors hover:border-tungsten hover:text-tungsten"
            >
              Auto-improve
            </button>
            <button
              type="button"
              onClick={openExport}
              className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted transition-colors hover:border-tungsten hover:text-tungsten"
            >
              Export
            </button>
            <button
              type="button"
              onClick={() => suggest("Duplicate this cut as a variation with a different ending")}
              className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted transition-colors hover:border-tungsten hover:text-tungsten"
            >
              Duplicate
            </button>
          </div>
          <p className="mt-2 text-[10.5px] text-dim">Select a timeline beat to inspect it.</p>
        </div>
      )}
    </div>
  )
}

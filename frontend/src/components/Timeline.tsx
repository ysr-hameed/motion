import { useEffect, useState } from "react"
import type { MotionPlan } from "~/lib/composition"

/**
 * Phase 1: interactive beats timeline (IMPLEMENTATION_PLAN.md §4.2).
 *
 * The Stage owns the sandbox player and its transport scrubber; this is the
 * plan-visualization layer: per-beat blocks with real props on hover,
 * click-to-inspect, and retime actions that suggest (not apply) edits.
 * Suggestions travel as `motion:suggest` window events which the
 * Conversation panel turns into draft text — the agent stays the only
 * writer of the composition, so a click can never corrupt the cut.
 */

export const SELECT_EVENT = "motion:select-beat"
export const SUGGEST_EVENT = "motion:suggest"

export function suggest(text: string) {
  window.dispatchEvent(new CustomEvent(SUGGEST_EVENT, { detail: text }))
}

export function selectBeat(index: number | null) {
  window.dispatchEvent(new CustomEvent(SELECT_EVENT, { detail: index }))
}

export function Timeline({ plan, duration }: { plan: MotionPlan | null; duration: number }) {
  const [selected, setSelected] = useState<number | null>(null)

  useEffect(() => {
    const onSelect = (e: Event) => setSelected((e as CustomEvent<number | null>).detail ?? null)
    window.addEventListener(SELECT_EVENT, onSelect)
    return () => window.removeEventListener(SELECT_EVENT, onSelect)
  }, [])

  if (!plan || plan.beats.length === 0) {
    return (
      <div className="panel shrink-0 px-3 py-2.5" aria-label="Timeline">
        <p className="eyebrow">timeline — no plan yet</p>
      </div>
    )
  }

  return (
    <div className="panel shrink-0 px-3 py-2.5" aria-label="Timeline">
      <div className="mb-2 flex items-center gap-2">
        <span className="eyebrow">timeline — {plan.title}</span>
        <span className="ml-auto font-mono text-[10px] text-dim">
          {duration}f · {plan.beats.length} beats
        </span>
      </div>
      <div className="flex gap-1.5">
        {plan.beats.map((b, i) => {
          const w = duration > 0 ? ((b.to - b.from) / duration) * 100 : 0
          const active = selected === i
          return (
            <button
              key={i}
              type="button"
              title={`${b.from}→${b.to}f: ${b.what}`}
              onClick={() => {
                const next = active ? null : i
                setSelected(next)
                selectBeat(next)
              }}
              className={[
                "group min-w-0 rounded-xs border px-2 py-1.5 text-left transition-colors",
                active
                  ? "border-tungsten bg-tungsten/15"
                  : "border-line-soft bg-panel-2 hover:border-tungsten/60",
              ].join(" ")}
              style={{ flexGrow: Math.max(1, w) }}
              aria-pressed={active}
              aria-label={`Beat ${i + 1}: ${b.from} to ${b.to} frames`}
            >
              <span className="block truncate font-mono text-[10px] text-paper">
                {i + 1} · {b.from}–{b.to}f
              </span>
              <span className="block truncate text-[11px] text-muted group-hover:whitespace-normal group-hover:overflow-visible">
                {b.what}
              </span>
            </button>
          )
        })}
      </div>
      {selected !== null && plan.beats[selected] && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10px] text-dim">beat {selected + 1}:</span>
          {[
            ["−15f start", `Move beat ${selected + 1} ("${plan.beats[selected]!.what.slice(0, 40)}") 15 frames earlier`],
            ["+15f", `Shift beat ${selected + 1} 15 frames later to give the previous beat room to land`],
            ["faster", `Make beat ${selected + 1} faster — retime, don't restyle`],
            ["split", `Split beat ${selected + 1} into two beats with a change of state`],
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
      )}
    </div>
  )
}

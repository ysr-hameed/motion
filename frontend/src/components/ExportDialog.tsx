import { useEffect, useState } from "react"
import { EXPORT_EVENT, EXPORT_PRESETS } from "~/lib/exportPresets"
import { suggest } from "~/components/Timeline"
import { agentUrl } from "~/lib/composition"

/**
 * Phase 4 smart export dialog (IMPLEMENTATION_PLAN.md §4.5).
 * Preset picker + bundle option. Render specs come from the agent's
 * export_preset tool — this dialog collects the CHOICE and asks the agent
 * for the spec, keeping render math server-side where the canvas lives.
 */

export function ExportDialog({ totalFrames, sessionId }: { totalFrames: number; sessionId: string }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(EXPORT_EVENT, onOpen)
    return () => window.removeEventListener(EXPORT_EVENT, onOpen)
  }, [])

  if (!open) return null

  const seconds = Math.round((totalFrames / 30) * 10) / 10

  function pick(presetId: string, presetName: string, dims: string, format: string, bundle: boolean) {
    // Phase 5 product signal: which presets users actually want.
    fetch(agentUrl(sessionId, "event"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "export-pick", detail: presetId }),
    }).catch(() => undefined)
    suggest(
      bundle
        ? "Prepare the full export bundle (all 9 platform presets) for this cut — master render plan plus per-preset reframes"
        : `Export this cut with the ${presetName} preset (${dims}, ${format}) — give me the render spec and reframe math`
    )
    setOpen(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Export presets"
      onClick={() => setOpen(false)}
    >
      <div
        className="panel max-h-[80vh] w-full max-w-lg overflow-y-auto p-4 scroll-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="eyebrow">export — {seconds}s ({totalFrames}f)</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close export dialog"
            className="ml-auto font-mono text-[12px] text-dim hover:text-paper"
          >
            ✕
          </button>
        </div>
        <p className="mb-2 text-[12px] text-muted">Where will you share this?</p>
        <ul className="space-y-1.5">
          {EXPORT_PRESETS.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => pick(p.id, p.name, p.dims, p.format, false)}
                className="flex w-full items-center gap-2 rounded border border-line px-2.5 py-1.5 text-left transition-colors hover:border-tungsten"
              >
                <span className="text-[12.5px] text-paper">{p.name}</span>
                <span className="ml-auto font-mono text-[10px] text-dim">
                  {p.dims} · {p.format}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => pick("bundle", "bundle", "all", "mixed", true)}
          className="mt-3 w-full rounded bg-tungsten px-2 py-1.5 text-[12.5px] font-medium text-ink"
        >
          Export bundle (all 9 formats)
        </button>
      </div>
    </div>
  )
}

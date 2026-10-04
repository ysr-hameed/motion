import { useEffect, useState } from "react"
import { Download, FileVideo, X } from "lucide-react"
import { EXPORT_EVENT } from "~/lib/exportPresets"
import { suggest } from "~/components/Timeline"
import { agentUrl } from "~/lib/composition"

const FORMATS = [
  { id: "MP4", blurb: "Universal — plays everywhere", recommended: true },
  { id: "WebM", blurb: "Smaller file — best for the web", recommended: false },
] as const

const FPS = [
  { value: 24, label: "24", hint: "Cinema" },
  { value: 30, label: "30", hint: "Standard" },
  { value: 60, label: "60", hint: "Buttery" },
] as const

/**
 * Export is two questions: which format, which frame rate. The agent owns
 * all render math — the dialog only collects the choice and asks the
 * director to render. The finished file lands in Downloads.
 */
export function ExportDialog({ totalFrames, sessionId }: { totalFrames: number; sessionId: string }) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<(typeof FORMATS)[number]["id"]>("MP4")
  const [fps, setFps] = useState<number>(30)

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(EXPORT_EVENT, onOpen)
    return () => window.removeEventListener(EXPORT_EVENT, onOpen)
  }, [])

  if (!open) return null

  const seconds = Math.round((totalFrames / 30) * 10) / 10

  function render() {
    fetch(agentUrl(sessionId, "event"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "export-pick", detail: `${format.toLowerCase()}-${fps}` }),
    }).catch(() => undefined)
    suggest(
      `Render this cut now as ${format} at ${fps}fps, native 1920×1080 canvas. Publish the file and reply with the download link.`
    )
    setOpen(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Export video"
      onClick={() => setOpen(false)}
    >
      <div
        className="panel-lift w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center gap-2">
          <p className="text-lg font-extrabold tracking-tight text-paper">Export this cut</p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close export dialog"
            className="ml-auto rounded-full p-1.5 text-dim transition-colors hover:bg-panel-2 hover:text-paper"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <p className="mb-5 text-xs font-bold text-dim">{seconds}s · {totalFrames} frames · 1920×1080</p>

        <p className="mb-2 text-xs font-extrabold uppercase tracking-widest text-dim">Format</p>
        <div className="grid grid-cols-2 gap-2">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFormat(f.id)}
              aria-pressed={format === f.id}
              className={`rounded-2xl border-[1.5px] p-3.5 text-left transition-all ${
                format === f.id
                  ? "border-paper bg-paper text-ink shadow-[3px_3px_0_rgb(217_72_0)]"
                  : "border-line bg-ink hover:border-paper/40"
              }`}
            >
              <span className="flex items-center gap-1.5 text-base font-extrabold">
                <FileVideo size={16} aria-hidden className={format === f.id ? "text-tungsten" : "text-dim"} />
                {f.id}
              </span>
              <span className={`mt-1 block text-[11px] font-medium ${format === f.id ? "text-[#4a4438]" : "text-dim"}`}>
                {f.blurb}
              </span>
              {f.recommended ? (
                <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold ${format === f.id ? "bg-tungsten text-white" : "bg-panel-2 text-muted"}`}>
                  Recommended
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <p className="mb-2 mt-5 text-xs font-extrabold uppercase tracking-widest text-dim">Frame rate</p>
        <div className="grid grid-cols-3 gap-2">
          {FPS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setFps(o.value)}
              aria-pressed={fps === o.value}
              className={`rounded-2xl border-[1.5px] px-3 py-2.5 text-center transition-all ${
                fps === o.value
                  ? "border-paper bg-paper text-ink shadow-[3px_3px_0_rgb(217_72_0)]"
                  : "border-line bg-ink text-muted hover:border-paper/40 hover:text-paper"
              }`}
            >
              <span className="block text-base font-extrabold">{o.label}</span>
              <span className={`block text-[10px] font-bold ${fps === o.value ? "text-[#4a4438]" : "text-dim"}`}>{o.hint}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={render}
          className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-paper text-[15px] font-extrabold text-ink shadow-[4px_4px_0_rgb(217_72_0)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-tungsten hover:text-white hover:shadow-none"
        >
          <Download size={17} aria-hidden />
          Render video
        </button>
        <p className="mt-3 text-center text-xs font-medium text-dim">
          The file lands in <span className="font-extrabold text-paper">Downloads</span> when it's ready.
        </p>
      </div>
    </div>
  )
}

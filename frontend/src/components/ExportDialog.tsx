import { useEffect, useRef, useState } from "react"
import { Download, FileVideo, X } from "lucide-react"
import { EXPORT_EVENT } from "~/lib/exportPresets"
import { agentUrl } from "~/lib/composition"
import { downloadBlob, exportBundleToVideo, type ExportProgress } from "~/web/export"
import { parseBundle } from "~/web/types"

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
 * Export is two questions plus a render: which format, which frame rate,
 * then a real client-side render. The bundle steps deterministically through
 * every frame in a hidden iframe; snapshots play back onto a canvas while a
 * MediaRecorder captures the stream. The finished file lands in Downloads —
 * no server render, no queue.
 */
export function ExportDialog({
  totalFrames,
  sessionId,
  getCode,
}: {
  totalFrames: number
  sessionId: string
  /** Current bundle source — read lazily so the dialog never goes stale. */
  getCode: () => string
}) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<(typeof FORMATS)[number]["id"]>("MP4")
  const [fps, setFps] = useState<number>(30)
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    const onOpen = () => {
      setError(null)
      setProgress(null)
      setOpen(true)
    }
    window.addEventListener(EXPORT_EVENT, onOpen)
    return () => window.removeEventListener(EXPORT_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (!open) {
      abort.current?.abort()
      abort.current = null
      setProgress(null)
    }
  }, [open ])

  if (!open) return null

  const seconds = Math.round((totalFrames / 30) * 10) / 10
  const busy = progress !== null

  async function render() {
    setError(null)
    const parsed = parseBundle(getCode())
    if (!parsed.ok || !parsed.bundle) {
      setError("No web bundle on stage — ask the director to build the cut first.")
      return
    }
    const ac = new AbortController()
    abort.current = ac
    setProgress({ p: 0, phase: "render" })
    try {
      const out = await exportBundleToVideo(parsed.bundle, {
        fps,
        format: format.toLowerCase() as "webm" | "mp4",
        signal: ac.signal,
        onProgress: (p) => setProgress(p),
      })
      const stamp = new Date().toISOString().slice(0, 10)
      downloadBlob(out.blob, `cut-${stamp}.${out.ext}`)
      fetch(agentUrl(sessionId, "event"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "export", detail: `${out.ext}-${out.fps}fps-${out.frames}f` }),
      }).catch(() => undefined)
      setOpen(false)
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        setProgress(null)
        return
      }
      setError(err instanceof Error ? err.message : String(err))
      setProgress(null)
    } finally {
      abort.current = null
    }
  }

  const pct = progress ? Math.round(progress.p * 100) : 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Export video"
      onClick={() => (busy ? undefined : setOpen(false))}
    >
      <div
        className="panel-lift w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center gap-2">
          <p className="text-lg font-extrabold tracking-tight text-paper">Export this cut</p>
          <button
            type="button"
            onClick={() => (busy ? abort.current?.abort() : setOpen(false))}
            aria-label={busy ? "Cancel export" : "Close export dialog"}
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
              onClick={() => !busy && setFormat(f.id)}
              aria-pressed={format === f.id}
              disabled={busy}
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
              onClick={() => !busy && setFps(o.value)}
              aria-pressed={fps === o.value}
              disabled={busy}
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

        {busy ? (
          <div className="mt-6">
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-tungsten transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-center text-xs font-semibold text-muted">
              {progress.phase === "render" ? `Rendering frames… ${pct}%` : `Encoding ${format}… ${pct}%`}
            </p>
            <button
              type="button"
              onClick={() => abort.current?.abort()}
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-line text-sm font-bold text-muted transition-colors hover:border-bad hover:text-bad"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={render}
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-paper text-[15px] font-extrabold text-ink shadow-[4px_4px_0_rgb(217_72_0)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-tungsten hover:text-white hover:shadow-none"
          >
            <Download size={17} aria-hidden />
            Render video
          </button>
        )}
        {error ? <p className="mt-3 text-center text-xs font-medium text-bad">{error}</p> : null}
        {!busy && !error ? (
          <p className="mt-3 text-center text-xs font-medium text-dim">
            Rendered in <span className="font-extrabold text-paper">this browser</span> — the file lands in{" "}
            <span className="font-extrabold text-paper">Downloads</span> when it's ready.
          </p>
        ) : null}
      </div>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, Loader2, Maximize, Pause, Play, X } from "lucide-react"
import { Player, type PlayerRef } from "@remotion/player"
import { ClipRenderer } from "@/remotion/ClipRenderer"
import { CodeComposition } from "@/remotion-code/CodeComposition"
import { artifactCanvas, type Artifact } from "@/lib/artifact"
import { getPlaybackPrefs } from "@/lib/preferences"
import { EXPORT_VIDEO_EVENT } from "@/lib/video-export"
import type { ExportSettings } from "@/lib/use-motion-studio"
import { cn } from "@/lib/utils"

function fmtTime(frame: number, fps: number): string {
  const total = Math.floor(frame / fps)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
  return s || "motion-clip"
}

/** Quality labels are output pixel heights, not multipliers. */
const QUALITY_HEIGHT: Record<ExportSettings["quality"], number> = {
  "720p": 720,
  "1080p": 1080,
  "4K": 2160,
}

/**
 * The stage.
 *
 * Mounts whatever the version actually is: an AI-written composition, or
 * — for versions made before the code editor existed — the old JSON
 * document renderer, which is retained read-only so history keeps
 * playing.
 *
 * The player is also the render oracle. If a composition throws while
 * mounting, that is the only proof anything is actually wrong, so the
 * real error is handed to `onError` and the studio runs a bounded repair
 * against it. Nothing else in the app can assert the file runs.
 */
export function ClipPlayer({
  artifact,
  title = "motion-clip",
  version = 1,
  container = "MP4",
  quality = "1080p",
  framed = true,
  onError,
}: {
  artifact: Artifact
  title?: string
  version?: number
  container?: ExportSettings["container"]
  quality?: ExportSettings["quality"]
  framed?: boolean
  /** Real render failure. The studio repairs from this. */
  onError?: (errors: string[]) => void
}) {
  const isCode = artifact.kind === "code"
  const canvas = useMemo(() => artifactCanvas(artifact), [artifact])
  const component = isCode
    ? CodeComposition
    : (ClipRenderer as React.ComponentType<Record<string, unknown>>)
  const inputProps = useMemo(
    () =>
      isCode
        ? { code: (artifact as { code: string }).code }
        : { doc: (artifact as { doc: unknown }).doc },
    [artifact, isCode]
  )

  const playerRef = useRef<PlayerRef>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [prefs] = useState(getPlaybackPrefs)
  const [playing, setPlaying] = useState(prefs.autoplay)
  const [frame, setFrame] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [render, setRender] = useState<{
    stage: "rendering" | "done"
    done: number
    total: number
  } | null>(null)
  const renderAbort = useRef<AbortController | null>(null)

  useEffect(() => {
    setError(null)
    setFrame(0)
  }, [artifact])

  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    const onPlay = () => {
      setError(null)
      setPlaying(true)
    }
    const onPause = () => setPlaying(false)
    const onEnded = () => setPlaying(false)
    const onFrame = (e: { detail: { frame: number } }) =>
      setFrame(Math.floor(e.detail.frame))
    const onErr = (e: { detail: { error: Error } }) => {
      const message = e.detail?.error?.message ?? "Unknown render error"
      setError(message)
      onError?.([message])
    }
    player.addEventListener("play", onPlay)
    player.addEventListener("pause", onPause)
    player.addEventListener("ended", onEnded)
    player.addEventListener("frameupdate", onFrame)
    player.addEventListener("error", onErr)
    return () => {
      player.removeEventListener("play", onPlay)
      player.removeEventListener("pause", onPause)
      player.removeEventListener("ended", onEnded)
      player.removeEventListener("frameupdate", onFrame)
      player.removeEventListener("error", onErr)
    }
  }, [artifact, onError])

  const toggle = () => {
    try {
      if (playing) playerRef.current?.pause()
      else void playerRef.current?.play()
    } catch {
      /* not ready yet */
    }
  }

  const seek = (v: number) => {
    try {
      playerRef.current?.seekTo(v)
    } catch {
      /* not ready yet */
    }
    setFrame(v)
  }

  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void stageRef.current?.requestFullscreen()
  }

  const startRender = () => {
    if (render || renderAbort.current) return
    const controller = new AbortController()
    renderAbort.current = controller
    setError(null)
    setRender({ stage: "rendering", done: 0, total: canvas.durationInFrames })
    void (async () => {
      const mod = await import("@/lib/render-composition")
      try {
        // The quality labels are output heights. Scaling the canvas by a flat
        // multiplier made all three wrong (a 1080p canvas at ×1 was 1080p,
        // not 720p, and ×3 was 5.7K, not 4K), so derive the factor from the
        // requested height instead.
        const scale = QUALITY_HEIGHT[quality] / canvas.height
        const { blob, ext } = await mod.renderComposition({
          artifact,
          compositionId: `motion-${slugify(title)}`,
          width: canvas.width,
          height: canvas.height,
          fps: canvas.fps,
          totalFrames: canvas.durationInFrames,
          scale,
          container,
          signal: controller.signal,
          onProgress: (done, total) =>
            setRender((r) => (r ? { ...r, done, total } : r)),
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${slugify(title)}-v${version}.${ext}`
        a.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 5000)
      } catch (e) {
        if (!(e instanceof mod.RenderCancelled)) {
          setError(e instanceof Error ? e.message : "Render failed — try again.")
        }
      } finally {
        renderAbort.current = null
        setRender(null)
      }
    })()
  }

  // Header Export menu → render the current version to a video file.
  useEffect(() => {
    const onRequest = () => startRender()
    window.addEventListener(EXPORT_VIDEO_EVENT, onRequest)
    return () => window.removeEventListener(EXPORT_VIDEO_EVENT, onRequest)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact, container, title, version, quality, render])

  const renderPct =
    render && render.total > 0
      ? Math.min(100, Math.round((render.done / render.total) * 100))
      : 0

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl bg-neutral-950",
        framed && "border"
      )}
    >
      <div ref={stageRef} className="relative bg-neutral-950">
        <Player
          key={`${version}-${isCode ? "code" : "doc"}`}
          ref={playerRef}
          component={component}
          inputProps={inputProps}
          durationInFrames={canvas.durationInFrames}
          compositionWidth={canvas.width}
          compositionHeight={canvas.height}
          fps={canvas.fps}
          controls={false}
          autoPlay={prefs.autoplay}
          loop={prefs.loop}
          clickToPlay
          acknowledgeRemotionLicense
          errorFallback={({ error: err }) => (
            <div className="flex h-full flex-col items-center justify-center gap-2 bg-neutral-950 p-6 text-center">
              <p className="text-sm text-red-200">
                This version didn&apos;t render
              </p>
              <p className="max-w-sm text-[11px] text-red-300/70">
                {err.message}
              </p>
            </div>
          )}
          style={{ width: "100%" }}
        />
        {render && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 p-6 backdrop-blur-[2px]">
            {render.stage === "done" ? (
              <Check className="size-6 text-emerald-400" />
            ) : (
              <Loader2 className="size-6 animate-spin text-white" />
            )}
            <p className="text-sm font-medium tabular-nums text-white">
              {render.stage === "done"
                ? "Saved to downloads"
                : `Rendering video… ${renderPct}%`}
            </p>
            <div
              role="progressbar"
              aria-valuenow={render.stage === "done" ? 100 : renderPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Video render progress"
              className="h-1.5 w-48 overflow-hidden rounded-full bg-white/15"
            >
              <div
                className="h-full rounded-full bg-white transition-[width] duration-200"
                style={{ width: `${render.stage === "done" ? 100 : renderPct}%` }}
              />
            </div>
            {render.stage === "rendering" && (
              <p className="text-[11px] text-white/60">
                Official Remotion render — keep this tab open.
              </p>
            )}
            {render.stage === "rendering" && (
              <button
                type="button"
                onClick={() => renderAbort.current?.abort()}
                className="mt-1 flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
              >
                <X className="size-3" />
                Cancel
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-2 border-t border-white/10 bg-black/60 px-3 py-2.5 backdrop-blur">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105 active:scale-95 sm:size-8"
        >
          {playing ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4 translate-x-[1px]" />
          )}
        </button>
        <span className="shrink-0 text-xs tabular-nums text-white/80">
          {fmtTime(frame, canvas.fps)}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(0, canvas.durationInFrames - 1)}
          value={Math.min(frame, Math.max(0, canvas.durationInFrames - 1))}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Seek"
          className={cn(
            "h-1 w-full min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/20",
            "[&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none",
            "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white",
            "[&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:border-0",
            "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white"
          )}
        />
        <span className="hidden shrink-0 text-xs tabular-nums text-white/50 min-[380px]:inline">
          {fmtTime(canvas.durationInFrames, canvas.fps)}
        </span>
        <button
          type="button"
          onClick={fullscreen}
          aria-label="Fullscreen"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Maximize className="size-4" />
        </button>
      </div>


      {error && (
        <p className="border-t border-red-500/30 bg-red-950 px-4 py-2 text-xs text-red-200">
          Preview error: {error}
        </p>
      )}
    </div>
  )
}

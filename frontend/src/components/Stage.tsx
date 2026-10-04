import { useEffect, useMemo, useRef, useState } from "react"
import { Maximize, Minimize, Pause, Play, Repeat, RotateCcw } from "lucide-react"
import { agentUrl, CANVAS, type MotionPlan } from "~/lib/composition"
import { buildSrcdoc, helloFamilies } from "~/web/runtime"
import { bundleFrames, parseBundle, type WebBundle } from "~/web/types"

const { width, height, fps } = CANVAS

interface Props {
  code: string
  plan: MotionPlan | null
  version: number
  /** Bumped by the caller whenever new code lands, to force a remount. */
  reloadKey: string
  /** DO session for advisory compile-timing events. */
  sessionId: string
}

type State =
  | { kind: "empty" }
  | { kind: "legacy" }
  | { kind: "error"; message: string }
  | { kind: "ready"; bundle: WebBundle; srcdoc: string }

/**
 * Fixed-ratio preview box: measures the black stage area and returns the
 * largest pixel box with the canvas aspect ratio that fits inside it.
 */
function useFitSize(ratio: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !(ratio > 0)) return
    const fit = () => {
      const r = el.getBoundingClientRect()
      const w = Math.max(1, Math.floor(Math.min(r.width, r.height * ratio)))
      setSize((prev) => {
        const h = Math.floor(w / ratio)
        return prev?.w === w && prev?.h === h ? prev : { w, h }
      })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ratio])
  return { ref, size }
}

interface IframeMsg {
  ns?: string
  ev?: string
  phase?: "compile" | "mount" | "layout" | "runtime"
  ok?: boolean
  message?: string
  frame?: number
  findings?: string[]
  fonts?: Array<{ family: string; ok: boolean }>
  t?: number
}

/**
 * The stage.
 *
 * The bundle is built into a srcdoc document and mounted in a sandboxed
 * iframe (allow-scripts, opaque origin), so AI-written JS cannot touch the
 * parent, cookies, or storage. What is on screen is the real render path —
 * the same render(t, ctx) code that exports, not an approximation.
 */
export function Stage({ code, plan, version, reloadKey, sessionId }: Props) {
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(false)
  const [speed, setSpeed] = useState<number>(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const { ref: fitRef, size: fitSize } = useFitSize(width / height)

  const state: State = useMemo(() => {
    if (!code.trim()) return { kind: "empty" }
    const parsed = parseBundle(code)
    if (parsed.legacy) return { kind: "legacy" }
    if (!parsed.ok || !parsed.bundle) {
      return { kind: "error", message: "This cut is not a valid web bundle — ask the director to regenerate it." }
    }
    try {
      return { kind: "ready", bundle: parsed.bundle, srcdoc: buildSrcdoc(parsed.bundle) }
    } catch (err) {
      return { kind: "error", message: err instanceof Error ? err.message : String(err) }
    }
  }, [code])

  const bundle = state.kind === "ready" ? state.bundle : null

  // The plan's last beat is the honest duration; without a plan, the
  // bundle's own duration drives the transport.
  const duration = useMemo(() => {
    const last = plan?.beats?.at(-1)
    const fromPlan = last ? Math.max(30, Math.ceil(last.to)) : 0
    if (fromPlan) return fromPlan
    return bundle ? bundleFrames(bundle) : 150
  }, [plan, bundle])

  const post = (payload: Record<string, unknown>) => {
    fetch(agentUrl(sessionId, "audit"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => undefined)
  }

  // Render reports already posted this session (version + kind). The
  // agent's read_render_report is the only render claim it may make, so
  // every terminal state reports exactly once.
  const reported = useRef<Set<string>>(new Set())
  const postOnce = (key: string, payload: Record<string, unknown>) => {
    if (reported.current.has(key)) return
    reported.current.add(key)
    post(payload)
  }

  const send = (msg: Record<string, unknown>) => {
    try {
      iframeRef.current?.contentWindow?.postMessage({ ns: "wm", ...msg }, "*")
    } catch { /* iframe not ready yet */ }
  }

  // Fresh source: reset transport, clear per-version report keys.
  useEffect(() => {
    reported.current.clear()
    setFrame(0)
    setPlaying(false)
    setRuntimeError(null)
  }, [reloadKey, version])

  // Loop/speed follow the iframe.
  useEffect(() => {
    send({ cmd: "loop", loop })
  }, [loop])
  useEffect(() => {
    send({ cmd: "speed", speed })
  }, [speed])

  // Iframe → parent: ticks drive the playhead, reports feed the agent.
  useEffect(() => {
    if (state.kind !== "ready") return undefined
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return
      const m = (e.data ?? {}) as IframeMsg
      if (m.ns !== "wm") return
      if (m.ev === "tick" && typeof m.frame === "number") {
        setFrame(m.frame)
        if (m.frame === 0) return
        postOnce(`mount:${version}`, {
          version,
          ok: true,
          phase: "mount",
          frame: m.frame,
          message: `mounted in the sandbox and rendering — ${width}x${height}@${fps}`,
        })
        return
      }
      if (m.ev === "hello-ack") {
        postOnce(`ok:${version}`, {
          version,
          ok: true,
          phase: "compile",
          message: "bundle evaluated, render(t, ctx) bound, waiting to mount",
        })
        return
      }
      if (m.ev === "report") {
        if (m.phase === "compile" && m.ok === false) {
          postOnce(`fail:${version}:${String(m.message ?? "").slice(0, 120)}`, {
            version,
            ok: false,
            phase: "compile",
            message: m.message ?? "bundle failed to evaluate",
          })
          setRuntimeError(m.message ?? "bundle failed to evaluate")
        } else if (m.phase === "mount" && m.ok) {
          postOnce(`mount:${version}`, {
            version,
            ok: true,
            phase: "mount",
            frame: m.frame ?? 0,
            message: m.message ?? `mounted and rendering — ${width}x${height}@${fps}`,
          })
        } else if (m.phase === "layout" && m.ok) {
          postOnce(`layout:${version}`, {
            version,
            ok: true,
            phase: "layout",
            frame: m.frame ?? 0,
            findings: m.findings ?? [],
            fonts: m.fonts ?? [],
            message: m.message ?? `rendered v${version}`,
          })
        } else if (m.phase === "runtime" && m.ok === false) {
          const msg = m.message ?? "runtime error"
          postOnce(`runtime:${version}:${msg.slice(0, 120)}`, {
            version,
            ok: false,
            phase: "runtime",
            message: msg,
          })
          setRuntimeError(msg)
        }
      }
    }
    window.addEventListener("message", onMsg)
    return () => window.removeEventListener("message", onMsg)
  }, [state.kind, version])

  useEffect(() => {
    const onFs = () => setIsFullscreen(document.fullscreenElement != null)
    document.addEventListener("fullscreenchange", onFs)
    return () => document.removeEventListener("fullscreenchange", onFs)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined)
    } else {
      void sectionRef.current?.requestFullscreen().catch(() => undefined)
    }
  }

  const cycleSpeed = () => {
    setSpeed((s) => {
      const i = SPEEDS.indexOf(s as (typeof SPEEDS)[number])
      return SPEEDS[(i + 1) % SPEEDS.length]!
    })
  }

  const togglePlay = () => {
    if (state.kind !== "ready") return
    if (playing) {
      send({ cmd: "pause" })
      setPlaying(false)
    } else {
      if (frame >= duration - 1) {
        send({ cmd: "seek", t: 0 })
        setFrame(0)
      }
      send({ cmd: "play" })
      setPlaying(true)
    }
  }

  const seekTo = (f: number) => {
    send({ cmd: "seek", t: Math.min(duration, Math.max(0, f)) / fps })
    setFrame(f)
    setPlaying(false)
  }
  // The iframe onLoad closure needs the latest seekTo.
  const seekToRef = useRef(seekTo)
  seekToRef.current = seekTo

  return (
    <section ref={sectionRef} className="flex min-h-0 flex-1 flex-col gap-2" aria-label="Stage">
      <div
        ref={fitRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black"
      >
        {state.kind === "empty" && <EmptyStage />}

        {state.kind === "legacy" && (
          <div className="max-w-md px-6 text-center">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-tungsten-bright">legacy cut</p>
            <p className="text-sm leading-relaxed text-[#c9c2b4]">
              This cut was built on the old Remotion engine. Ask the director
              to rebuild it — it will render here as a web bundle.
            </p>
          </div>
        )}

        {state.kind === "error" && (
          <div className="max-w-md px-6 text-center">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-bad">will not render</p>
            <p className="font-mono text-xs leading-relaxed text-[#c9c2b4]">{state.message}</p>
          </div>
        )}

        {state.kind === "ready" && (
          <div
            className="flex items-center justify-center"
            style={
              fitSize
                ? { width: fitSize.w, height: fitSize.h }
                : { width: "100%", aspectRatio: `${width} / ${height}` }
            }
          >
            <iframe
              key={`${version}:${reloadKey}`}
              ref={iframeRef}
              title="Motion preview"
              sandbox="allow-scripts"
              srcDoc={state.srcdoc}
              onLoad={() => {
                // Handshake: font truth list, then start from the top.
                try {
                  iframeRef.current?.contentWindow?.postMessage(
                    { ns: "wm", cmd: "hello", families: helloFamilies(state.bundle) },
                    "*",
                  )
                } catch { /* will retry on tick */ }
                seekToRef.current?.(0)
              }}
              style={{ width: "100%", height: "100%", border: 0, background: "#000" }}
            />
          </div>
        )}

        {runtimeError && state.kind === "ready" && (
          <div className="absolute bottom-2 left-1/2 max-w-md -translate-x-1/2 rounded-xl border border-bad/40 bg-black/85 px-4 py-2 text-center">
            <p className="font-mono text-[11px] leading-relaxed text-bad">{runtimeError.slice(0, 220)}</p>
          </div>
        )}
      </div>

      <Transport
        frame={frame}
        duration={duration}
        playing={playing}
        plan={plan}
        loop={loop}
        onToggleLoop={() => setLoop((v) => !v)}
        speed={speed}
        onCycleSpeed={cycleSpeed}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        onTogglePlay={togglePlay}
        onSeek={seekTo}
        disabled={state.kind !== "ready"}
      />
    </section>
  )
}

const EMPTY_EXAMPLES = [
  "A 5s product reveal — logo punches in on an overshoot",
  "Kinetic type masking a headline in, per character",
  "A lower third wiping in under a talking head",
]

function EmptyStage() {
  const pick = (text: string) => {
    window.dispatchEvent(new CustomEvent("motion:suggest", { detail: text }))
  }
  return (
    <div className="max-w-md px-8 text-center">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#a29885]">no cut yet — 60 seconds away</p>
      <p className="mx-auto max-w-sm text-sm leading-relaxed text-[#c9c2b4]">
        Describe the clip in <span className="font-bold text-white">Direct</span>.
        The agent plans the beats, writes the code, and it renders here.
      </p>
      <div className="mt-4 flex flex-col gap-1.5">
        {EMPTY_EXAMPLES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => pick(s)}
            className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-xs leading-relaxed text-[#c9c2b4] transition-all hover:border-tungsten hover:text-white"
          >
            <span className="mr-1.5 font-bold text-tungsten-bright">try →</span>
            {s}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-[#8a8474]">tapping fills the Direct draft — press send</p>
    </div>
  )
}

/** m:ss for the transport — quiet, no clutter. */
function fmt(f: number): string {
  const s = Math.max(0, Math.floor(f / fps))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

const SPEEDS = [1, 1.5, 2, 0.5] as const

function IconBtn({
  label,
  onClick,
  active,
  children,
}: {
  label: string
  onClick: () => void
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
        active ? "bg-tungsten/25 text-tungsten-bright" : "text-[#b8b0a0] hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  )
}

function Transport({
  frame,
  duration,
  playing,
  plan,
  loop,
  onToggleLoop,
  speed,
  onCycleSpeed,
  isFullscreen,
  onToggleFullscreen,
  onTogglePlay,
  onSeek,
  disabled,
}: {
  frame: number
  duration: number
  playing: boolean
  plan: MotionPlan | null
  loop: boolean
  onToggleLoop: () => void
  speed: number
  onCycleSpeed: () => void
  isFullscreen: boolean
  onToggleFullscreen: () => void
  onTogglePlay: () => void
  onSeek: (f: number) => void
  disabled: boolean
}) {
  const pct = duration > 0 ? (frame / Math.max(1, duration - 1)) * 100 : 0

  return (
    <div className="group/bar shrink-0 px-3 pb-3 pt-1.5">
      {/* seek bar owns its row — nothing to vertically align against */}
      <div className="relative h-6 select-none">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/10 transition-all duration-150 group-hover/bar:h-1.5">
          <div className="absolute inset-0 overflow-hidden rounded-full">
            {plan?.beats?.map((b, i) => {
              const left = duration > 0 ? (b.from / duration) * 100 : 0
              const w = duration > 0 ? ((b.to - b.from) / duration) * 100 : 0
              return (
                <div
                  key={i}
                  className="absolute top-0 h-full bg-tungsten/25"
                  style={{ left: `${Math.min(100, left)}%`, width: `${Math.max(0.5, Math.min(100 - left, w))}%` }}
                  title={b.what}
                />
              )
            })}
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-tungsten"
              style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
            />
          </div>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-tungsten opacity-0 shadow-[0_0_10px_rgb(217_72_0/0.8)] transition-opacity group-hover/bar:opacity-100"
          style={{ left: `${Math.min(100, Math.max(0, pct))}%` }}
        />
        <input
          type="range"
          min={0}
          max={Math.max(1, duration - 1)}
          value={frame}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Seek"
          disabled={disabled}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0"
        />
      </div>

      {/* buttons row: uniform height, everything centered */}
      <div className="mt-0.5 flex h-9 items-center gap-1">
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={playing ? "Pause" : "Play"}
          disabled={disabled}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition-all hover:scale-105 hover:bg-tungsten hover:text-white disabled:opacity-40"
        >
        {playing ? (
          <Pause size={14} fill="currentColor" aria-hidden />
        ) : (
          <Play size={14} fill="currentColor" className="translate-x-[1px]" aria-hidden />
        )}
        </button>

      <IconBtn label="Restart" onClick={() => onSeek(0)}>
        <RotateCcw size={14} aria-hidden />
      </IconBtn>

        <span className="tc ml-1 hidden shrink-0 text-[11px] text-dim min-[420px]:inline">
          {fmt(frame)} / {fmt(duration)}
        </span>

        <span className="flex-1" />

        <button
          type="button"
          onClick={onCycleSpeed}
          title="Playback speed"
          aria-label={`Playback speed ${speed}x — change`}
          className={`tc inline-flex h-8 shrink-0 items-center justify-center rounded-full px-2.5 text-[11px] transition-colors ${
            speed !== 1 ? "bg-tungsten/25 text-tungsten-bright" : "text-[#b8b0a0] hover:bg-white/10 hover:text-white"
          }`}
        >
          {speed}×
        </button>

      <IconBtn label={loop ? "Loop on — turn off" : "Loop off — turn on"} onClick={onToggleLoop} active={loop}>
        <Repeat size={14} aria-hidden />
      </IconBtn>

      <IconBtn label={isFullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={onToggleFullscreen}>
        {isFullscreen ? (
          <Minimize size={14} aria-hidden />
        ) : (
          <Maximize size={14} aria-hidden />
        )}
      </IconBtn>
      </div>
    </div>
  )
}

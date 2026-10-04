import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react"
import { Maximize, Minimize, Pause, Play, Repeat, RotateCcw } from "lucide-react"
import type { PlayerRef } from "@remotion/player"
import type { CompileError } from "~/remotion-code/compile"
import { agentUrl, CANVAS, type MotionPlan } from "~/lib/composition"
import { measureStage } from "~/lib/layout-audit"
import { FONTS } from "~/remotion-code/fonts"

const { width, height, fps } = CANVAS

/**
 * The Player and the whole compile pipeline are ~800kB together and are needed
 * only once there is a cut on the stage. Loading them on demand keeps the first
 * paint — the chat, which is what the user is waiting on — small.
 */
const Player = lazy(() => import("@remotion/player").then((m) => ({ default: m.Player })))
const compile = (source: string) => import("~/remotion-code/compile").then((m) => m.compile(source))

/**
 * A stale tab (open across a deploy) references hashed chunks the current
 * deployment no longer serves — Pages answers those with the SPA fallback
 * HTML, so the dynamic import rejects with one of these messages. That is an
 * app-version problem, never a composition problem, and the fix is a reload
 * (which fetches a fresh index.html pointing at live chunks).
 */
export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("Importing a module script failed")
  )
}

/** Prefetch the compile chunk so a stale tab fails fast with a reload prompt. */
export function warmCompileChunk(onStale: () => void): void {
  import("~/remotion-code/compile").then(
    () => undefined,
    (err: unknown) => {
      if (isChunkLoadError(err)) onStale()
    },
  )
}

/**
 * Font load truth for the cited families: loaded vs silent fallback.
 * Family names come from the same FONTS registry the loader populates —
 * no guessing — and document.fonts.check is the verdict. Reported on the
 * layout audit so the agent stops claiming a font change worked from an
 * edit alone.
 */
function fontStatuses(code: string): Array<{ family: string; ok: boolean }> {
  try {
    const keys = new Set<string>()
    for (const m of code.matchAll(/Fonts\.(\w+)\.family/g)) keys.add(m[1]!)
    if (keys.size === 0) return []
    const doc = document as Document & { fonts?: FontFaceSet }
    const api = doc.fonts
    if (!api || typeof api.check !== "function") return []
    const out: Array<{ family: string; ok: boolean }> = []
    for (const key of [...keys].slice(0, 8)) {
      const family = FONTS[key]?.family ?? key
      let ok = false
      try {
        ok = api.check(`700 32px "${family}"`) || api.check(`400 32px "${family}"`)
      } catch {
        ok = false
      }
      out.push({ family, ok })
    }
    return out
  } catch {
    return []
  }
}

interface Props {
  code: string
  plan: MotionPlan | null
  version: number
  /** Bumped by the caller whenever new code lands, to force a recompile. */
  reloadKey: string
  /** DO session for advisory compile-timing events. */
  sessionId: string
}

type State =
  | { kind: "empty" }
  | { kind: "compiling" }
  | { kind: "ready"; Component: React.ComponentType<Record<string, unknown>> }
  | { kind: "error"; message: string; line?: number }
  | { kind: "stale" }

/**
 * Fixed-ratio preview box: measures the black stage area and returns the
 * largest pixel box with the canvas aspect ratio that fits inside it. The
 * Player fills that box exactly, so a 16:9 cut letterboxes in a tall area
 * and a 9:16 cut pillars in a wide one — the frame on screen always has the
 * cut's own ratio instead of stretching to whatever the panel happens to be.
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

/**
 * The stage.
 *
 * The composition is compiled in the browser and mounted in Remotion's own
 * Player, so what is on screen is the real render path — the same
 * useCurrentFrame/interpolate code that will export, not an approximation.
 */
export function Stage({ code, plan, version, reloadKey, sessionId }: Props) {
  const [state, setState] = useState<State>({ kind: "empty" })
  // A callback ref rather than useRef: the Player is lazily loaded, so the
  // instance does not exist on first render. A callback ref hands it over the
  // moment it mounts, which is what lets the timecode subscribe.
  const [player, setPlayer] = useState<PlayerRef | null>(null)
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(false)
  const [speed, setSpeed] = useState<number>(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const { ref: fitRef, size: fitSize } = useFitSize(width / height)

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
  // Render reports already posted this session (version + kind). The agent's
  // read_render_report is the only render claim it may make, so every
  // terminal state reports exactly once — success, compile failure, and
  // player runtime failure alike.
  const reported = useRef<Set<string>>(new Set())

  const postOnce = (key: string, payload: Record<string, unknown>) => {
    if (reported.current.has(key)) return
    reported.current.add(key)
    fetch(agentUrl(sessionId, "audit"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => undefined)
  }

  // The plan's last beat is the honest duration; without a plan, Remotion's
  // default of 150 frames matches the 5s house default the agent is told to use.
  const duration = useMemo(() => {
    const last = plan?.beats?.at(-1)
    const fromPlan = last ? Math.max(30, Math.ceil(last.to)) : 0
    return fromPlan || 150
  }, [plan])

  useEffect(() => {
    let cancelled = false
    if (!code.trim()) {
      setState({ kind: "empty" })
      return
    }
    setState({ kind: "compiling" })
    // Phase 5 perf signal: compile ms per version, advisory only.
    const started = performance.now()
    compile(code)
      .then((r) => {
        if (cancelled) return
        setState({ kind: "ready", Component: r.component })
        const ms = Math.round(performance.now() - started)
        // Compile-only: the agent's read_render_report treats this as
        // "not yet rendered" and keeps waiting for the mount report.
        // Posting ok:true here used to verify cuts that then threw at
        // mount — the exact false-verified bug.
        postOnce(`ok:${version}`, {
          version,
          ok: true,
          phase: "compile",
          message: `compiled in ${ms}ms, waiting to mount`,
        })
        fetch(agentUrl(sessionId, "event"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "compile", detail: `${ms}ms v${version} ${code.length}b` }),
        }).catch(() => undefined)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (isChunkLoadError(err)) {
          setState({ kind: "stale" })
          return
        }
        const ce = err as CompileError
        const message = ce?.message ?? String(err)
        postOnce(`fail:${version}:${message.slice(0, 120)}`, {
          version,
          ok: false,
          phase: "compile",
          message,
          ...(ce?.line !== undefined ? { line: ce.line } : {}),
        })
        setState({ kind: "error", message, line: ce?.line })
      })
    return () => {
      cancelled = true
    }
  }, [code, reloadKey])

  // A new version should start from the top, not from wherever the last one
  // was left scrubbing.
  useEffect(() => {
    player?.seekTo(0)
    setFrame(0)
  }, [player, version, reloadKey])

  // Layout truth from the real pixels: once the frame settles (scrub or
  // pause), measure what is actually on screen and report findings. Measuring
  // never disturbs playback — it only reads the mounted DOM. The report
  // posts even with zero findings: that empty layout report is the
  // mount-proof the agent's read_render_report waits for. Font truth rides
  // along: every Fonts.* family the code cited is checked against
  // document.fonts, so a silently-fallen-back face shows up as ok:false
  // instead of the agent claiming a font change worked from an edit alone.
  useEffect(() => {
    if (state.kind !== "ready") return undefined
    const t = setTimeout(() => {
      try {
        const report = measureStage(frame)
        postOnce(`layout:${version}`, {
          version,
          ok: true,
          phase: "layout",
          frame,
          findings: report?.findings ?? [],
          fonts: fontStatuses(code),
          message: `rendered ${version === 0 ? "" : `v${version} `}at frame ${frame} — ${width}x${height}@${fps}`,
        })
      } catch {
        // Measuring must never break playback.
      }
    }, 2000)
    return () => clearTimeout(t)
    // postOnce is ref-stable by construction (reported ref + sessionId prop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, state.kind, version])

  // The Player is an event emitter rather than a props-driven component, so the
  // timecode and playhead are wired to its events. The first frameupdate is
  // also the mount-proof the agent waits for: it only fires when a frame
  // actually rendered, so a cut that throws inside its component never
  // posts it (the errorFallback posts the failure instead).
  useEffect(() => {
    if (!player) return

    const onFrame = (e: { detail: { frame: number } }) => {
      const f = e.detail.frame
      setFrame(f)
      postOnce(`mount:${version}`, {
        version,
        ok: true,
        phase: "mount",
        frame: f,
        message: `mounted in the player and rendering — ${width}x${height}@${fps}`,
      })
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)

    player.addEventListener("frameupdate", onFrame)
    player.addEventListener("play", onPlay)
    player.addEventListener("pause", onPause)
    return () => {
      player.removeEventListener("frameupdate", onFrame)
      player.removeEventListener("play", onPlay)
      player.removeEventListener("pause", onPause)
    }
  }, [player, version])

  return (
    <section ref={sectionRef} className="flex min-h-0 flex-1 flex-col gap-2" aria-label="Stage">
      <div
        ref={fitRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black"
      >
        {state.kind === "empty" && (
          <EmptyStage />
        )}

        {state.kind === "compiling" && (
          <p className="eyebrow">compiling…</p>
        )}

        {state.kind === "error" && (
          <div className="max-w-md px-6 text-center">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-bad">will not render</p>
            <p className="font-mono text-xs leading-relaxed text-[#c9c2b4]">{state.message}</p>
            {state.line !== undefined && (
              <p className="mt-2 font-mono text-[10px] text-[#8a8474]">line {state.line}</p>
            )}
          </div>
        )}

        {state.kind === "stale" && (
          <div className="max-w-md px-6 text-center">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-tungsten-bright">app updated</p>
            <p className="text-sm leading-relaxed text-[#c9c2b4]">
              This tab is running an older version of the studio whose preview
              files are gone. Reload to pick up the latest version — your chat
              and cut are saved.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-tungsten px-4 py-2 text-sm font-bold text-white hover:brightness-110"
            >
              Reload Studio
            </button>
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
          <Suspense fallback={<p className="eyebrow">loading player…</p>}>
          <Player
            ref={setPlayer}
            component={state.Component}
            durationInFrames={duration}
            fps={fps}
            compositionWidth={width}
            compositionHeight={height}
            loop={loop}
            playbackRate={speed}
            style={{ width: "100%", height: "100%" }}
            controls={false}
            acknowledgeRemotionLicense
            errorFallback={({ error }) => {
              const message = String((error as { message?: string })?.message ?? error)
              postOnce(`runtime:${version}:${message.slice(0, 120)}`, {
                version,
                ok: false,
                phase: "runtime",
                message: `runtime: ${message}`,
              })
              return (
                <div className="max-w-md px-6 text-center">
                  <p className="eyebrow mb-2 text-bad">runtime error</p>
                  <p className="font-mono text-xs leading-relaxed text-muted">{message}</p>
                </div>
              )
            }}
          />
          </Suspense>
          </div>
        )}
      </div>

      <Transport
        player={player}
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
  player,
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
}: {
  player: PlayerRef | null
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
          onChange={(e) => player?.seekTo(Number(e.target.value))}
          aria-label="Seek"
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0"
        />
      </div>

      {/* buttons row: uniform height, everything centered */}
      <div className="mt-0.5 flex h-9 items-center gap-1">
        <button
          type="button"
          onClick={() => (playing ? player?.pause() : player?.play())}
          aria-label={playing ? "Pause" : "Play"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition-all hover:scale-105 hover:bg-tungsten hover:text-white"
        >
        {playing ? (
          <Pause size={14} fill="currentColor" aria-hidden />
        ) : (
          <Play size={14} fill="currentColor" className="translate-x-[1px]" aria-hidden />
        )}
        </button>

      <IconBtn label="Restart" onClick={() => player?.seekTo(0)}>
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

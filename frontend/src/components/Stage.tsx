import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react"
import type { PlayerRef } from "@remotion/player"
import type { CompileError } from "~/remotion-code/compile"
import { agentUrl, CANVAS, type MotionPlan } from "~/lib/composition"
import { measureStage } from "~/lib/layout-audit"
import { timecode } from "~/lib/timecode"

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
  const { ref: fitRef, size: fitSize } = useFitSize(width / height)
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
  // mount-proof the agent's read_render_report waits for.
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
    <section className="flex min-h-0 flex-1 flex-col gap-2" aria-label="Stage">
      <div
        ref={fitRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-line bg-black"
      >
        {state.kind === "empty" && (
          <EmptyStage />
        )}

        {state.kind === "compiling" && (
          <p className="eyebrow">compiling…</p>
        )}

        {state.kind === "error" && (
          <div className="max-w-md px-6 text-center">
            <p className="eyebrow mb-2 text-bad">will not render</p>
            <p className="font-mono text-xs leading-relaxed text-muted">{state.message}</p>
            {state.line !== undefined && (
              <p className="mt-2 font-mono text-[10px] text-dim">line {state.line}</p>
            )}
          </div>
        )}

        {state.kind === "stale" && (
          <div className="max-w-md px-6 text-center">
            <p className="eyebrow mb-2 text-tungsten">app updated</p>
            <p className="text-sm leading-relaxed text-muted">
              This tab is running an older version of the studio whose preview
              files are gone. Reload to pick up the latest version — your chat
              and cut are saved.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-md bg-tungsten px-4 py-2 text-sm font-semibold text-ink hover:brightness-110"
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
        version={version}
      />
    </section>
  )
}

function EmptyStage() {
  return (
    <div className="px-8 text-center">
      <p className="eyebrow mb-3">no cut yet</p>
      <p className="max-w-sm text-sm leading-relaxed text-muted">
        Describe the clip you want. The agent plans the beats, writes the
        composition, and it renders here.
      </p>
    </div>
  )
}

function Transport({
  player,
  frame,
  duration,
  playing,
  plan,
  version,
}: {
  player: PlayerRef | null
  frame: number
  duration: number
  playing: boolean
  plan: MotionPlan | null
  version: number
}) {
  const pct = duration > 0 ? (frame / Math.max(1, duration - 1)) * 100 : 0

  return (
    <div className="panel shrink-0 px-3 py-2.5">
      <div className="flex items-center gap-4">
        <div className="flex items-baseline gap-2">
          <span className="tc text-lg text-tungsten tabular-nums">{timecode(frame, fps)}</span>
          <span className="tc text-xs text-dim">/ {timecode(duration, fps)}</span>
        </div>

        <div className="flex items-center gap-1">
          <TransportButton
            label="Rewind to start"
            onClick={() => player?.seekTo(0)}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 2v8M10 2.5v7L5 6z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </TransportButton>
          <button
            type="button"
            onClick={() => (playing ? player?.pause() : player?.play())}
            aria-label={playing ? "Pause" : "Play"}
            className="flex h-8 w-8 items-center justify-center rounded border border-line bg-panel-2 text-paper transition-colors hover:border-tungsten hover:text-tungsten"
          >
            {playing ? (
              <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
                <path d="M2 1h2.5v9H2zM6.5 1H9v9H6.5z" fill="currentColor" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
                <path d="M2.5 1l7 4.5-7 4.5z" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>

        <div className="ml-auto flex items-center gap-3 text-[10px] text-dim">
          <span className="font-mono">{width}×{height}</span>
          <span className="font-mono">{fps}p</span>
          <span className="font-mono">
            {version > 0 ? `v${version}` : "draft"}
          </span>
          {playing && (
            <span className="flex items-center gap-1.5 text-tungsten">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-tungsten" />
              playing
            </span>
          )}
        </div>
      </div>

      {/* Scrubber with the playhead, plus the plan's beats as real blocks. */}
      <div className="relative mt-2.5 h-8 select-none">
        <div className="absolute inset-x-0 top-0 h-3 overflow-hidden rounded-xs border border-line-soft bg-panel-2">
          {plan?.beats?.map((b, i) => {
            const left = duration > 0 ? (b.from / duration) * 100 : 0
            const w = duration > 0 ? ((b.to - b.from) / duration) * 100 : 0
            return (
              <div
                key={i}
                className="absolute top-0 h-full border-l border-tungsten/60 bg-tungsten/12"
                style={{ left: `${Math.min(100, left)}%`, width: `${Math.max(0.4, Math.min(100 - left, w))}%` }}
                title={b.what}
              />
            )
          })}
        </div>

        <div className="absolute inset-x-0 top-0 h-3">
          <div className="playhead" style={{ left: `${pct}%` }} />
        </div>

        <input
          type="range"
          min={0}
          max={Math.max(1, duration - 1)}
          value={frame}
          onChange={(e) => player?.seekTo(Number(e.target.value))}
          aria-label="Scrub timeline"
          className="absolute inset-x-0 top-3 h-5 w-full cursor-pointer appearance-none bg-transparent
                     [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-2
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-xs
                     [&::-webkit-slider-thumb]:bg-paper
                     [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-2
                     [&::-moz-range-thumb]:rounded-xs [&::-moz-range-thumb]:border-0
                     [&::-moz-range-thumb]:bg-paper"
        />
      </div>

      {plan && (
        <p className="mt-1 truncate text-[11px] text-muted" title={plan.intent}>
          <span className="text-paper">{plan.title}</span> — {plan.intent}
        </p>
      )}
    </div>
  )
}

function TransportButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded border border-line bg-panel-2 text-paper transition-colors hover:border-tungsten hover:text-tungsten"
    >
      {children}
    </button>
  )
}

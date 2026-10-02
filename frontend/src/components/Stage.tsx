import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react"
import type { PlayerRef } from "@remotion/player"
import type { CompileError } from "~/remotion-code/compile"
import { CANVAS, type MotionPlan } from "~/lib/composition"
import { timecode } from "~/lib/timecode"

const { width, height, fps } = CANVAS

/**
 * The Player and the whole compile pipeline are ~800kB together and are needed
 * only once there is a cut on the stage. Loading them on demand keeps the first
 * paint — the chat, which is what the user is waiting on — small.
 */
const Player = lazy(() => import("@remotion/player").then((m) => ({ default: m.Player })))
const compile = (source: string) => import("~/remotion-code/compile").then((m) => m.compile(source))

interface Props {
  code: string
  plan: MotionPlan | null
  version: number
  /** Bumped by the caller whenever new code lands, to force a recompile. */
  reloadKey: string
}

type State =
  | { kind: "empty" }
  | { kind: "compiling" }
  | { kind: "ready"; Component: React.ComponentType<Record<string, unknown>> }
  | { kind: "error"; message: string; line?: number }

/**
 * The stage.
 *
 * The composition is compiled in the browser and mounted in Remotion's own
 * Player, so what is on screen is the real render path — the same
 * useCurrentFrame/interpolate code that will export, not an approximation.
 */
export function Stage({ code, plan, version, reloadKey }: Props) {
  const [state, setState] = useState<State>({ kind: "empty" })
  // A callback ref rather than useRef: the Player is lazily loaded, so the
  // instance does not exist on first render. A callback ref hands it over the
  // moment it mounts, which is what lets the timecode subscribe.
  const [player, setPlayer] = useState<PlayerRef | null>(null)
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)

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
    compile(code)
      .then((r) => {
        if (cancelled) return
        setState({ kind: "ready", Component: r.component })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const ce = err as CompileError
        setState({ kind: "error", message: ce?.message ?? String(err), line: ce?.line })
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

  // The Player is an event emitter rather than a props-driven component, so the
  // timecode and playhead are wired to its events.
  useEffect(() => {
    if (!player) return

    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame)
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
  }, [player])

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2" aria-label="Stage">
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-line bg-black">
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

        {state.kind === "ready" && (
          <Suspense fallback={<p className="eyebrow">loading player…</p>}>
          <Player
            ref={setPlayer}
            component={state.Component}
            durationInFrames={duration}
            fps={fps}
            compositionWidth={width}
            compositionHeight={height}
            style={{ width: "100%", maxHeight: "100%" }}
            className="max-h-full w-full"
            controls={false}
            acknowledgeRemotionLicense
            errorFallback={({ error }) => (
              <div className="max-w-md px-6 text-center">
                <p className="eyebrow mb-2 text-bad">runtime error</p>
                <p className="font-mono text-xs leading-relaxed text-muted">
                  {String((error as { message?: string })?.message ?? error)}
                </p>
              </div>
            )}
          />
          </Suspense>
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

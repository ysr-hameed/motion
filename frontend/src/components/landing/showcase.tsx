import { useState } from "react"
import { Pause, Play } from "lucide-react"
import { Player } from "@remotion/player"
import { CodeComposition } from "@/remotion-code/CodeComposition"
import { SHOWCASE } from "@/remotion-code/showcase"
import { SectionHeading } from "@/components/landing/section-heading"
import { navigate } from "@/lib/router"
import { stashPendingPrompt } from "@/lib/use-motion-studio"

export function Showcase() {
  const [paused, setPaused] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  )
  const open = (prompt: string) => {
    stashPendingPrompt(prompt, "16:9")
    navigate("/playground")
  }

  return (
    <section id="showcase" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          eyebrow="Showcase"
          title="Rendered live, ready to remix"
          sub="Real compositions rendered in your browser — not mockups. Select any style to start from it."
        />
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setPaused((v) => !v)}
            aria-pressed={paused}
            className="interactive inline-flex min-h-[44px] items-center gap-1.5 rounded-full border bg-card px-4 py-2 text-xs font-medium text-muted-foreground shadow-elev-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
            {paused ? "Play previews" : "Pause previews"}
          </button>
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SHOWCASE.map((c) => (
            <article key={c.style}>
              <button
                type="button"
                onClick={() => open(c.prompt)}
                aria-label={`Remix the ${c.style} style — ${c.meta}`}
                className="group block w-full overflow-hidden rounded-xl border bg-zinc-950 text-left shadow-elev-2 transition-all duration-300 [transition-timing-function:var(--ease-out-soft)] hover:-translate-y-1 hover:border-primary/40 hover:shadow-elev-4 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {paused ? (
                  <span className="flex aspect-video w-full items-center justify-center text-xs text-zinc-400">
                    Paused — select to remix {c.style}
                  </span>
                ) : (
                  <Player
                    component={CodeComposition}
                    inputProps={{ code: c.code }}
                    durationInFrames={c.frames}
                    compositionWidth={1920}
                    compositionHeight={1080}
                    fps={30}
                    // No controls / clickToPlay: the Player's own play
                    // button would nest a <button> inside this card's
                    // outer <button> (hydration error). The card itself
                    // is the single interactive element.
                    controls={false}
                    clickToPlay={false}
                    autoPlay={!paused}
                    loop
                    acknowledgeRemotionLicense
                    errorFallback={() => (
                      <div className="flex h-full items-center justify-center text-xs text-zinc-400">
                        Preview unavailable
                      </div>
                    )}
                    style={{ width: "100%" }}
                  />
                )}
              </button>
              <div className="mt-2.5 flex items-baseline justify-between px-0.5">
                <h3 className="text-sm">{c.style}</h3>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {c.meta}
                </p>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-8 text-center text-[13px] text-muted-foreground">
          Every clip is standard Remotion code. Open any version and select{" "}
          <span className="font-mono text-foreground/80">{"</>"}</span> to inspect
          the source.
        </p>
      </div>
    </section>
  )
}

import { Player } from "@remotion/player"
import { CodeComposition } from "@/remotion-code/CodeComposition"
import { SHOWCASE } from "@/remotion-code/showcase"
import { SectionHeading } from "@/components/landing/section-heading"
import { navigate } from "@/lib/router"
import { stashPendingPrompt } from "@/lib/use-motion-studio"

/**
 * Real rendered motion — small live Remotion players running real
 * compositions, not mockups. These are the same files the runtime mounts
 * for a generated cut, so this strip is a live check that the compiler
 * works. Clicking one hands its prompt to the playground.
 */
export function Showcase() {
  const open = (prompt: string) => {
    stashPendingPrompt(prompt, "16:9")
    navigate("/playground")
  }

  return (
    <section id="showcase" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          eyebrow="Showcase"
          title="Real motion, rendered live"
          sub="Every cut is Remotion code written for your brief and rendered in your browser. Click any of these to remix it."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SHOWCASE.map((c) => (
            <article key={c.style}>
              <button
                type="button"
                onClick={() => open(c.prompt)}
                aria-label={`Remix the ${c.style} style`}
                className="group block w-full overflow-hidden rounded-3xl border bg-neutral-950 text-left transition-all duration-300 hover:-translate-y-1 hover:border-primary/40"
              >
                <Player
                  component={CodeComposition}
                  inputProps={{ code: c.code }}
                  durationInFrames={c.frames}
                  compositionWidth={1920}
                  compositionHeight={1080}
                  fps={30}
                  controls={false}
                  autoPlay
                  loop
                  clickToPlay={false}
                  acknowledgeRemotionLicense
                  errorFallback={() => (
                    <div className="flex h-full items-center justify-center text-xs text-red-300/70">
                      Preview unavailable
                    </div>
                  )}
                  style={{ width: "100%" }}
                />
              </button>
              <div className="mt-3 flex items-baseline justify-between px-1">
                <h3 className="text-base font-bold">{c.style}</h3>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {c.meta}
                </p>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Every one of these is ordinary Remotion — imports, hooks, sequences.
          Open any cut you make and press{" "}
          <span className="font-mono text-foreground/80">{"</>"}</span> to read
          the source.
        </p>
      </div>
    </section>
  )
}

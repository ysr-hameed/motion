import { Player } from "@remotion/player"
import { CodeComposition } from "@/remotion-code/CodeComposition"
import { SHOWCASE } from "@/remotion-code/showcase"
import { SectionHeading } from "@/components/landing/section-heading"
import { navigate } from "@/lib/router"
import { stashPendingPrompt } from "@/lib/use-motion-studio"

export function Showcase() {
  const open = (prompt: string) => {
    stashPendingPrompt(prompt, "16:9")
    navigate("/playground")
  }

  return (
    <section id="showcase" className="scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          eyebrow="Showcase"
          title="Rendered live, ready to remix"
          sub="Real compositions rendered in your browser — not mockups. Select any style to start from it."
        />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SHOWCASE.map((c) => (
            <article key={c.style}>
              <button
                type="button"
                onClick={() => open(c.prompt)}
                aria-label={`Remix the ${c.style} style`}
                className="group block w-full overflow-hidden rounded-xl border bg-zinc-950 text-left transition-colors hover:border-primary/40"
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
                    <div className="flex h-full items-center justify-center text-xs text-zinc-400">
                      Preview unavailable
                    </div>
                  )}
                  style={{ width: "100%" }}
                />
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

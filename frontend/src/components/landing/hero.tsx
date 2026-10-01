import { useState } from "react"
import { ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { PromptBox } from "@/components/prompt-box"
import { stashPendingPrompt } from "@/lib/use-motion-studio"
import { navigate } from "@/lib/router"
import { filesToAttachments, type Attachment } from "@/lib/attachments"

const STYLES = [
  "Kinetic type",
  "Glitch",
  "Lower thirds",
  "Countdown",
  "Particles",
  "Waveform",
  "Neon",
  "Paper cut",
]

const PROOF = [
  { value: "12s", label: "Median time to first cut" },
  { value: "40+", label: "Broadcast-ready styles" },
  { value: "4K", label: "MP4 + transparent WebM" },
]

export function Hero() {
  const [staged, setStaged] = useState<Attachment[]>([])

  const stageFiles = async (files: FileList) => {
    const next = await filesToAttachments(files, staged.length)
    if (next.length > 0) setStaged((s) => [...s, ...next].slice(0, 4))
  }

  const handleGenerate = (prompt: string, format: string, secs: number) => {
    stashPendingPrompt(prompt, format, staged, undefined, secs)
    setStaged([])
    navigate("/playground")
  }

  return (
    <section className="relative overflow-hidden pt-16">
      {/* Layered backdrop: grid, a primary aurora, and a soft vignette. The
          aurora is what stops this reading as "generic SaaS hero" — it gives
          the section a light source instead of a flat tint. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-grid opacity-70 [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,black,transparent)]" />
        <div className="absolute inset-x-0 top-0 h-72 bg-linear-to-b from-primary/[0.09] to-transparent" />
        <div className="absolute left-1/2 top-[-14rem] size-[38rem] -translate-x-1/2 rounded-full bg-primary/[0.13] blur-[120px]" />
        <div className="absolute right-[8%] top-24 size-[22rem] rounded-full bg-chart-2/[0.10] blur-[100px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_0%,transparent_40%,var(--color-background)_100%)]" />
      </div>

      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 pb-14 pt-14 text-center lg:pt-20">
        <Badge variant="secondary" className="animate-fade-up ring-gradient">
          AI motion graphics for video creators
        </Badge>
        <h1 className="max-w-2xl animate-fade-up text-balance text-4xl leading-[1.05] tracking-[-0.03em] sm:text-5xl lg:text-6xl [animation-delay:60ms]">
          Turn words into motion graphics
        </h1>
        <p className="max-w-xl animate-fade-up text-base leading-relaxed text-muted-foreground [animation-delay:120ms] sm:text-lg">
          Describe the clip you need. SlyxUp directs the design, timing and
          animation — then refines it with you in plain words until it is
          ready to export.
        </p>

        <div className="w-full max-w-2xl animate-fade-up text-left [animation-delay:180ms]">
          {/* lift + glow on focus: the composer is the single most important
              element on the page and should feel physically raised. */}
          <div className="rounded-[calc(var(--radius)+8px)] bg-linear-to-b from-primary/[0.06] to-transparent p-px transition-shadow duration-300 focus-within:shadow-glow">
            <PromptBox
              id="hero-generate"
              onGenerate={handleGenerate}
              attachments={staged}
              onAttachFiles={stageFiles}
              onRemoveAttachment={(id) =>
                setStaged((s) => s.filter((a) => a.id !== id))
              }
            />
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Free to try · No credit card · Exports to MP4 and WebM
          </p>
        </div>

        <dl className="mt-2 grid w-full max-w-2xl animate-fade-up grid-cols-3 divide-x divide-border overflow-hidden rounded-2xl border bg-card shadow-elev-2 [animation-delay:240ms]">
          {PROOF.map((s) => (
            <div key={s.label} className="flex flex-col px-4 py-4">
              <dt className="order-2 mt-1 text-[11px] leading-snug text-muted-foreground sm:text-xs">
                {s.label}
              </dt>
              <dd className="order-1 bg-linear-to-b from-foreground to-foreground/70 bg-clip-text text-xl font-semibold tabular-nums text-transparent sm:text-2xl">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="border-y bg-muted/50 py-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-2 px-4">
          {STYLES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                stashPendingPrompt(`Make a ${s.toLowerCase()} motion graphic`, "16:9")
                navigate("/playground")
              }}
              title={`Start a ${s} clip`}
              className="min-h-[36px] rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground interactive focus-ring hover:-translate-y-px hover:border-primary/40 hover:text-foreground hover:shadow-elev-1"
            >
              {s}
            </button>
          ))}
          <a
            href="/studio"
            className="inline-flex min-h-[36px] items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Try one <ArrowRight className="size-3" aria-hidden />
          </a>
        </div>
      </div>
    </section>
  )
}

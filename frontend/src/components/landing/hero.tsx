import { useState } from "react"
import { Layers, MonitorPlay, Sparkles, Zap } from "lucide-react"
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
const MARQUEE = [...STYLES, ...STYLES]
const STATS = [
  { icon: Zap, value: "15s", label: "Enough For Motion" },
  { icon: Layers, value: "No Limits", label: "Motion styles" },
  { icon: MonitorPlay, value: "4K", label: "Export Upto 4K" },
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
      {/* clean saas backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
        <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-muted/60 to-transparent" />
      </div>

      <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-4 pb-16 pt-12 text-center lg:pt-20">
        <Badge variant="secondary" className="gap-1.5">
          <Sparkles className="size-3" />
          SlyxUp Motion — AI motion designer
        </Badge>
        <h1 className="max-w-3xl text-4xl font-bold leading-[1.15] tracking-tight sm:text-5xl">
          Describe and{" "}
          <span className="text-primary">Let This Shake.</span>
        </h1>
        <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
          Your AI motion designer for video. Prompt a broadcast-ready clip,
          then chat to perfect the timing, text and style — no keyframes,
          ever.
        </p>

        <div className="w-full max-w-2xl">
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

        <dl className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {STATS.map((s) => (
            <div key={s.label} className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-full bg-secondary">
                <s.icon className="size-4 text-primary" />
              </span>
              <div className="text-left">
                <dt className="sr-only">{s.label}</dt>
                <dd className="font-display text-lg font-bold leading-none">
                  {s.value}
                </dd>
                <dd className="text-xs text-muted-foreground">{s.label}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>

      {/* style marquee */}
      <div className="relative border-y bg-muted/40 py-3">
        <div className="flex w-max gap-3 animate-marquee hover:[animation-play-state:paused]">
          {MARQUEE.map((s, i) => (
            <span
              key={i}
              aria-hidden={i >= STYLES.length || undefined}
              className="whitespace-nowrap rounded-full border bg-background px-4 py-1.5 text-xs font-medium text-muted-foreground"
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

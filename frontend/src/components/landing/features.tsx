import {
  Clapperboard,
  Film,
  Layers,
  MessagesSquare,
  Sparkles,
  Zap,
} from "lucide-react"
import { SectionHeading } from "@/components/landing/section-heading"

const FEATURES = [
  {
    icon: Sparkles,
    title: "Describe, get a first cut",
    text: "Type the shot in plain words. Timing, pacing and style are directed for you — a watchable version in seconds.",
  },
  {
    icon: MessagesSquare,
    title: "Refine in conversation",
    text: "Ask for changes the way you would brief an editor. Every note becomes a new saved version.",
  },
  {
    icon: Layers,
    title: "Transparent WebM export",
    text: "True alpha for overlays, lower thirds and transitions that sit cleanly over your footage.",
  },
  {
    icon: Zap,
    title: "Fast iteration",
    text: "From prompt to downloadable clip faster than opening a timeline — median first cut in 12 seconds.",
  },
  {
    icon: Clapperboard,
    title: "Every platform ratio",
    text: "16:9 for YouTube, 9:16 for Shorts and Reels, 1:1 for feeds. One prompt, all cuts.",
  },
  {
    icon: Film,
    title: "40+ directed styles",
    text: "Countdowns, glitches, waveforms, particles and more — each with considered timing out of the box.",
  },
]

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          eyebrow="Features"
          title="A complete clip workflow"
          sub="From the first sentence of your brief to a file sitting in your editor."
        />
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className="rounded-2xl border bg-card p-5 transition-colors hover:border-primary/30"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="size-4" />
              </span>
              <h3 className="mt-3 text-[15px]">{f.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

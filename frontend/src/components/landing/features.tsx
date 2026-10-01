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
    <section id="features" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          eyebrow="Features"
          title="A complete clip workflow"
          sub="From the first sentence of your brief to a file sitting in your editor."
        />
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            // Lift + gradient icon chip. Staggered entrance (capped at 6
            // steps) so the grid assembles instead of snapping in at once.
            <article
              key={f.title}
              style={{ animationDelay: `${Math.min(i, 5) * 60}ms` }}
              className="group animate-fade-up rounded-2xl border bg-card p-5 shadow-elev-1 transition-all duration-300 [transition-timing-function:var(--ease-out-soft)] hover:-translate-y-1 hover:border-primary/30 hover:shadow-elev-3"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-linear-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-inset ring-primary/15 transition-transform duration-300 [transition-timing-function:var(--ease-spring)] group-hover:scale-105">
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

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
    title: "AI motion designer",
    text: "Describe the shot in plain words and get a directed first cut — timing, pacing and style handled. Then keep chatting until it's exactly right.",
    span: "sm:col-span-2",
  },
  {
    icon: MessagesSquare,
    title: "Chat to refine",
    text: "“Punchier impact frame.” “Hold the title longer.” Every note becomes a new version in seconds.",
    span: "",
  },
  {
    icon: Layers,
    title: "Transparent WebM export",
    text: "Real alpha for overlays, lower thirds and transitions that sit cleanly over your footage.",
    span: "",
  },
  {
    icon: Zap,
    title: "12-second median render",
    text: "From prompt to downloadable clip faster than opening After Effects.",
    span: "",
  },
  {
    icon: Clapperboard,
    title: "Every format, every platform",
    text: "16:9 for YouTube, 9:16 for Shorts and Reels, 1:1 for feeds — one prompt, all cuts.",
    span: "",
  },
  {
    icon: Film,
    title: "40+ motion styles",
    text: "Countdowns, glitches, waveforms, particles, paper cuts and more — each with broadcast-ready timing.",
    span: "sm:col-span-2",
  },
]

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          eyebrow="Features"
          title="Everything you need to ship motion"
          sub="A complete clip pipeline — from the first word of your prompt to a file sitting in your editor."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className={`group rounded-3xl border-1 hover:shadow-[0_0_60px_-28px_var(--color-primary)] transition-all duration-300 focus-within:border-primary/50 bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 focus-visible:-translate-y-1 focus-visible:border-primary/40 focus-visible:outline-none ${f.span}`}
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-secondary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-base font-bold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

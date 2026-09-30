import { SectionHeading } from "@/components/landing/section-heading"

const STEPS = [
  {
    n: "01",
    title: "Describe it",
    text: "Type what you need — “5-second neon countdown, 9:16”. Pick a style or let Motion AI suggest one.",
  },
  {
    n: "02",
    title: "Generate the cut",
    text: "Motion AI directs your first version in about 12 seconds — design, timing and animation included.",
  },
  {
    n: "03",
    title: "Chat it perfect",
    text: "Give notes in plain words, get a new version each time. Export 4K MP4, or transparent WebM straight into your editor.",
  },
]

export function HowItWorks() {
  return (
    <section className="border-y bg-muted/40 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          eyebrow="How it works"
          title="Prompt, generate, refine"
          sub="Three steps between you and motion graphics in your next video."
        />
        <ol className="mt-12 grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="rounded-3xl border bg-background p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40"
            >
              <span className="font-display text-sm font-bold text-primary">
                {s.n}
              </span>
              <h3 className="mt-2 text-base font-bold">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

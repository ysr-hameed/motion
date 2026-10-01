import { SectionHeading } from "@/components/landing/section-heading"

const STEPS = [
  {
    n: "1",
    title: "Describe the clip",
    text: "Type what you need — “5-second neon countdown, 9:16”. Pick a style or let Motion suggest one.",
  },
  {
    n: "2",
    title: "Review the first cut",
    text: "Motion directs version 1 in seconds — design, timing and animation included. It opens in the editor.",
  },
  {
    n: "3",
    title: "Refine and export",
    text: "Give notes in plain words, compare versions, then export MP4 or transparent WebM.",
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-y bg-muted/50 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          eyebrow="How it works"
          title="Prompt, review, refine"
          sub="Three steps between you and motion graphics in your next video."
        />
        <ol className="mt-10 grid gap-3 md:grid-cols-3">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="group rounded-2xl border bg-card p-5 shadow-elev-1 transition-all duration-300 [transition-timing-function:var(--ease-out-soft)] hover:-translate-y-1 hover:shadow-elev-3"
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-linear-to-br from-primary to-primary/80 text-[13px] font-semibold tabular-nums text-primary-foreground shadow-elev-1 transition-transform duration-300 [transition-timing-function:var(--ease-spring)] group-hover:scale-110">
                {s.n}
              </span>
              <h3 className="mt-3 text-[15px]">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

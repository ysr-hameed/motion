import { useState } from "react"
import { Plus } from "lucide-react"
import { SectionHeading } from "@/components/landing/section-heading"
import { cn } from "@/lib/utils"

const FAQS = [
  {
    q: "What exactly does Motion generate?",
    a: "Short, broadcast-ready motion graphic clips — intros, countdowns, lower thirds, transitions, lyric punches and loops. You describe the moment in plain words, Motion AI directs the design, timing and animation.",
  },
  {
    q: "How does chat editing work?",
    a: "Every generation opens a thread with Motion AI. Give notes like “punchier impact frame” or “hold the title longer” and you get a new version in seconds. Full version history is kept, so you can jump back to any cut.",
  },
  {
    q: "Which formats and resolutions can I export?",
    a: "MP4 and WebM at 720p, 1080p or 4K, at 24, 30 or 60 fps. 16:9, 9:16 and 1:1 aspect ratios are all one-click cuts from the same prompt.",
  },
  {
    q: "Can I use the clips commercially?",
    a: "Paid plans include full commercial rights with no attribution required — monetized videos, client work and ads. The free Starter plan covers personal, non-commercial projects.",
  },
  {
    q: "Do I need motion design experience?",
    a: "No. If you can describe the clip, you can make it. Advanced controls for timing, easing and typography are there when you want them — invisible when you don't.",
  },
  {
    q: "How does the alpha channel export work?",
    a: "Export WebM and the composition's transparent background is kept, so lower thirds and overlays composite cleanly in Premiere, Resolve, Final Cut or CapCut. MP4 is for delivery and flattens to the background colour.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Monthly plans cancel in one click and stay active until the end of the billing period. Your generated clips remain downloadable.",
  },
]

function Item({
  q,
  a,
  open,
  onToggle,
  index,
}: {
  q: string
  a: string
  open: boolean
  onToggle: () => void
  index: number
}) {
  const panelId = `faq-panel-${index}`
  return (
    <div className="rounded-3xl border bg-card px-6 transition-colors">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
      >
        <span className="text-sm font-bold">{q}</span>
        <span
          aria-hidden
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary transition-transform",
            open && "rotate-45 bg-primary text-primary-foreground"
          )}
        >
          <Plus className="size-4" />
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        inert={!open}
        className={cn(
          "grid transition-all",
          open ? "grid-rows-[1fr] pb-5 opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <p className="overflow-hidden text-sm text-muted-foreground">{a}</p>
      </div>
    </div>
  )
}

export function Faq() {
  const [open, setOpen] = useState(0)
  return (
    <section id="faq" className="scroll-mt-20 bg-muted/40 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4">
        <SectionHeading
          eyebrow="FAQ"
          title="Questions, answered"
          sub="Everything creators usually ask before their first render."
        />
        <div className="mt-12 flex flex-col gap-3">
          {FAQS.map((f, i) => (
            <Item
              key={f.q}
              q={f.q}
              a={f.a}
              index={i}
              open={open === i}
              onToggle={() => setOpen(open === i ? -1 : i)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

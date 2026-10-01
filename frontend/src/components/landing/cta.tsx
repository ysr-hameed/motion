import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

export function Cta() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <div className="relative overflow-hidden rounded-2xl border bg-zinc-950 px-6 py-14 text-center shadow-elev-4 sm:py-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-grid-dark opacity-60"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-48 w-[36rem] -translate-x-1/2 rounded-full bg-primary/30 blur-3xl"
          />
          <div className="relative mx-auto flex max-w-xl flex-col items-center gap-4">
            <h2 className="bg-linear-to-b from-white to-zinc-400 bg-clip-text text-2xl text-transparent sm:text-3xl">
              Make your next video move
            </h2>
            <p className="text-[15px] text-zinc-400">
              Describe your first clip — free, no credit card, no keyframes.
            </p>
            <Button size="lg" variant="glow" asChild>
              <a href="/studio">
                <Sparkles />
                Start creating
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

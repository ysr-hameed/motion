import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

export function Cta() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4">
        <div className="relative overflow-hidden rounded-3xl border bg-card px-6 py-16 text-center sm:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,black,transparent)]"
          />
          <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-5">
            <h2 className="text-2xl font-bold tracking-tight sm:text-4xl">
              Your next video deserves better than a static title.
            </h2>
            <p className="text-muted-foreground">
              Prompt your first clip free, then chat it perfect. No credit
              card, no keyframes.
            </p>
            <Button size="lg" asChild>
              <a href="#hero-generate">
                <Sparkles />
                Generate your first clip
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

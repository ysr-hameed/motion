import { Check } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SectionHeading } from "@/components/landing/section-heading"
import { navigate } from "@/lib/router"
import { cn } from "@/lib/utils"

const PLANS = [
  {
    name: "Starter",
    price: "$0",
    per: "free forever",
    cta: "Start free",
    action: () => navigate("/signup"),
    featured: false,
    features: [
      "10 clips per month",
      "720p MP4 export",
      "16:9 and 1:1 formats",
      "Community styles",
    ],
  },
  {
    name: "Pro",
    price: "$19",
    per: "per month",
    cta: "Go Pro",
    action: () => navigate("/signup"),
    featured: true,
    features: [
      "500 clips per month",
      "4K + transparent WebM export",
      "All formats incl. 9:16",
      "All 40+ motion styles",
      "No watermark",
      "Priority rendering",
    ],
  },
  {
    name: "Studio",
    price: "$49",
    per: "per month",
    cta: "Contact sales",
    action: () => {
      window.location.href = "mailto:hello@slyxup.com"
    },
    featured: false,
    features: [
      "Unlimited clips",
      "Everything in Pro",
      "Team workspace + seats",
      "API access",
      "Custom brand styles",
    ],
  },
]

export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          eyebrow="Pricing"
          title="Pays for itself in one video"
          sub="Start free. Upgrade when your upload schedule demands it."
        />
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {PLANS.map((p) => (
            <article
              key={p.name}
              className={cn(
                "relative flex flex-col rounded-3xl border bg-card p-7 transition-all duration-300 hover:-translate-y-1",
                p.featured && "border-primary shadow-xl shadow-primary/10"
              )}
            >
              {p.featured && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                  Most popular
                </Badge>
              )}
              <h3 className="text-base font-bold">{p.name}</h3>
              <p className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-4xl font-bold">
                  {p.price}
                </span>
                <span className="text-sm text-muted-foreground">{p.per}</span>
              </p>
              <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                className="mt-7 w-full"
                variant={p.featured ? "default" : "outline"}
                onClick={p.action}
              >
                {p.cta}
              </Button>
            </article>
          ))}
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Free plan covers personal projects · Cancel in one click, keep your
          clips · No credit card to start.
        </p>
        </div>
      </div>
    </section>
  )
}

import { Check } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SectionHeading } from "@/components/landing/section-heading"
import { navigate } from "@/lib/router"
import { cn } from "@/lib/utils"

const PLANS = [
  {
    name: "Starter",
    price: 0,
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
    price: 19,
    per: "per month",
    cta: "Start 7-day trial",
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
    price: 49,
    per: "per month",
    cta: "Contact sales",
    action: () => {
      window.location.href = "mailto:hello@slyxup.com?subject=Studio%20plan%20inquiry"
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
    <section id="pricing" className="scroll-mt-20 border-t bg-muted/50 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          eyebrow="Pricing"
          title="Simple plans that scale"
          sub="Start free. Upgrade when your upload schedule demands it."
        />
        <div className="mx-auto mt-10 grid max-w-4xl gap-3 lg:grid-cols-3">
          {PLANS.map((p) => (
            <article
              key={p.name}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-card p-6",
                p.featured && "border-primary/40 shadow-lg shadow-primary/10"
              )}
            >
              {p.featured && (
                <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                  Most popular
                </Badge>
              )}
              <h3 className="text-sm font-semibold">{p.name}</h3>
              <p className="mt-2 flex items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-tight tabular-nums">
                  {new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(p.price)}
                </span>
                <span className="text-sm text-muted-foreground">{p.per}</span>
              </p>
              <ul className="mt-5 flex flex-1 flex-col gap-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="mt-6 w-full"
                variant={p.featured ? "default" : "outline"}
                onClick={p.action}
              >
                {p.cta}
              </Button>
            </article>
          ))}
        </div>
        <p className="mt-6 text-center text-[13px] text-muted-foreground">
          Cancel anytime and keep your clips · No credit card to start
        </p>
      </div>
    </section>
  )
}

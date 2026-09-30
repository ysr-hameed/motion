import { SiteHeader } from "@/components/landing/site-header"
import { Hero } from "@/components/landing/hero"
import { Features } from "@/components/landing/features"
import { HowItWorks } from "@/components/landing/how-it-works"
import { Showcase } from "@/components/landing/showcase"
import { Pricing } from "@/components/landing/pricing"
import { Faq } from "@/components/landing/faq"
import { Cta } from "@/components/landing/cta"
import { SiteFooter } from "@/components/landing/site-footer"

export function LandingPage() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <SiteHeader />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Showcase />
        <Pricing />
        <Faq />
        <Cta />
      </main>
      <SiteFooter />
    </div>
  )
}

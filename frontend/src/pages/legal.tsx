import { SiteHeader } from "@/components/landing/site-header"
import { SiteFooter } from "@/components/landing/site-footer"

function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-28">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Updated {updated}</p>
        <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-bold text-foreground">{children}</h2>
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="September 2026">
      <p>
        SlyxUp Motion collects the minimum data needed to run the service:
        your account details, the prompts you submit, and the clips you
        generate. We never sell your personal data.
      </p>
      <H>What we store</H>
      <p>
        Account email and name, project prompts and threads, render settings,
        and basic usage metrics that help us keep generation fast and
        reliable.
      </p>
      <H>What we never do</H>
      <p>
        We don't sell data, run ads against your content, or train shared
        models on private projects. Your clips remain yours.
      </p>
      <H>Your rights</H>
      <p>
        Export or delete your data at any time from Settings, or write to
        privacy@slyxup.com and we'll handle it within 30 days.
      </p>
    </LegalLayout>
  )
}

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" updated="September 2026">
      <p>
        By using SlyxUp Motion you agree to these terms. The service is
        provided as-is while in development, and these terms will be
        finalized before general availability.
      </p>
      <H>Your content</H>
      <p>
        You own the clips you generate. On paid plans this includes full
        commercial rights with no attribution required. The free plan covers
        personal, non-commercial projects.
      </p>
      <H>Fair use</H>
      <p>
        Don't abuse generation queues, resell raw API access, or generate
        content that infringes on others' rights. Accounts in violation may
        be limited or removed.
      </p>
      <H>Licensing</H>
      <p>
        Templates and styles provided by SlyxUp are licensed to you as part
        of your subscription for use inside your own videos.
      </p>
      <H>Billing</H>
      <p>
        Monthly plans renew automatically and can be cancelled in one click.
        Cancelled plans stay active until the end of the billing period, and
        generated clips remain downloadable.
      </p>
    </LegalLayout>
  )
}

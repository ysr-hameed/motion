import { PublicShell } from "~/components/layout";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      <div className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function Terms() {
  return (
    <PublicShell>
      <article className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-dim">Last updated October 2026</p>
        <Section title="1. The service">
          <p>SlyxUp Motion turns text briefs into motion graphics rendered in your browser and exported to video. Free accounts get 5 compositions per month at 720p with watermark; paid plans lift those limits as listed on the pricing page.</p>
        </Section>
        <Section title="2. Your content">
          <p>You own what you create, including client work. You are responsible for having rights to logos, footage and music you upload. We may remove content that infringes or is unlawful.</p>
        </Section>
        <Section title="3. Acceptable use">
          <p>No reselling raw API access outside your plan, no circumventing quotas, no uploading malware, and no generating content that is hateful, deceptive or illegal.</p>
        </Section>
        <Section title="4. Billing">
          <p>Subscriptions bill via Paddle, renew automatically, and can be cancelled anytime — paid features run to the end of the period. Refunds follow Paddle's policy within 14 days of charge.</p>
        </Section>
        <Section title="5. Availability">
          <p>We target 99.5% monthly availability excluding planned maintenance. AI generation depends on third-party model providers; paced or queued turns during peak load are not downtime.</p>
        </Section>
        <Section title="6. Changes">
          <p>Material changes are announced 14 days ahead in the changelog. Continued use after that is acceptance.</p>
        </Section>
      </article>
    </PublicShell>
  );
}

import { PublicShell } from "~/components/layout";

export default function Privacy() {
  return (
    <PublicShell>
      <article className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-dim">Last updated October 2026</p>
        <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-muted">
          <section>
            <h2 className="text-lg font-bold tracking-tight text-paper">What we collect</h2>
            <p className="mt-2">Account identity (email, name) via SlyxUp Stack auth; your compositions, projects, brand kits and exports; billing status via Paddle (we never see card numbers); basic request logs for reliability.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold tracking-tight text-paper">What we never do</h2>
            <p className="mt-2">No sale of personal data, no third-party ad trackers, no training of shared models on your private compositions.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold tracking-tight text-paper">Where data lives</h2>
            <p className="mt-2">Cloudflare D1 (product data), R2 (your uploads and exports) and the Stack auth service (identity). Regions follow Cloudflare's placement.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold tracking-tight text-paper">Your rights</h2>
            <p className="mt-2">Export or delete your Motion data anytime from Settings → Danger Zone (deletion is immediate and irreversible). Contact hello@slyxup.com for access or correction requests.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold tracking-tight text-paper">Cookies</h2>
            <p className="mt-2">A session cookie only where the app runs same-origin, plus a tab-scoped session token. No analytics cookies.</p>
          </section>
        </div>
      </article>
    </PublicShell>
  );
}

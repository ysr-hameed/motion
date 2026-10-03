import { PublicShell } from "~/components/layout";

const ENTRIES: Array<[string, string, string[]]> = [
  ["0.3.0", "Oct 2026", [
    "Full accounts: Stack auth, teams, API keys, Paddle billing with live entitlements.",
    "Preview reliability: stale-tab detection with one-click reload, immutable asset caching.",
    "Public pages: pricing on real plans, docs, status, contact inbox.",
  ]],
  ["0.2.0", "Oct 2026", [
    "Routed app: marketing site, custom auth screens, studio, projects, billing.",
    "Chat agent on Durable Objects with 50+ motion tools and version history.",
  ]],
  ["0.1.0", "Sep 2026", [
    "First studio prototype: chat-to-composition with browser preview.",
  ]],
];

export default function Changelog() {
  return (
    <PublicShell>
      <article className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-3xl font-bold tracking-tight">Changelog</h1>
        {ENTRIES.map(([version, date, items]) => (
          <section key={version} className="mt-8 rounded-md border border-line bg-panel p-5">
            <p className="flex items-baseline gap-3">
              <span className="font-mono font-semibold text-tungsten">v{version}</span>
              <span className="text-xs text-dim">{date}</span>
            </p>
            <ul className="mt-3 flex flex-col gap-1.5 text-sm text-muted">
              {items.map((i) => (
                <li key={i}>• {i}</li>
              ))}
            </ul>
          </section>
        ))}
      </article>
    </PublicShell>
  );
}

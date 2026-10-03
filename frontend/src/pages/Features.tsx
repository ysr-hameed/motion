import { Link } from "react-router-dom";
import { PublicShell } from "~/components/layout";

const GROUPS: Array<[string, string[]]> = [
  ["AI Tools", ["Intent understanding", "Smart defaults", "Style transfer"]],
  ["Motion", ["50+ presets", "Spring physics", "Camera moves", "Text animators"]],
  ["Assets", ["Stock search", "Auto-optimize", "Font pairing", "Brand kit"]],
  ["Export", ["9 platform presets", "CDN URLs", "Embed codes", "Batch export"]],
  ["Collaboration", ["Share links", "Frame comments", "Version history", "Teams"]],
];

export default function Features() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h1 className="max-w-2xl text-3xl font-bold tracking-tight md:text-4xl">
          Everything you need to create professional motion graphics
        </h1>
        <p className="mt-3 max-w-xl text-muted">
          SlyxUp Motion vs the old way: 60 seconds instead of 2–4 hours, no
          expert skills, $29/mo instead of $240/yr.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {GROUPS.map(([title, items]) => (
            <div key={title} className="rounded-md border border-line bg-panel p-5">
              <p className="font-semibold">{title}</p>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-muted">
                {items.map((i) => (
                  <li key={i}>✓ {i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10">
          <h2 className="text-xl font-bold tracking-tight">SlyxUp vs the old way</h2>
          <div className="mt-4 overflow-x-auto rounded-md border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-dim">
                  <th className="p-3"> </th>
                  <th className="p-3 text-tungsten">SlyxUp</th>
                  <th className="p-3">After Effects</th>
                  <th className="p-3">Canva</th>
                </tr>
              </thead>
              <tbody className="text-muted">
                {[
                  ["Time to create", "60s", "2–4 hours", "30 min"],
                  ["Skill required", "None", "Expert", "Basic"],
                  ["Output quality", "Pro", "Pro", "Good"],
                  ["Price", "$29/mo", "$240/yr", "$120/yr"],
                ].map(([k, a, b, c]) => (
                  <tr key={k} className="border-b border-line-soft last:border-0">
                    <td className="p-3 text-paper">{k}</td>
                    <td className="p-3 font-semibold text-paper">{a}</td>
                    <td className="p-3">{b}</td>
                    <td className="p-3">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-xl font-bold tracking-tight">Integrations</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {["Figma", "Slack", "Zapier", "Notion", "Paddle", "Cloudflare R2"].map((i) => (
              <span key={i} className="rounded-full border border-line bg-panel px-3 py-1 text-xs text-muted">
                {i}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-10">
          <Link
            to="/signup"
            className="inline-flex h-11 items-center rounded-md bg-tungsten px-6 font-semibold text-ink hover:brightness-110"
          >
            Start Creating Free
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}

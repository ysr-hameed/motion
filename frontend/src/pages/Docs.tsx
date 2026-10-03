import { Link } from "react-router-dom";
import { PublicShell } from "~/components/layout";

const SECTIONS: Array<[string, string[]]> = [
  ["1. Write a brief", [
    "Open the Studio and describe the clip: subject, platform, length, mood.",
    "Attach a logo or reference image when you have one — the agent extracts palette and style from it.",
    "Answer the quick picks only for what the brief leaves open; everything else is auto-filled.",
  ]],
  ["2. Watch it build", [
    "Scenes stream into the player as they are written — no blank waiting.",
    "The timeline shows beats with real frame numbers; hover any block for its properties.",
    "Quality bars (motion, performance, accessibility) update live.",
  ]],
  ["3. Refine in plain English", [
    '"Make the logo entrance faster" or "change background to blue" — small edits, no rebuild.',
    "Click any timeline element to open its properties in the inspector.",
    "Every version is kept; roll back without losing history.",
  ]],
  ["4. Export and share", [
    "Pick a platform preset (IG Story, TikTok, YouTube…) or export the full bundle.",
    "Copy the CDN URL, grab the embed code, or share a watch link.",
    "Free exports carry a watermark and 30-day links; Pro links are permanent.",
  ]],
  ["Limits to know", [
    "Free: 5 compositions and 5 exports per calendar month, 720p.",
    "One composition per chat session; start a new session for a new cut.",
    "Clips run up to 30 seconds at 30fps by default.",
  ]],
];

export default function Docs() {
  return (
    <PublicShell>
      <article className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-bold tracking-tight">Docs</h1>
        <p className="mt-2 text-muted">Brief → preview → export in about a minute.</p>
        {SECTIONS.map(([title, items]) => (
          <section key={title} className="mt-8">
            <h2 className="text-lg font-bold tracking-tight">{title}</h2>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm leading-relaxed text-muted">
              {items.map((i) => (
                <li key={i}>• {i}</li>
              ))}
            </ul>
          </section>
        ))}
        <div className="mt-10">
          <Link to="/signup" className="inline-flex h-11 items-center rounded-md bg-tungsten px-6 font-semibold text-ink hover:brightness-110">
            Try it free
          </Link>
        </div>
      </article>
    </PublicShell>
  );
}

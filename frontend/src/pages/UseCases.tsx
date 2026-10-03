import { Link } from "react-router-dom";
import { PublicShell } from "~/components/layout";

const CASES = [
  ["Marketing & Advertising", "Scroll-stopping ads in minutes."],
  ["Social Media Content", "IG, TikTok, YT presets built in."],
  ["Product Launches", "Reveal moments with anticipation + settle."],
  ["Education & Training", "Tutorial intros and explainer cards."],
  ["Events & Announcements", "Countdowns and save-the-dates."],
  ["Branding & Identity", "Logo reveals in 10+ styles."],
];

export default function UseCases() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Use cases</h1>
        <p className="mt-3 max-w-xl text-muted">
          Six launch categories, each with templates you can apply in one click.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {CASES.map(([title, body]) => (
            <div key={title} className="rounded-md border border-line bg-panel p-5">
              <p className="font-semibold">{title}</p>
              <p className="mt-1 text-sm text-muted">{body}</p>
              <Link to="/templates" className="mt-3 inline-block text-sm text-tungsten hover:underline">
                Browse templates →
              </Link>
            </div>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}

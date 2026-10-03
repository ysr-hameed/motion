import { Link } from "react-router-dom";
import { PublicShell } from "~/components/layout";

export default function About() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
          Built for creators who don't have time to wait
        </h1>
        <p className="mt-4 text-muted">
          SlyxUp Motion turns a sentence into production-ready motion graphics:
          real Remotion code, validated before it ever hits the player, with
          spring physics and beat-aligned timing by default.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {["Speed", "Quality", "Accessibility", "Transparency"].map((v) => (
            <div key={v} className="rounded-md border border-line bg-panel p-4 text-center text-sm font-semibold">
              {v}
            </div>
          ))}
        </div>
        <div className="mt-8 flex gap-3">
          <Link
            to="/signup"
            className="inline-flex h-11 items-center rounded-md bg-tungsten px-6 font-semibold text-ink hover:brightness-110"
          >
            Start Creating Free
          </Link>
          <Link
            to="/contact"
            className="inline-flex h-11 items-center rounded-md border border-line px-6 hover:bg-panel"
          >
            Contact Us
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PublicShell } from "~/components/layout";

const TESTIMONIALS = [
  ["This is magic. I made 10 videos in an hour.", "Sarah Chen", "Marketing @ Acme Inc"],
  ["Our launch video took 60 seconds. Our agency quoted 3 weeks.", "Marcus Webb", "Founder, Loopwork"],
  ["The first AI tool whose output I didn't have to fix.", "Priya Nair", "Content Lead, Finch"],
  ["Beat-aligned cuts without touching a keyframe. Absurd.", "Diego Ramos", "YouTuber, 800k subs"],
  ["Brand kit in, on-brand ads out. It just works.", "Amara Okafor", "Growth @ Northbeam"],
  ["Cancelled our After Effects seats the same month.", "Jonas Lindqvist", "Creative Director"],
];

function Testimonials() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIndex((i) => (i + 1) % TESTIMONIALS.length), 4500);
    return () => clearInterval(t);
  }, []);
  const [quote, name, role] = TESTIMONIALS[index];
  return (
    <section className="border-t border-line bg-panel/40">
      <div className="mx-auto max-w-2xl px-4 py-14 text-center">
        <div className="flex justify-center gap-1.5" aria-label="Testimonials">
          {TESTIMONIALS.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Testimonial ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-tungsten" : "w-1.5 bg-line"}`}
            />
          ))}
        </div>
        <blockquote key={index} className="tick-in mt-6 text-xl font-medium leading-relaxed md:text-2xl">
          “{quote}”
        </blockquote>
        <p className="mt-4 text-sm text-muted">{name} · {role}</p>
      </div>
    </section>
  );
}

/** Homepage per FRONTEND_DESIGN_PLAN §3.1.1 — convert in 10 seconds. */
export default function Home() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-6xl px-4 py-20 text-center md:py-28">
        <p className="eyebrow mb-4">SlyxUp Motion</p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl">
          Motion Graphics in <span className="text-tungsten">60 Seconds</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted">
          No design skills required. Describe what you want — AI builds
          production-ready motion graphics.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            to="/signup"
            className="inline-flex h-11 items-center rounded-md bg-tungsten px-6 font-semibold text-ink hover:brightness-110"
          >
            Try Free
          </Link>
          <Link
            to="/demo"
            className="inline-flex h-11 items-center rounded-md border border-line px-6 text-paper hover:bg-panel"
          >
            ▶ Watch Demo
          </Link>
        </div>
        <p className="mt-6 text-xs text-dim">Free plan · 5 videos/month · No credit card</p>
      </section>

      <section className="border-t border-line bg-panel/40">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-14 md:grid-cols-4">
          {[
            ["AI Expert", "Describe, don't design. Intent understanding built in."],
            ["60s Turnaround", "Brief to preview in about a minute."],
            ["Pro Quality", "Spring physics, overlaps, beat-aligned timing."],
            ["Scale", "100 variations in minutes, 9 export presets."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-md border border-line bg-panel p-4">
              <p className="font-semibold">{title}</p>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-14 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Plans that scale with you</h2>
          <div className="mx-auto mt-6 grid max-w-3xl gap-4 text-left md:grid-cols-3">
            {[
              ["Free", "$0", "5 videos/mo · 720p"],
              ["Pro", "$29/mo", "Unlimited · 4K"],
              ["Business", "$99/mo", "Team · API · White-label"],
            ].map(([name, price, blurb]) => (
              <div key={name} className="rounded-md border border-line bg-panel p-4">
                <p className="font-semibold">{name}</p>
                <p className="mt-1 text-xl font-bold">{price}</p>
                <p className="mt-1 text-xs text-muted">{blurb}</p>
              </div>
            ))}
          </div>
          <Link to="/pricing" className="mt-6 inline-block text-sm text-tungsten hover:underline">
            See full plans →
          </Link>
        </div>
      </section>

      <Testimonials />

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-center text-2xl font-bold tracking-tight">How it works</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            ["1. Describe", "Type a brief or pick a template."],
            ["2. AI Creates", "Watch scenes build in real time."],
            ["3. Export", "MP4, WebM, GIF — 9 platform presets."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-md border border-line p-5 text-center">
              <p className="font-semibold">{title}</p>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link
            to="/signup"
            className="inline-flex h-11 items-center rounded-md bg-tungsten px-6 font-semibold text-ink hover:brightness-110"
          >
            Create Your First Video — Free
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}

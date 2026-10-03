import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Clapperboard,
  Cpu,
  Film,
  Layers,
  Play,
  Quote,
  Scissors,
  Sparkles,
  Timer,
  WandSparkles,
  Zap,
} from "lucide-react";
import { PublicShell } from "~/components/layout";
import { Badge } from "~/components/ui";

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
        <Quote size={20} className="mx-auto mt-6 text-tungsten" aria-hidden />
        <blockquote key={index} className="tick-in mt-3 text-xl font-medium leading-relaxed md:text-2xl">
          “{quote}”
        </blockquote>
        <p className="mt-4 text-sm text-muted">{name} · {role}</p>
      </div>
    </section>
  );
}

/** The product's own instrument as hero backdrop: beats on a scrubber. */
function ScrubberBackdrop() {
  const beats = [4, 12, 7, 16, 9, 13, 6, 18, 10, 14, 8, 11];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="drift absolute -top-32 left-1/2 h-96 w-[60rem] -translate-x-1/2 rounded-full bg-tungsten/10 blur-3xl" />
      <div className="absolute inset-x-0 bottom-8 mx-auto flex max-w-4xl items-end gap-1.5 px-6 opacity-40">
        {beats.map((h, i) => (
          <div
            key={i}
            className={`flex-1 rounded-sm ${i % 4 === 1 ? "bg-tungsten/70" : "bg-line"}`}
            style={{ height: `${h * 4}px` }}
          />
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-8 mx-auto max-w-4xl px-6">
        <div className="playhead" style={{ left: "62%" }} />
      </div>
    </div>
  );
}

const FEATURES = [
  {
    icon: WandSparkles,
    title: "Direct, don't design",
    body: "Describe the cut in words. The agent plans beats, writes Remotion code, and validates it.",
  },
  {
    icon: Timer,
    title: "60-second turnaround",
    body: "Brief to watchable preview in about a minute, with live reasoning and tool trace.",
  },
  {
    icon: Scissors,
    title: "Edit-suite precision",
    body: "Spring physics, overshoot, beat-aligned timing — the details that read as professional.",
  },
  {
    icon: Cpu,
    title: "7 directing models",
    body: "Free Ling and Laguna workhorses plus cheap Qwen tiers. Switch per session in Studio.",
  },
  {
    icon: Layers,
    title: "Versions, not drafts",
    body: "Every cut is versioned with ratings, render reports, and one-click restore.",
  },
  {
    icon: Film,
    title: "Export anywhere",
    body: "MP4, WebM, GIF across 9 platform presets, plus share links and CDN publish.",
  },
];

/** Homepage — convert in 10 seconds, then prove it. */
export default function Home() {
  return (
    <PublicShell>
      <section className="relative overflow-hidden">
        <ScrubberBackdrop />
        <div className="relative mx-auto max-w-6xl px-4 py-20 text-center md:py-28">
          <div className="rise-in mb-5 flex justify-center">
            <Badge tone="gold" icon={Sparkles}>
              7 AI models to direct · free tier live
            </Badge>
          </div>
          <p className="eyebrow mb-4">SlyxUp Motion</p>
          <h1 className="rise-in mx-auto max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl" style={{ animationDelay: "60ms" }}>
            Motion graphics in <span className="gold-text">60 seconds</span>
          </h1>
          <p className="rise-in mx-auto mt-4 max-w-xl text-lg text-muted" style={{ animationDelay: "120ms" }}>
            No design skills required. Describe what you want — an AI director
            builds production-ready motion graphics while you watch.
          </p>
          <div className="rise-in mt-8 flex items-center justify-center gap-3" style={{ animationDelay: "180ms" }}>
            <Link
              to="/signup"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-tungsten px-6 font-semibold text-ink hover:brightness-110"
            >
              Try Free
              <ArrowRight size={16} aria-hidden />
            </Link>
            <Link
              to="/demo"
              className="inline-flex h-11 items-center gap-2 rounded-md border border-line px-6 text-paper hover:bg-panel"
            >
              <Play size={15} aria-hidden />
              Watch Demo
            </Link>
          </div>
          <div className="rise-in mt-6 flex items-center justify-center gap-4 text-xs text-dim" style={{ animationDelay: "240ms" }}>
            {["Free plan", "5 videos/month", "No credit card"].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <BadgeCheck size={13} className="text-ok" aria-hidden />
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-panel/40">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="grid grid-cols-2 gap-6 text-center md:grid-cols-4">
            {[
              ["60s", "brief to preview"],
              ["61", "agent tools on call"],
              ["9", "export presets"],
              ["7", "directable models"],
            ].map(([n, label]) => (
              <div key={label}>
                <p className="font-display text-3xl font-bold text-paper">{n}</p>
                <p className="mt-1 text-xs text-muted">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <p className="eyebrow mb-2 text-center">Why Motion</p>
          <h2 className="text-center text-2xl font-bold tracking-tight md:text-3xl">
            An edit suite with a director inside
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="panel-lift card-hover p-5">
                <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-md border border-line bg-panel text-tungsten">
                  <f.icon size={17} aria-hidden />
                </span>
                <p className="font-semibold text-paper">{f.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-panel/40">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center">
          <p className="eyebrow mb-2">Pricing</p>
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Plans that scale with you</h2>
          <div className="mx-auto mt-8 grid max-w-3xl gap-4 text-left md:grid-cols-3">
            {[
              { name: "Free", price: "$0", blurb: "5 videos/mo · 720p · community support", icon: Zap },
              { name: "Pro", price: "$29", blurb: "Unlimited · 4K · brand kit · priority queue", icon: Clapperboard, hot: true },
              { name: "Business", price: "$99", blurb: "Team · API · white-label · dedicated support", icon: Layers },
            ].map((p) => (
              <div key={p.name} className={`panel-lift card-hover relative p-5 ${p.hot ? "border-tungsten/50" : ""}`}>
                {p.hot ? (
                  <span className="absolute -top-2.5 left-4 rounded-full bg-tungsten px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink">
                    Popular
                  </span>
                ) : null}
                <p className="flex items-center gap-2 font-semibold text-paper">
                  <p.icon size={15} className="text-tungsten" aria-hidden />
                  {p.name}
                </p>
                <p className="mt-1 text-2xl font-bold text-paper">
                  {p.price}
                  {p.price !== "$0" ? <span className="text-sm font-normal text-muted">/mo</span> : null}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{p.blurb}</p>
              </div>
            ))}
          </div>
          <Link
            to="/pricing"
            className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-tungsten hover:underline"
          >
            See full plans
            <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
      </section>

      <Testimonials />

      <section className="mx-auto max-w-6xl px-4 py-16">
        <p className="eyebrow mb-2 text-center">Workflow</p>
        <h2 className="text-center text-2xl font-bold tracking-tight md:text-3xl">How it works</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            ["01 · Describe", "Type a brief or pick a template. Casting, pacing, and style included."],
            ["02 · Direct", "Watch scenes build live. Nudge timing, copy, and camera mid-turn."],
            ["03 · Export", "MP4, WebM, GIF — tuned presets for every platform you publish to."],
          ].map(([title, body]) => (
            <div key={title} className="panel p-5 text-center">
              <p className="font-mono text-xs text-tungsten">{title.split(" · ")[0]}</p>
              <p className="mt-1 font-semibold text-paper">{title.split(" · ")[1]}</p>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link
            to="/signup"
            className="inline-flex h-11 items-center gap-2 rounded-md bg-tungsten px-6 font-semibold text-ink hover:brightness-110"
          >
            Create Your First Video — Free
            <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Clock } from "lucide-react";
import { PublicShell } from "~/components/layout";
import { Magnetic, Reveal } from "~/components/motion";

const POSTS = [
  {
    tag: "Rendering", date: "Oct 2026", read: "4 min",
    title: "Why we render in your browser",
    excerpt: "The preview IS the export path — same code, same frames, zero “but it looked fine in the editor”.",
    body: [
      "Most motion tools preview an approximation and render something else on export. We run the actual web motion bundle in your browser inside a sandboxed player — the same code path that exports.",
      "What you scrub is what you export. Font, timing, easing — identical, because preview and export run the same bundle in your browser.",
    ],
  },
  {
    tag: "Workflow", date: "Oct 2026", read: "6 min",
    title: "60-second motion graphics: what's actually automated",
    excerpt: "Intent extraction, beat planning, asset sourcing and QA run as parallel workstreams — you only answer what's truly ambiguous.",
    body: [
      "A “product launch video” brief fans out into design, content and technical plans that merge onto one timeline. The questionnaire asks only for gaps, as quick picks, in about ten seconds.",
      "The result: ~8 model calls per turn instead of 40+, and most users export without a single edit.",
    ],
  },
  {
    tag: "Platform", date: "Oct 2026", read: "3 min",
    title: "Paddle billing, Stack auth, zero boilerplate",
    excerpt: "Motion accounts run on SlyxUp Stack: sessions, 2FA, teams, API keys and Paddle entitlements out of the box.",
    body: [
      "No passwords stored here, no homegrown sessions. Sign in once and the same identity carries your plan across every SlyxUp app.",
    ],
  },
];

const TAGS = ["All", "Rendering", "Workflow", "Platform"];

export default function Blog() {
  const [tag, setTag] = useState("All");
  const filtered = POSTS.filter((p) => tag === "All" || p.tag === tag);
  const [featured, ...rest] = filtered;

  return (
    <PublicShell>
      <section className="dots relative overflow-hidden">
        <div className="relative mx-auto max-w-4xl px-4 pb-8 pt-14 text-center md:pt-20">
          <Reveal>
            <span className="sticker inline-block rotate-1 rounded-full bg-paper px-4 py-1.5 text-xs font-extrabold uppercase tracking-widest text-ink">
              Notes from the edit room
            </span>
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight md:text-6xl">
              How the sausage <span className="hl">gets rendered.</span>
            </h1>
          </Reveal>
          <Reveal delay={100}>
            <div className="mt-6 flex justify-center gap-2">
              {TAGS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTag(t)}
                  aria-pressed={tag === t}
                  className={`rounded-full border-[1.5px] px-4 py-1.5 text-xs font-extrabold transition-all ${tag === t ? "border-paper bg-paper text-ink shadow-[2px_2px_0_rgb(217_72_0)]" : "border-line bg-panel text-muted hover:border-paper/40 hover:text-paper"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-16 md:px-6">
        {featured ? (
          <Reveal>
            <article className="sticker overflow-hidden rounded-3xl bg-paper p-7 text-ink md:p-10">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                <span className="rounded-full bg-tungsten px-2.5 py-1 text-white">{featured.tag}</span>
                <span className="inline-flex items-center gap-1 text-[#6b6357]"><Clock size={12} aria-hidden /> {featured.read} · {featured.date}</span>
              </div>
              <h2 className="mt-4 text-2xl font-extrabold leading-tight tracking-tight md:text-4xl">{featured.title}</h2>
              <p className="mt-3 text-[15px] font-bold leading-relaxed text-tungsten-dim">{featured.excerpt}</p>
              {featured.body.map((p) => (
                <p key={p} className="mt-3 text-sm leading-relaxed text-[#4a4438]">{p}</p>
              ))}
              <Link to="/signup" className="mt-5 inline-flex items-center gap-1.5 text-sm font-extrabold text-tungsten hover:underline">
                Try it yourself <ArrowUpRight size={15} aria-hidden />
              </Link>
            </article>
          </Reveal>
        ) : null}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {rest.map((p, i) => (
            <Reveal key={p.title} delay={i * 80}>
              <article className="panel-lift card-hover h-full p-6">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-extrabold">
                  <span className="rounded-full border-[1.5px] border-line bg-ink px-2.5 py-0.5 text-paper">{p.tag}</span>
                  <span className="text-dim">{p.date} · {p.read}</span>
                </div>
                <h3 className="mt-3 text-lg font-extrabold leading-snug tracking-tight">{p.title}</h3>
                <p className="mt-1.5 text-sm font-bold text-tungsten-dim">{p.excerpt}</p>
                {p.body.map((b) => (
                  <p key={b} className="mt-2 text-sm leading-relaxed text-muted">{b}</p>
                ))}
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={100} className="mt-10 text-center">
          <Magnetic>
            <Link to="/signup" className="inline-flex h-13 items-center gap-2 rounded-2xl bg-paper px-8 py-4 font-extrabold text-ink shadow-[5px_5px_0_rgb(217_72_0)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-tungsten hover:text-white hover:shadow-none">
              Try it yourself <ArrowRight size={17} aria-hidden />
            </Link>
          </Magnetic>
        </Reveal>
      </section>
    </PublicShell>
  );
}

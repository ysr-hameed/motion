import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Clapperboard,
  Cpu,
  Film,
  Layers,
  Play,
  Scissors,
  Sparkles,
  Star,
  Timer,
  WandSparkles,
} from "lucide-react";
import { PublicShell } from "~/components/layout";
import { CountUp, Kinetic, Magnetic, Marquee, Reveal, Spotlight, Tilt } from "~/components/motion";
import { Badge } from "~/components/ui";

const TESTIMONIALS = [
  ["This is magic. I made 10 videos in an hour.", "Sarah Chen", "Marketing @ Acme Inc", "SC"],
  ["Our launch video took 60 seconds. Our agency quoted 3 weeks.", "Marcus Webb", "Founder, Loopwork", "MW"],
  ["Beat-aligned cuts without touching a keyframe. Absurd.", "Diego Ramos", "YouTuber, 800k subs", "DR"],
];

/** Split hero visual: stacked film cards with floating seals. */
function HeroCards() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
      <Tilt max={6}>
        <div className="sticker relative overflow-hidden rounded-2xl bg-[#171310] p-4">
          <div className="flex items-center gap-2">
            <span className="flex gap-1.5" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            </span>
            <span className="ml-1 text-[11px] font-bold text-[#ede8db]">product-reveal — v1</span>
            <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-[#7ddc8b]">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#7ddc8b]" /> rendering
            </span>
          </div>
          <div className="mt-3 flex aspect-video items-center justify-center rounded-xl bg-gradient-to-br from-[#3a2415] via-[#171310] to-[#0d0b08]">
            <Link
              to="/demo"
              aria-label="Play the demo cut"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f5f2ea] text-[#171310] shadow-[0_0_50px_rgb(217_72_0/0.55)] transition-transform hover:scale-110"
            >
              <Play size={24} fill="currentColor" className="translate-x-[2px]" aria-hidden />
            </Link>
          </div>
          <div className="mt-3 flex items-end gap-1" aria-hidden>
            {[8, 14, 6, 18, 10, 16, 7, 12, 15, 9, 13, 6, 11, 17, 8, 12].map((h, i) => (
              <div
                key={i}
                className={`eq-bar flex-1 rounded-sm ${i % 4 === 1 ? "bg-tungsten" : "bg-white/20"}`}
                style={{ height: `${h * 2.5}px`, animationDelay: `${(i % 8) * 0.13}s` }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] font-bold text-[#8a8474]">
            <span>00:00</span>
            <span>00:00:15</span>
          </div>
        </div>
      </Tilt>
      <div className="sticker float-y absolute -right-3 -top-5 rotate-6 rounded-xl bg-tungsten px-3.5 py-2 text-sm font-extrabold text-white md:-right-6">
        60 seconds
      </div>
      <div className="sticker float-y absolute -bottom-5 -left-3 -rotate-3 rounded-xl bg-[#f5f2ea] px-3.5 py-2 text-sm font-extrabold text-[#171310] md:-left-6" style={{ animationDelay: "-3s" }}>
        0 keyframes
      </div>
    </div>
  );
}

function TickerTape({ items }: { items: string[] }) {
  return (
    <div className="ticker overflow-hidden border-y-[3px] border-paper py-2.5">
      <Marquee fast>
        {items.map((t) => (
          <span key={t} className="flex items-center gap-6 whitespace-nowrap pr-6 text-sm font-extrabold uppercase tracking-[0.14em]">
            {t} <span className="text-tungsten-bright">✦</span>
          </span>
        ))}
      </Marquee>
    </div>
  );
}

export default function Home() {
  return (
    <PublicShell>
      {/* ============ HERO: split, left-led ============ */}
      <section className="dots relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-[30rem] w-[30rem] rounded-full bg-tungsten/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-14 md:px-6 md:pt-20 lg:grid-cols-2 lg:pb-24">
          <div>
            <div className="rise-in mb-5 inline-flex -rotate-2">
              <span className="sticker inline-flex items-center gap-1.5 rounded-full bg-[#fde3d3] px-3.5 py-1.5 text-xs font-extrabold text-tungsten-dim">
                <Sparkles size={13} aria-hidden /> 7 AI models to direct · free tier live
              </span>
            </div>
            <h1 className="rise-in max-w-xl text-5xl font-extrabold leading-[0.98] tracking-tight md:text-7xl" style={{ animationDelay: "80ms" }}>
              <Kinetic text="Cut the wait." />{" "}
              <span className="hl">
                <Kinetic text="Ship the cut." delayBase={300} />
              </span>
            </h1>
            <p className="rise-in mt-5 max-w-md text-lg leading-relaxed text-muted" style={{ animationDelay: "160ms" }}>
              Describe the video in a sentence. An AI director plans the beats,
              writes real motion code, and renders it while you watch.
            </p>
            <div className="rise-in mt-7 flex flex-wrap gap-3" style={{ animationDelay: "240ms" }}>
              <Magnetic strength={10}>
                <Link
                  to="/signup"
                  className="inline-flex h-13 items-center gap-2 rounded-2xl bg-paper px-7 py-3.5 text-base font-extrabold text-ink shadow-[5px_5px_0_rgb(217_72_0)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-tungsten hover:text-white hover:shadow-none"
                >
                  Start creating — free
                  <ArrowRight size={17} aria-hidden />
                </Link>
              </Magnetic>
              <Link
                to="/demo"
                className="inline-flex h-13 items-center gap-2 rounded-2xl border-[1.5px] border-paper/25 bg-panel px-7 py-3.5 text-base font-bold text-paper transition-colors hover:border-paper"
              >
                <Play size={16} aria-hidden /> Watch it render
              </Link>
            </div>
            <div className="rise-in mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-muted" style={{ animationDelay: "320ms" }}>
              {["Free plan", "5 videos/month", "No credit card"].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <BadgeCheck size={14} className="text-ok" aria-hidden /> {t}
                </span>
              ))}
            </div>
          </div>
          <Reveal variant="zoom" className="lg:pl-6">
            <HeroCards />
          </Reveal>
        </div>
      </section>

      <TickerTape items={["Product reveals", "Logo stings", "Kinetic type", "Social ads", "Explainers", "Event promos", "Lower thirds", "Podcast intros"]} />

      {/* ============ STATS ============ */}
      <section>
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px overflow-hidden px-4 py-0 md:px-6 lg:grid-cols-4">
          {[
            [60, "s", "brief to preview"],
            [61, "", "agent tools on call"],
            [9, "", "platform export presets"],
            [7, "", "directable models"],
          ].map(([n, suffix, label], i) => (
            <Reveal key={label as string} delay={i * 70}>
              <div className="border-line px-2 py-10 text-center odd:border-r lg:border-r lg:py-12 lg:last:border-r-0">
                <p className="font-display text-5xl font-extrabold tracking-tight text-paper md:text-6xl">
                  <CountUp to={n as number} suffix={suffix as string} />
                </p>
                <p className="mt-1.5 text-xs font-bold uppercase tracking-[0.14em] text-dim">{label}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <div className="sprockets" aria-hidden />

      {/* ============ HOW IT WORKS: a real sequence ============ */}
      <section className="bg-panel-2/50">
        <div className="mx-auto max-w-7xl px-4 py-16 md:px-6 md:py-24">
          <Reveal>
            <p className="eyebrow mb-2">the shoot — three scenes, in order</p>
            <h2 className="max-w-xl text-3xl font-extrabold tracking-tight md:text-5xl">
              Brief it. Watch it. <span className="hl">Ship it.</span>
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {(
              [
                ["01", "Describe", "Type a brief or pick a template. Subject, length, mood — one sentence is enough.", WandSparkles],
                ["02", "Direct", "Scenes land in the player as they're written. Nudge timing and copy mid-turn.", Clapperboard],
                ["03", "Export", "MP4, WebM, GIF — tuned presets for every platform you publish to.", Film],
              ] as Array<[string, string, string, typeof WandSparkles]>
            ).map(([n, title, body, Icon], i) => (
              <Reveal key={title} delay={i * 100}>
                <div className="panel-lift card-hover relative h-full overflow-hidden p-6">
                  <span className="font-display text-6xl font-extrabold text-paper/10" aria-hidden>{n}</span>
                  <span className="mb-4 -mt-6 flex h-11 w-11 items-center justify-center rounded-xl bg-paper text-ink">
                    <Icon size={19} aria-hidden />
                  </span>
                  <p className="text-lg font-extrabold text-paper">{title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ BENTO ============ */}
      <section>
        <div className="mx-auto max-w-7xl px-4 py-16 md:px-6 md:py-24">
          <Reveal>
            <p className="eyebrow mb-2">under the hood</p>
            <h2 className="max-w-2xl text-3xl font-extrabold tracking-tight md:text-5xl">
              An edit suite with a <span className="text-tungsten">director inside</span>
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            <Reveal className="lg:col-span-2" delay={0}>
              <Spotlight className="panel-lift h-full p-6 md:p-8">
                <p className="flex items-center gap-2 text-base font-extrabold text-paper">
                  <WandSparkles size={17} className="text-tungsten" aria-hidden /> Direct, don't design
                </p>
                <div className="mt-4 max-w-md space-y-2.5">
                  <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-paper px-4 py-2.5 text-sm font-medium text-ink">
                    A 15s launch video. Bold, loud, ends on the logo.
                  </p>
                  <div className="w-fit max-w-[90%] rounded-2xl rounded-bl-md border border-line bg-ink px-4 py-3 text-xs">
                    {["intent → product launch · 15s", "beats → 5 scenes planned", "spring() easing · beat-aligned", "v1 published to player ✓"].map((t) => (
                      <p key={t} className="flex items-center gap-2 py-0.5 font-medium text-muted">
                        <span className="h-1 w-1 rounded-full bg-ok" /> {t}
                      </p>
                    ))}
                  </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted">
                  The agent plans beats, writes Remotion code, validates it — and your
                  brand kit rides along on every cut.
                </p>
              </Spotlight>
            </Reveal>
            <Reveal delay={90}>
              <Spotlight className="panel-lift h-full p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-tungsten text-white">
                  <Cpu size={18} aria-hidden />
                </span>
                <p className="mt-3 font-extrabold text-paper">7 directing models</p>
                <p className="mt-1 text-sm text-muted">Free Ling and Laguna workhorses plus cheap Qwen tiers. Switch per session.</p>
              </Spotlight>
            </Reveal>
            {[
              { icon: Scissors, title: "Edit-suite precision", body: "Spring physics, overshoot, beat-aligned timing — the details that read as professional." },
              { icon: Layers, title: "Versions, not drafts", body: "Every cut versioned with ratings, render reports, one-click restore." },
              { icon: Timer, title: "60-second turnaround", body: "Brief to watchable preview in about a minute, reasoning streamed live." },
            ].map((f, i) => (
              <Reveal key={f.title} delay={i * 80}>
                <Spotlight className="panel-lift card-hover h-full p-6">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border-[1.5px] border-line bg-ink text-tungsten">
                    <f.icon size={18} aria-hidden />
                  </span>
                  <p className="mt-3 font-extrabold text-paper">{f.title}</p>
                  <p className="mt-1 text-sm text-muted">{f.body}</p>
                </Spotlight>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ DARK BAND: testimonials ============ */}
      <section className="bg-paper text-ink">
        <div className="mx-auto max-w-7xl px-4 py-16 md:px-6 md:py-24">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#a29885]">wall of love</p>
                <h2 className="text-3xl font-extrabold tracking-tight md:text-5xl">Creators cancelled<br />their old tools.</h2>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-tungsten px-4 py-2 text-sm font-extrabold text-white">
                <Star size={14} fill="currentColor" aria-hidden /> 4.9 / 5
              </span>
            </div>
          </Reveal>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {TESTIMONIALS.map(([quote, name, role, initials], i) => (
              <Reveal key={name} delay={i * 90}>
                <figure className="h-full rounded-2xl border border-white/10 bg-white/[0.06] p-6 transition-transform duration-300 hover:-translate-y-1">
                  <blockquote className="text-[15px] font-medium leading-relaxed text-[#ede8db]">“{quote}”</blockquote>
                  <figcaption className="mt-4 flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-tungsten text-xs font-extrabold text-white">{initials}</span>
                    <span>
                      <span className="block text-sm font-bold text-white">{name}</span>
                      <span className="block text-xs text-[#a29885]">{role}</span>
                    </span>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ PRICING ============ */}
      <section>
        <div className="mx-auto max-w-6xl px-4 py-16 text-center md:px-6 md:py-24">
          <Reveal>
            <p className="eyebrow mb-2">pricing</p>
            <h2 className="text-3xl font-extrabold tracking-tight md:text-5xl">Pay for renders, <span className="hl">not seats.</span></h2>
          </Reveal>
          <div className="mx-auto mt-10 grid max-w-4xl gap-5 text-left md:grid-cols-3">
            {[
              { name: "Free", price: "$0", per: "forever", blurb: "5 videos/mo · 720p · watermarked", hot: false },
              { name: "Pro", price: "$29", per: "/mo", blurb: "Unlimited · 4K · brand kit · priority queue", hot: true },
              { name: "Business", price: "$99", per: "/mo", blurb: "Team seats · API · white-label", hot: false },
            ].map((p, i) => (
              <Reveal key={p.name} delay={i * 90}>
                <Tilt max={5} className="h-full">
                  <div className={`relative h-full p-6 ${p.hot ? "sticker rounded-2xl bg-paper text-ink" : "panel-lift card-hover"}`}>
                    {p.hot ? (
                      <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 -rotate-2 rounded-full bg-tungsten px-3.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white">
                        Most picked
                      </span>
                    ) : null}
                    <p className={`font-extrabold ${p.hot ? "text-ink" : "text-paper"}`}>{p.name}</p>
                    <p className={`mt-1 text-4xl font-extrabold tracking-tight ${p.hot ? "text-ink" : "text-paper"}`}>
                      {p.price}<span className={`text-sm font-bold ${p.hot ? "text-[#6b6357]" : "text-muted"}`}>{p.per}</span>
                    </p>
                    <p className={`mt-2 text-xs font-medium ${p.hot ? "text-[#4a4438]" : "text-muted"}`}>{p.blurb}</p>
                  </div>
                </Tilt>
              </Reveal>
            ))}
          </div>
          <Reveal delay={150}>
            <Link to="/pricing" className="group mt-8 inline-flex items-center gap-1.5 font-extrabold text-tungsten">
              Compare every plan <ArrowUpRight size={16} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
            </Link>
          </Reveal>
        </div>
      </section>

      <div className="sprockets" aria-hidden />

      {/* ============ FINAL CTA ============ */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="dots pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative mx-auto max-w-4xl px-4 py-20 text-center md:py-28">
          <Reveal variant="zoom">
            <span className="sticker inline-block rotate-2 rounded-full bg-tungsten px-4 py-1.5 text-xs font-extrabold uppercase tracking-widest text-white">
              Action — final scene
            </span>
            <h2 className="mx-auto mt-5 max-w-2xl text-4xl font-extrabold leading-[1.02] tracking-tight md:text-6xl">
              Your first cut is <span className="hl">60 seconds</span> away.
            </h2>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Magnetic strength={10}>
                <Link
                  to="/signup"
                  className="inline-flex h-13 items-center gap-2 rounded-2xl bg-paper px-8 py-4 text-base font-extrabold text-ink shadow-[5px_5px_0_rgb(217_72_0)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-tungsten hover:text-white hover:shadow-none"
                >
                  Create your first video — free <ArrowRight size={17} aria-hidden />
                </Link>
              </Magnetic>
              <Link to="/demo" className="inline-flex h-13 items-center gap-2 rounded-2xl border-[1.5px] border-paper/25 bg-panel px-8 py-4 text-base font-bold text-paper transition-colors hover:border-paper">
                <Play size={16} aria-hidden /> Watch demo
              </Link>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
              <Badge tone="gold" icon={Sparkles}>60s turnaround</Badge>
              <Badge tone="green" icon={BadgeCheck}>No credit card</Badge>
              <Badge tone="blue" icon={Clapperboard}>Real Remotion code</Badge>
            </div>
          </Reveal>
        </div>
      </section>
    </PublicShell>
  );
}

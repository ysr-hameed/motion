import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, GraduationCap, Megaphone, Palette, PartyPopper, Rocket, Share2 } from "lucide-react";
import { PublicShell } from "~/components/layout";
import { Magnetic, Reveal } from "~/components/motion";

const CASES = [
  {
    icon: Megaphone, title: "Marketing & Advertising",
    body: "Scroll-stopping ads in minutes. Hook in the first 8 frames, payoff by second three.",
    tags: ["Product ads", "Brand stories", "Promos"],
    prompt: "A 15s product ad with a punchy hook and logo payoff",
  },
  {
    icon: Share2, title: "Social Media Content",
    body: "Reels, Shorts, TikTok — right ratio, right duration, right codec, automatically.",
    tags: ["Reels", "Shorts", "TikTok"],
    prompt: "A 9:16 social ad with kinetic captions",
  },
  {
    icon: Rocket, title: "Product Launches",
    body: "Reveal moments with anticipation + settle. The pause before the logo is the whole trick.",
    tags: ["Reveals", "Teasers", "Launches"],
    prompt: "A product reveal with anticipation and spring settle",
  },
  {
    icon: GraduationCap, title: "Education & Training",
    body: "Tutorial intros and explainer cards that keep viewers past the 30-second cliff.",
    tags: ["Intros", "Explainers", "Courses"],
    prompt: "A tutorial intro with chapter cards",
  },
  {
    icon: PartyPopper, title: "Events & Announcements",
    body: "Countdowns, save-the-dates, recap sizzles — dated content without the date stress.",
    tags: ["Countdowns", "Recaps", "Invites"],
    prompt: "An event promo with a countdown sting",
  },
  {
    icon: Palette, title: "Branding & Identity",
    body: "Logo reveals in 10+ styles. Your brand kit rides along on every single cut.",
    tags: ["Logo stings", "Idents", "Brand films"],
    prompt: "A logo sting with spring settle and grain",
  },
];

export default function UseCases() {
  const [active, setActive] = useState(0);
  const current = CASES[active]!;

  return (
    <PublicShell>
      <section className="dots relative overflow-hidden">
        <div className="relative mx-auto max-w-7xl px-4 pb-12 pt-14 text-center md:px-6 md:pt-20">
          <Reveal>
            <span className="sticker inline-block rotate-1 rounded-full bg-tungsten px-4 py-1.5 text-xs font-extrabold uppercase tracking-widest text-white">
              Use cases — six ways to ship
            </span>
            <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold leading-[1.02] tracking-tight md:text-6xl">
              One director, <span className="hl">every format.</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-muted">
              Pick a lane below — the brief for it is already written. One tap loads it into the Studio.
            </p>
          </Reveal>
        </div>
      </section>

      {/* interactive picker */}
      <section className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col gap-2">
            {CASES.map((c, i) => (
              <button
                key={c.title}
                onClick={() => setActive(i)}
                aria-pressed={i === active}
                className={`group flex items-center gap-3 rounded-2xl border-[1.5px] p-4 text-left transition-all duration-200 ${
                  i === active
                    ? "border-paper bg-paper text-ink shadow-[4px_4px_0_rgb(217_72_0)]"
                    : "border-line bg-panel hover:border-paper/40"
                }`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${i === active ? "bg-tungsten text-white" : "bg-panel-2 text-muted"}`}>
                  <c.icon size={17} aria-hidden />
                </span>
                <span>
                  <span className={`block text-sm font-extrabold ${i === active ? "text-ink" : "text-paper"}`}>{c.title}</span>
                  <span className={`block text-xs font-medium ${i === active ? "text-[#6b6357]" : "text-dim"}`}>{c.tags.join(" · ")}</span>
                </span>
                <ArrowRight size={15} className={`ml-auto transition-all ${i === active ? "translate-x-0 text-tungsten opacity-100" : "-translate-x-1 opacity-0"}`} aria-hidden />
              </button>
            ))}
          </div>

          <div key={active} className="tick-in sticker overflow-hidden rounded-3xl bg-paper p-6 text-ink md:p-8">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-tungsten">now showing</p>
            <h2 className="mt-2 flex items-center gap-3 text-2xl font-extrabold tracking-tight md:text-3xl">
              <current.icon size={26} className="text-tungsten" aria-hidden />
              {current.title}
            </h2>
            <p className="mt-2 max-w-md text-sm font-medium leading-relaxed text-[#4a4438]">{current.body}</p>
            <div className="mt-4 rounded-2xl bg-ink p-4">
              <div className="flex h-16 items-end gap-1" aria-hidden>
                {[8, 14, 6, 18, 10, 16, 7, 12, 15, 9, 13, 6].map((h, i) => (
                  <div key={i} className={`eq-bar w-full rounded-sm ${i % 4 === 1 ? "bg-tungsten" : "bg-white/25"}`} style={{ height: `${h * 4}px`, animationDelay: `${i * 0.12}s` }} />
                ))}
              </div>
              <p className="mt-2 truncate text-xs font-bold text-[#ede8db]">“{current.prompt}”</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link to="/create" className="inline-flex h-11 items-center gap-2 rounded-xl bg-tungsten px-6 text-sm font-extrabold text-white transition-all hover:brightness-110">
                Direct this <ArrowUpRight size={15} aria-hidden />
              </Link>
              <Link to="/templates" className="inline-flex h-11 items-center rounded-xl border-[1.5px] border-ink/20 px-6 text-sm font-bold transition-colors hover:border-ink">
                Browse templates
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-14 grid gap-4 pb-16 sm:grid-cols-2 lg:grid-cols-3 md:pb-24">
          {CASES.map((c, i) => (
            <Reveal key={c.title} delay={(i % 3) * 70}>
              <button
                onClick={() => { setActive(i); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className="panel-lift card-hover block h-full w-full p-6 text-left"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fde3d3] text-tungsten">
                  <c.icon size={17} aria-hidden />
                </span>
                <p className="mt-3 font-extrabold text-paper">{c.title}</p>
                <p className="mt-1 text-sm text-muted">{c.body}</p>
              </button>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="bg-paper py-14 text-center text-ink">
        <Reveal variant="zoom">
          <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">Pick a lane. Direct it live.</h2>
          <div className="mt-6">
            <Magnetic>
              <Link to="/signup" className="inline-flex h-13 items-center gap-2 rounded-2xl bg-tungsten px-8 py-4 font-extrabold text-white transition-all hover:brightness-110">
                Start free <ArrowRight size={17} aria-hidden />
              </Link>
            </Magnetic>
          </div>
        </Reveal>
      </section>
    </PublicShell>
  );
}

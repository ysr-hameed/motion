import { Link } from "react-router-dom";
import { ArrowRight, Eye, Gauge, HeartHandshake, ScanEye } from "lucide-react";
import { PublicShell } from "~/components/layout";
import { Magnetic, Reveal } from "~/components/motion";

const VALUES = [
  { icon: Gauge, title: "Speed", body: "A minute to preview, not a sprint to a rough cut. Waiting is a bug." },
  { icon: Eye, title: "Quality", body: "Spring landings, beat alignment, provable renders — never an approximation." },
  { icon: HeartHandshake, title: "Access", body: "Captions by default, motion-sensitivity checks, contrast that passes." },
  { icon: ScanEye, title: "Honesty", body: "The reasoning streams. The code is inspectable. The render is provable." },
];

const TIMELINE: Array<[string, string, string]> = [
  ["2025", "The wait", "Every motion tool needed an expert or produced slop. Briefs died in queues."],
  ["Early 2026", "The insight", "The browser is the renderer. Agents write the motion. Nobody connected them."],
  ["Mid 2026", "The cut", "SlyxUp Motion: describe it, watch scenes build live, export anywhere. Sixty seconds."],
  ["Now", "The studio", "7 directing models, 61 tools, versioned cuts, CDN publish. This page is the trailer."],
];

export default function About() {
  return (
    <PublicShell>
      <section className="dots relative overflow-hidden">
        <div className="relative mx-auto max-w-3xl px-4 pb-12 pt-14 text-center md:pt-20">
          <Reveal>
            <span className="sticker inline-block -rotate-1 rounded-full bg-paper px-4 py-1.5 text-xs font-extrabold uppercase tracking-widest text-ink">
              About the studio
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.02] tracking-tight md:text-6xl">
              Built for creators who <span className="hl">refuse to wait.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl leading-relaxed text-muted">
              SlyxUp Motion turns a sentence into production-ready motion graphics:
              real web motion bundles, validated before they ever hit the sandbox player.
            </p>
          </Reveal>
        </div>
      </section>

      {/* story as scene cards */}
      <section className="mx-auto max-w-5xl px-4 md:px-6">
        <div className="grid gap-4 pb-4 sm:grid-cols-2">
          {TIMELINE.map(([year, title, body], i) => (
            <Reveal key={title} delay={(i % 2) * 80}>
              <div className={`h-full rounded-3xl border-[1.5px] p-6 ${i === TIMELINE.length - 1 ? "sticker bg-tungsten text-white sm:col-span-2" : "panel-lift card-hover"}`}>
                <p className={`font-display text-5xl font-extrabold tracking-tight ${i === TIMELINE.length - 1 ? "text-white" : "text-tungsten"}`}>{year}</p>
                <p className={`mt-1 text-lg font-extrabold ${i === TIMELINE.length - 1 ? "text-white" : "text-paper"}`}>{title}</p>
                <p className={`mt-1.5 text-sm leading-relaxed ${i === TIMELINE.length - 1 ? "text-white/85" : "text-muted"}`}>{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 md:px-6 md:py-20">
        <Reveal className="text-center">
          <p className="eyebrow mb-2">what we optimize for</p>
          <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">Four values, one timeline</h2>
        </Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map((v, i) => (
            <Reveal key={v.title} delay={i * 70}>
              <div className="panel-lift card-hover h-full p-6 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-paper text-ink">
                  <v.icon size={20} aria-hidden />
                </span>
                <p className="mt-3 font-extrabold text-paper">{v.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{v.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={100} className="mt-12 text-center">
          <div className="flex flex-wrap justify-center gap-3">
            <Magnetic>
              <Link to="/signup" className="inline-flex h-13 items-center gap-2 rounded-2xl bg-paper px-8 py-4 font-extrabold text-ink shadow-[5px_5px_0_rgb(217_72_0)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-tungsten hover:text-white hover:shadow-none">
                Start creating free <ArrowRight size={17} aria-hidden />
              </Link>
            </Magnetic>
            <Link to="/contact" className="inline-flex h-13 items-center rounded-2xl border-[1.5px] border-paper/25 bg-panel px-8 py-4 font-bold text-paper transition-colors hover:border-paper">
              Contact us
            </Link>
          </div>
        </Reveal>
      </section>
    </PublicShell>
  );
}

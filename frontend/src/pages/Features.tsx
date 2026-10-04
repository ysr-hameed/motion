import { Link } from "react-router-dom";
import { ArrowRight, AudioWaveform, Bot, Check, Clapperboard, Film, Sparkles, Users } from "lucide-react";
import { PublicShell } from "~/components/layout";
import { Magnetic, Marquee, Reveal } from "~/components/motion";
import { Badge } from "~/components/ui";

const ROWS = [
  {
    id: "ai",
    icon: Bot,
    tag: "AI direction",
    title: "An agent that directs, not a form that renders",
    body: "Intent extraction, beat planning, asset sourcing and QA run as parallel workstreams. You answer what's truly ambiguous — about ten seconds of quick picks.",
    points: ["Intent understanding from one sentence", "Smart defaults per industry + platform", "Style transfer from any reference URL", "Brand profile learned from your assets"],
    stat: ["8", "model calls per turn, not 40+"],
  },
  {
    id: "motion",
    icon: Clapperboard,
    tag: "Motion craft",
    title: "Spring physics, not slide transitions",
    body: "Overshoot, anticipation, settle. Beat-aligned timing with easing profiles the agent picks per beat — the details that read as professional.",
    points: ["50+ motion presets with parameters", "Spring / elastic / magnetic easing", "Camera moves: pan, dolly, orbit", "Per-character text animators + masks"],
    stat: ["50+", "presets on call"],
  },
  {
    id: "content",
    icon: AudioWaveform,
    tag: "Content built in",
    title: "Copy, voice, music — generated in the cut",
    body: "Headlines, voiceover timing, BPM-matched music and SFX land on the timeline automatically, already synced to your beats.",
    points: ["Copy variants in your brand voice", "Voiceover with auto-timing sync", "Royalty-free music, BPM-matched", "Auto captions + translations"],
    stat: ["124", "BPM auto-detected and cut to"],
  },
  {
    id: "export",
    icon: Film,
    tag: "Export everywhere",
    title: "Every platform, one click",
    body: "Nine presets tuned per destination — dimensions, duration caps, codecs. Or export the full bundle and publish to CDN with embed codes.",
    points: ["IG Story / Reel / TikTok / YT Shorts", "MP4 · WebM · GIF · PNG sequence", "CDN URLs + share links + QR", "Batch export with progress"],
    stat: ["9", "platform presets"],
  },
  {
    id: "team",
    icon: Users,
    tag: "Team review",
    title: "Review like a studio, not a zip file",
    body: "Share links with frame-accurate comments, version branches for A/B, and roles that keep clients from breaking the cut.",
    points: ["Share links: view / comment / edit", "Frame-specific threads + @mentions", "Version history with one-click restore", "Owner / editor / viewer roles"],
    stat: ["10", "seats on Business"],
  },
];

export default function Features() {
  return (
    <PublicShell>
      <section className="dots relative overflow-hidden">
        <div className="relative mx-auto max-w-7xl px-4 pb-14 pt-14 text-center md:px-6 md:pt-20">
          <Reveal>
            <span className="sticker inline-block -rotate-2 rounded-full bg-paper px-4 py-1.5 text-xs font-extrabold uppercase tracking-widest text-ink">
              The full instrument
            </span>
            <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold leading-[1.02] tracking-tight md:text-6xl">
              Five departments, <span className="hl">one director.</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-muted">
              Pick a department to see what's inside — then watch it happen live in the Studio.
            </p>
          </Reveal>
        </div>
      </section>

      <div className="ticker overflow-hidden border-y-[3px] border-paper py-2.5" aria-hidden>
        <Marquee fast>
          {["Direct", "Plan beats", "Source assets", "Write code", "Validate", "Review motion", "Publish"].map((t) => (
            <span key={t} className="flex items-center gap-6 whitespace-nowrap pr-6 text-sm font-extrabold uppercase tracking-[0.14em]">
              {t} <span className="text-tungsten-bright">✦</span>
            </span>
          ))}
        </Marquee>
      </div>

      {/* alternating editorial rows */}
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        {ROWS.map((r, i) => (
          <section key={r.id} className={`grid items-center gap-8 border-b border-line py-14 md:py-20 lg:grid-cols-2 lg:gap-14 ${i % 2 ? "" : ""}`}>
            <Reveal variant={i % 2 ? "right" : "left"} className={i % 2 ? "lg:order-2" : ""}>
              <Badge tone="gold" icon={Sparkles}>{r.tag}</Badge>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">{r.title}</h2>
              <p className="mt-3 max-w-lg leading-relaxed text-muted">{r.body}</p>
              <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                {r.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm font-semibold text-paper">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok/15">
                      <Check size={12} strokeWidth={3} className="text-ok" aria-hidden />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal variant={i % 2 ? "left" : "right"} delay={100} className={i % 2 ? "lg:order-1" : ""}>
              <div className={`sticker rounded-3xl p-8 md:p-10 ${i % 2 ? "rotate-1 bg-tungsten text-white" : "-rotate-1 bg-paper text-ink"}`}>
                <r.icon size={30} aria-hidden className={i % 2 ? "text-white" : "text-tungsten"} />
                <p className="mt-4 font-display text-7xl font-extrabold tracking-tight md:text-8xl">{r.stat[0]}</p>
                <p className={`mt-2 text-sm font-bold ${i % 2 ? "text-white/80" : "text-muted"}`}>{r.stat[1]}</p>
              </div>
            </Reveal>
          </section>
        ))}
      </div>

      {/* comparison */}
      <section className="bg-panel-2/50">
        <div className="mx-auto max-w-5xl px-4 py-14 md:px-6 md:py-20">
          <Reveal className="text-center">
            <p className="eyebrow mb-2">slyxup vs the old way</p>
            <h2 className="text-3xl font-extrabold tracking-tight md:text-5xl">60 seconds vs 4 hours</h2>
          </Reveal>
          <Reveal delay={100}>
            <div className="mt-8 overflow-hidden rounded-2xl border-[1.5px] border-paper/20 bg-panel">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-paper text-left text-xs font-bold uppercase tracking-wider text-ink">
                    <th className="p-4"> </th>
                    <th className="p-4 text-tungsten-bright">SlyxUp</th>
                    <th className="p-4">After Effects</th>
                    <th className="p-4">Canva</th>
                  </tr>
                </thead>
                <tbody className="font-medium text-muted">
                  {[
                    ["Time to create", "60s", "2–4 hours", "30 min"],
                    ["Skill required", "None", "Expert", "Basic"],
                    ["Motion physics", "Springs + beats", "Manual", "Presets"],
                    ["Output quality", "Pro", "Pro", "Good"],
                    ["Price", "$29/mo", "$240/yr", "$120/yr"],
                  ].map(([k, a, b, c]) => (
                    <tr key={k} className="border-t border-line transition-colors hover:bg-tungsten/[0.06]">
                      <td className="p-4 font-extrabold text-paper">{k}</td>
                      <td className="bg-tungsten/[0.08] p-4 font-extrabold text-tungsten-dim">{a}</td>
                      <td className="p-4">{b}</td>
                      <td className="p-4">{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
          <Reveal delay={140} className="mt-10 text-center">
            <Magnetic>
              <Link to="/signup" className="inline-flex h-13 items-center gap-2 rounded-2xl bg-paper px-8 py-4 font-extrabold text-ink shadow-[5px_5px_0_rgb(217_72_0)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-tungsten hover:text-white hover:shadow-none">
                Start creating free <ArrowRight size={17} aria-hidden />
              </Link>
            </Magnetic>
          </Reveal>
        </div>
      </section>
    </PublicShell>
  );
}

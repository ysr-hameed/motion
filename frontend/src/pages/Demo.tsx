import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck, Play } from "lucide-react";
import { Stage } from "~/components/Stage";
import { PublicShell } from "~/components/layout";
import { Magnetic, Reveal } from "~/components/motion";
import { DEMO_CODE, DEMO_PLAN } from "~/lib/demo";

export default function Demo() {
  return (
    <PublicShell>
      <section className="dots relative overflow-hidden">
        <div className="relative mx-auto max-w-5xl px-4 pb-14 pt-14 md:px-6 md:pt-20">
          <Reveal className="text-center">
            <span className="sticker inline-block -rotate-1 rounded-full bg-paper px-4 py-1.5 text-xs font-extrabold uppercase tracking-widest text-ink">
              Live demo — zero signup, zero quota
            </span>
            <h1 className="mx-auto mt-5 max-w-2xl text-3xl font-extrabold tracking-tight md:text-5xl">
              Press play. <span className="hl">It's really rendering.</span>
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm font-medium text-muted md:text-base">
              Compiled live in your browser through the same pipeline the agent writes to. Scrub it — it's real.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <div className="sticker mt-8 overflow-hidden rounded-3xl bg-[#171310]">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <span className="flex gap-1.5" aria-hidden>
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                </span>
                <span className="ml-2 flex items-center gap-1.5 text-[11px] font-bold text-[#ede8db]">
                  <Play size={11} className="text-tungsten-bright" aria-hidden />
                  product-reveal — v1 · 450f · 30fps
                </span>
                <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-[#7ddc8b]">
                  <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#7ddc8b]" /> rendering locally
                </span>
              </div>
              <div className="h-[52vh] min-h-80 p-3 md:p-4">
                <Stage code={DEMO_CODE} plan={DEMO_PLAN} version={1} reloadKey="demo" sessionId="demo" />
              </div>
            </div>
          </Reveal>

          <Reveal delay={170}>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-bold text-muted">
              {["No account", "No model quota", "Same code path as Studio"].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <BadgeCheck size={14} className="text-ok" aria-hidden /> {t}
                </span>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Magnetic>
                <Link to="/signup" className="inline-flex h-13 items-center gap-2 rounded-2xl bg-paper px-8 py-4 font-extrabold text-ink shadow-[5px_5px_0_rgb(217_72_0)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-tungsten hover:text-white hover:shadow-none">
                  Make yours — free <ArrowRight size={17} aria-hidden />
                </Link>
              </Magnetic>
              <Link to="/features" className="inline-flex h-13 items-center rounded-2xl border-[1.5px] border-paper/25 bg-panel px-8 py-4 font-bold text-paper transition-colors hover:border-paper">
                See features
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </PublicShell>
  );
}

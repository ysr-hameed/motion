import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useBilling, usePlans, useUser } from "@slyxup/ui";
import { ArrowRight, Check, Minus, ShieldCheck, Sparkles } from "lucide-react";
import { PublicShell } from "~/components/layout";
import { Reveal, Tilt } from "~/components/motion";
import { Alert, Badge, Button, LoadingPage } from "~/components/ui";
import { SLYXUP_PROJECT_ID, friendlyAuthError } from "~/lib/stack";

export default function Pricing() {
  const { plans, loading, error } = usePlans(SLYXUP_PROJECT_ID);
  const { client } = useBilling();
  const { isSignedIn } = useUser();
  const navigate = useNavigate();
  const [annual, setAnnual] = useState(true);
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const buy = (planId: string) => {
    if (!isSignedIn) {
      navigate(`/signup?returnTo=${encodeURIComponent("/pricing")}`);
      return;
    }
    setCheckoutError(null);
    setCheckoutBusy(planId);
    client
      .checkout(planId, {
        origin: `${window.location.origin}/billing?checkout=1`,
        manualOpen: true,
      })
      .then(({ checkoutUrl }) => window.location.assign(checkoutUrl))
      .catch((err: unknown) => {
        setCheckoutError(friendlyAuthError(err));
        setCheckoutBusy(null);
      });
  };

  return (
    <PublicShell>
      <section className="dots relative overflow-hidden">
        <div className="relative mx-auto max-w-7xl px-4 pb-12 pt-14 text-center md:px-6 md:pt-20">
          <Reveal>
            <span className="sticker inline-block rotate-1 rounded-full bg-paper px-4 py-1.5 text-xs font-extrabold uppercase tracking-widest text-ink">
              Pricing — pay for renders, not seats
            </span>
            <h1 className="mx-auto mt-5 max-w-2xl text-4xl font-extrabold leading-[1.02] tracking-tight md:text-6xl">
              Start free. <span className="hl">Upgrade when it pays.</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-muted">
              Access activates the moment payment clears — usually under a minute. Cancel anytime, keep everything.
            </p>
          </Reveal>
          <Reveal delay={110}>
            <div className="mt-7 inline-flex items-center gap-1 rounded-full border-[1.5px] border-paper/20 bg-panel p-1 text-sm font-bold">
              {(["Monthly", "Annual"] as const).map((label) => {
                const isAnnual = label === "Annual";
                const active = annual === isAnnual;
                return (
                  <button
                    key={label}
                    onClick={() => setAnnual(isAnnual)}
                    className={`rounded-full px-5 py-2 transition-all ${active ? "bg-paper text-ink shadow-[2px_2px_0_rgb(217_72_0)]" : "text-muted hover:text-paper"}`}
                  >
                    {label}
                    {isAnnual ? <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${active ? "bg-tungsten text-white" : "bg-ok/15 text-ok"}`}>−20%</span> : null}
                  </button>
                );
              })}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-4 md:px-6">
        <div className="grid items-stretch gap-5 md:grid-cols-3">
          <Reveal delay={0} className="h-full">
            <div className="panel-lift card-hover flex h-full flex-col p-7">
              <p className="text-sm font-extrabold uppercase tracking-widest text-muted">Free</p>
              <p className="mt-2 font-display text-5xl font-extrabold tracking-tight">$0</p>
              <p className="mt-1 text-xs font-bold text-dim">forever · no card</p>
              <ul className="mt-5 flex flex-col gap-2 text-sm font-medium text-muted">
                {["5 videos / month", "720p export", "Watermarked", "Core templates"].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check size={15} strokeWidth={3} className="mt-0.5 shrink-0 text-ok" aria-hidden /> {f}
                  </li>
                ))}
              </ul>
              <Link to="/signup" className="mt-auto pt-6">
                <Button variant="secondary" className="w-full">Start free</Button>
              </Link>
            </div>
          </Reveal>

          {loading ? (
            <div className="md:col-span-2"><LoadingPage label="Loading plans…" /></div>
          ) : error ? (
            <div className="md:col-span-2"><Alert>{error}</Alert></div>
          ) : plans.length === 0 ? (
            <div className="md:col-span-2">
              <Alert tone="info">
                Paid plans are being connected — the Free plan works today.
                Publish Paddle-mapped plans in the Stack dashboard to list them here.
              </Alert>
            </div>
          ) : (
            plans.slice(0, 2).map((plan, i) => (
              <Reveal key={plan.id} delay={(i + 1) * 90} className="h-full">
                <Tilt max={4} className="h-full">
                  <div className={`relative flex h-full flex-col p-7 ${plan.isPopular ? "sticker rounded-2xl bg-paper text-ink md:-translate-y-2" : "panel-lift card-hover"}`}>
                    {plan.isPopular ? (
                      <span className="absolute -top-3.5 left-6 inline-flex -rotate-2 items-center gap-1 rounded-full bg-tungsten px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white">
                        <Sparkles size={10} aria-hidden /> Most picked
                      </span>
                    ) : null}
                    <p className={`font-extrabold ${plan.isPopular ? "text-ink" : "text-paper"}`}>{plan.name}</p>
                    <p className={`mt-2 font-display text-5xl font-extrabold tracking-tight ${plan.isPopular ? "text-ink" : "text-paper"}`}>
                      ${(plan.amount / 100).toFixed(plan.amount % 100 ? 2 : 0)}
                      <span className={`text-base font-bold ${plan.isPopular ? "text-[#6b6357]" : "text-muted"}`}>/{plan.interval === "year" ? "yr" : "mo"}</span>
                    </p>
                    {annual && plan.interval !== "year" ? (
                      <p className="mt-1 text-xs font-bold text-ok">Annual saves ~20% at checkout</p>
                    ) : null}
                    <ul className={`mt-5 flex flex-col gap-2 text-sm font-medium ${plan.isPopular ? "text-[#4a4438]" : "text-muted"}`}>
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <Check size={15} strokeWidth={3} className="mt-0.5 shrink-0 text-ok" aria-hidden /> {f}
                        </li>
                      ))}
                    </ul>
                    <Button
                      variant={plan.isPopular ? "accent" : "primary"}
                      className="mt-6 w-full"
                      loading={checkoutBusy === plan.id}
                      onClick={() => buy(plan.id)}
                    >
                      {isSignedIn ? "Subscribe" : "Sign up to subscribe"}
                    </Button>
                  </div>
                </Tilt>
              </Reveal>
            ))
          )}
        </div>
        {checkoutError ? (
          <div className="mx-auto mt-6 max-w-xl"><Alert>{checkoutError}</Alert></div>
        ) : null}
      </section>

      {/* comparison */}
      <section className="mx-auto max-w-5xl px-4 py-14 md:px-6">
        <Reveal className="text-center">
          <h2 className="text-2xl font-extrabold tracking-tight md:text-4xl">Compare every line</h2>
        </Reveal>
        <Reveal delay={80}>
          <div className="mt-6 overflow-hidden rounded-2xl border-[1.5px] border-paper/20 bg-panel">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-paper text-left text-xs font-bold uppercase tracking-wider text-ink">
                  <th className="p-4"> </th>
                  <th className="p-4">Free</th>
                  <th className="p-4 text-tungsten-bright">Pro</th>
                  <th className="p-4">Business</th>
                </tr>
              </thead>
              <tbody className="font-medium text-muted">
                {[
                  ["Videos / month", "5", "Unlimited", "Unlimited"],
                  ["Export resolution", "720p", "4K", "4K"],
                  ["Watermark", "Yes", "No", "No"],
                  ["Priority queue", false, true, true],
                  ["3D support", false, true, true],
                  ["Team seats", "—", "3", "10"],
                  ["White-label", false, false, true],
                  ["API access", false, false, true],
                ].map(([k, a, b, c]) => (
                  <tr key={k as string} className="border-t border-line transition-colors hover:bg-tungsten/[0.06]">
                    <td className="p-4 font-extrabold text-paper">{k}</td>
                    {[a, b, c].map((v, j) => (
                      <td key={j} className={`p-4 ${j === 1 ? "bg-tungsten/[0.07]" : ""}`}>
                        {v === true ? <Check size={16} strokeWidth={3} className="text-ok" aria-label="Included" />
                          : v === false ? <Minus size={16} className="text-dim" aria-label="Not included" />
                          : (v as string)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        <div className="mx-auto mt-14 max-w-2xl">
          <Reveal className="text-center">
            <h2 className="text-2xl font-extrabold tracking-tight">Fair questions</h2>
          </Reveal>
          <div className="mt-5 flex flex-col gap-2.5">
            {[
              ["Do unused videos roll over?", "No — the Free quota resets on the 1st of each month."],
              ["When do I get access after paying?", "The moment Paddle's webhook lands, usually under a minute."],
              ["Can I cancel anytime?", "Yes — keep paid features until period end, then drop to Free. Nothing is deleted."],
              ["What counts as a video?", "Each composition you create. Re-exports of the same cut are free."],
              ["Annual billing?", "Yes — yearly plans run ~20% cheaper."],
            ].map(([q, a], i) => (
              <Reveal key={q} delay={Math.min(i * 50, 200)}>
                <details className="group rounded-2xl border-[1.5px] border-line bg-panel px-5 py-4 transition-colors open:border-tungsten/50">
                  <summary className="cursor-pointer list-none font-bold text-paper [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center justify-between gap-3">
                      {q}
                      <ArrowRight size={15} className="shrink-0 text-dim transition-transform duration-300 group-open:rotate-90 group-open:text-tungsten" aria-hidden />
                    </span>
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal delay={80}>
          <div className="sticker mx-auto mt-14 max-w-2xl rounded-2xl bg-paper p-8 text-center text-ink">
            <Badge tone="gold" icon={ShieldCheck}>Enterprise</Badge>
            <p className="mt-3 text-xl font-extrabold">Need custom pricing?</p>
            <p className="mt-1 text-sm text-[#6b6357]">Volume seats, SSO, dedicated support and SLAs.</p>
            <Link to="/contact" className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-tungsten px-6 text-sm font-extrabold text-white transition-all hover:brightness-110">
              Talk to sales <ArrowRight size={15} aria-hidden />
            </Link>
          </div>
        </Reveal>
      </section>
    </PublicShell>
  );
}

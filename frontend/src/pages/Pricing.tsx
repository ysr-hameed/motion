import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useBilling, usePlans, useUser } from "@slyxup/ui";
import { ArrowRight, Check, Minus, ShieldCheck, Zap } from "lucide-react";
import { PublicShell } from "~/components/layout";
import { Alert, Badge, Button, LoadingPage } from "~/components/ui";
import { SLYXUP_PROJECT_ID, friendlyAuthError } from "~/lib/stack";

/**
 * Pricing page on REAL billing plans (Paddle-mapped in the Stack dashboard).
 * Free tier is static (enforced by backend quotas); paid tiers render from
 * listPlans so price/interval/features can never drift from checkout.
 */
export default function Pricing() {
  const { plans, loading, error } = usePlans(SLYXUP_PROJECT_ID);
  const { client } = useBilling();
  const { isSignedIn } = useUser();
  const navigate = useNavigate();
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
      <section className="mx-auto max-w-6xl px-4 py-16">
        <p className="eyebrow mb-2 text-center">Pricing</p>
        <h1 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
          Plans that scale <span className="gold-text">with you</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-center text-muted">
          Subscriptions activate via Paddle webhook — access appears once payment clears.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <div className="panel-lift card-hover p-6">
            <p className="flex items-center gap-2 font-semibold text-paper">
              <Zap size={15} className="text-muted" aria-hidden />
              Free
            </p>
            <p className="mt-2 text-3xl font-bold text-paper">$0</p>
            <ul className="mt-4 flex flex-col gap-1.5 text-sm text-muted">
              {["5 videos / month", "720p export", "Watermarked", "Core templates"].map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check size={14} className="mt-0.5 shrink-0 text-ok" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
            <Link to="/signup" className="mt-6 block">
              <Button variant="secondary" className="w-full">Start Free</Button>
            </Link>
          </div>

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
            plans.map((plan) => (
              <div
                key={plan.id}
                className={`panel-lift card-hover relative p-6 ${plan.isPopular ? "border-tungsten/50" : ""}`}
              >
                {plan.isPopular ? (
                  <span className="absolute -top-2.5 left-5 rounded-full bg-tungsten px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink">
                    Popular
                  </span>
                ) : null}
                <p className="font-semibold text-paper">{plan.name}</p>
                <p className="mt-2 text-3xl font-bold text-paper">
                  ${(plan.amount / 100).toFixed(plan.amount % 100 ? 2 : 0)}
                  <span className="text-sm font-normal text-muted">
                    /{plan.interval === "year" ? "yr" : "mo"}
                  </span>
                </p>
                <ul className="mt-4 flex flex-col gap-1.5 text-sm text-muted">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check size={14} className="mt-0.5 shrink-0 text-ok" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-6 w-full"
                  loading={checkoutBusy === plan.id}
                  onClick={() => buy(plan.id)}
                >
                  {isSignedIn ? "Subscribe" : "Sign up to subscribe"}
                </Button>
              </div>
            ))
          )}
        </div>
        {checkoutError ? (
          <div className="mx-auto mt-6 max-w-xl"><Alert>{checkoutError}</Alert></div>
        ) : null}

        <div className="mx-auto mt-14 max-w-3xl">
          <h2 className="text-center text-xl font-bold tracking-tight">Compare plans</h2>
          <div className="mt-4 overflow-x-auto rounded-md border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-dim">
                  <th className="p-3"> </th>
                  <th className="p-3">Free</th>
                  <th className="p-3 text-tungsten">Pro</th>
                  <th className="p-3">Business</th>
                </tr>
              </thead>
              <tbody className="text-muted">
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
                  <tr key={k as string} className="border-b border-line-soft last:border-0">
                    <td className="p-3 text-paper">{k}</td>
                    {[a, b, c].map((v, i) => (
                      <td key={i} className="p-3">
                        {v === true ? (
                          <Check size={14} className="text-ok" aria-label="Included" />
                        ) : v === false ? (
                          <Minus size={14} className="text-dim" aria-label="Not included" />
                        ) : (
                          v as string
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mx-auto mt-14 max-w-2xl">
          <h2 className="text-center text-xl font-bold tracking-tight">FAQ</h2>
          <div className="mt-4 flex flex-col gap-2">
            {[
              ["Do unused videos roll over?", "No — the Free quota resets on the 1st of each month."],
              ["When do I get access after paying?", "The moment Paddle's webhook lands, usually under a minute. The billing page shows a pending state until then."],
              ["Can I cancel anytime?", "Yes — you keep paid features until the end of the billing period, then drop to Free. Nothing is deleted."],
              ["What counts as a video?", "Each composition you create. Exports of the same cut don't consume the video quota."],
              ["Do you offer annual billing?", "Yes — yearly plans are ~20% cheaper when published on this page."],
            ].map(([q, a]) => (
              <details key={q} className="rounded-md border border-line bg-panel px-4 py-3 text-sm">
                <summary className="cursor-pointer font-medium text-paper">{q}</summary>
                <p className="mt-2 text-muted">{a}</p>
              </details>
            ))}
          </div>
        </div>

        <div className="panel-lift mx-auto mt-14 max-w-2xl p-6 text-center">
          <Badge tone="muted" icon={ShieldCheck}>Enterprise</Badge>
          <p className="mt-3 font-semibold text-paper">Need custom pricing?</p>
          <p className="mt-1 text-sm text-muted">Volume seats, SSO, dedicated support and SLAs.</p>
          <Link to="/contact" className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-tungsten px-5 text-sm font-semibold text-ink hover:brightness-110">
            Talk to Sales
            <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}

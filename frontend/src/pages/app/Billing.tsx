import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useBilling, useInvoices, useSubscription } from "@slyxup/ui";
import { Alert, Button, Card, LoadingPage } from "~/components/ui";
import { SLYXUP_PROJECT_ID, friendlyAuthError } from "~/lib/stack";
import { Page, PageHeader, useMotionGet } from "./data";

interface PlanUsage {
  tier: string;
  entitlements: { planId: string | null; status: string; features: string[] } | null;
  subscription: { id: string; status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null;
  usage: {
    compositions: { used: number; limit: number };
    exports: { used: number; limit: number };
  };
}

function Bar({ used, limit }: { used: number; limit: number }) {
  if (limit < 0) return <span className="text-xs text-muted">Unlimited</span>;
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  return (
    <span className="flex items-center gap-2 text-xs text-muted">
      <span className="h-1.5 w-32 overflow-hidden rounded-full bg-line">
        <span className="block h-full bg-tungsten" style={{ width: `${pct}%` }} />
      </span>
      {used} / {limit}
    </span>
  );
}

/** Billing per FRONTEND_DESIGN_PLAN §3.3.7 — real subscription + invoices. */
export default function Billing() {
  const [params] = useSearchParams();
  const plan = useMotionGet<PlanUsage>("/api/billing/plan");
  const sub = useSubscription(SLYXUP_PROJECT_ID);
  const invoices = useInvoices();
  const { client } = useBilling();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = (fn: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    fn()
      .then(() => {
        void sub.reload();
        plan.reload();
      })
      .catch((err: unknown) => setError(friendlyAuthError(err)))
      .finally(() => setBusy(false));
  };

  return (
    <Page>
      <PageHeader
        title="Billing"
        action={
          <Link to="/pricing">
            <Button size="sm" variant="secondary">See Plans</Button>
          </Link>
        }
      />
      {params.get("checkout") === "1" ? (
        <div className="mb-4">
          <Alert tone="info">
            Payment processing — access activates when the Paddle webhook lands
            (usually under a minute). Refresh this page shortly.
          </Alert>
        </div>
      ) : null}
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {plan.loading ? (
        <LoadingPage />
      ) : plan.error ? (
        <Alert>{plan.error}</Alert>
      ) : plan.data ? (
        <div className="flex flex-col gap-4">
          <Card>
            <p className="text-sm font-semibold">
              Current plan: <span className="capitalize text-tungsten">{plan.data.tier}</span>
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex items-center gap-3 text-sm">
                <span className="w-28 text-muted">Compositions</span>
                <Bar used={plan.data.usage.compositions.used} limit={plan.data.usage.compositions.limit} />
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="w-28 text-muted">Exports</span>
                <Bar used={plan.data.usage.exports.used} limit={plan.data.usage.exports.limit} />
              </div>
            </div>
          </Card>

          <Card>
            <p className="mb-2 text-sm font-semibold">Subscription</p>
            {sub.loading ? (
              <LoadingPage />
            ) : sub.subscription ? (
              <div className="text-sm">
                <p className="text-muted">
                  Status: <span className="text-paper">{sub.subscription.status}</span>
                  {sub.subscription.cancelAtPeriodEnd ? " (cancels at period end)" : ""}
                </p>
                {sub.subscription.currentPeriodEnd ? (
                  <p className="mt-1 text-muted">
                    Renews: {new Date(sub.subscription.currentPeriodEnd).toLocaleDateString()}
                  </p>
                ) : null}
                <div className="mt-3 flex gap-2">
                  {sub.subscription.cancelAtPeriodEnd ? (
                    <Button size="sm" variant="secondary" disabled={busy}
                      onClick={() => mutate(() => client.resumeSubscription(SLYXUP_PROJECT_ID))}>
                      Resume
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" disabled={busy}
                      onClick={() => {
                        if (confirm("Cancel at the end of the billing period?")) {
                          mutate(() => client.cancelSubscription(SLYXUP_PROJECT_ID));
                        }
                      }}>
                      Cancel Subscription
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">No active subscription.</p>
            )}
          </Card>

          <Card>
            <p className="mb-2 text-sm font-semibold">Invoices</p>
            {invoices.loading ? (
              <LoadingPage />
            ) : (invoices.invoices ?? []).length === 0 ? (
              <p className="text-sm text-muted">No invoices yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5 text-sm">
                {(invoices.invoices ?? []).map((inv) => (
                  <div key={inv.id} className="flex gap-3">
                    <span className="text-muted">{inv.billedAt ? new Date(inv.billedAt).toLocaleDateString() : "—"}</span>
                    <span>{(inv.amount / 100).toFixed(2)} {inv.currency}</span>
                    <span className="text-muted">{inv.status}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : null}
    </Page>
  );
}

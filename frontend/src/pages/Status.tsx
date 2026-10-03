import { useEffect, useState } from "react";
import { PublicShell } from "~/components/layout";
import { LoadingPage } from "~/components/ui";

const API = import.meta.env.VITE_API_HOST
  ? `https://${String(import.meta.env.VITE_API_HOST).replace(/^https?:\/\//, "")}`
  : "";

export default function Status() {
  const [api, setApi] = useState<"checking" | "up" | "down">("checking");

  useEffect(() => {
    fetch(`${API}/api/health`)
      .then((r) => setApi(r.ok ? "up" : "down"))
      .catch(() => setApi("down"));
  }, []);

  const dot = (s: string) =>
    s === "up" ? "bg-ok" : s === "down" ? "bg-bad" : "bg-dim";

  return (
    <PublicShell>
      <section className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-3xl font-bold tracking-tight">Status</h1>
        <div className="mt-6 flex flex-col gap-2">
          <div className="flex items-center gap-3 rounded-md border border-line bg-panel p-4 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${dot(api)}`} />
            <span className="font-medium">Motion API + Agent</span>
            <span className="ml-auto text-xs text-muted">
              {api === "checking" ? <LoadingPage label="" /> : api === "up" ? "Operational — checked just now" : "Unreachable"}
            </span>
          </div>
          {[
            ["Web app", "up", "This page loaded, so yes."],
            ["Auth (SlyxUp Stack)", "up", "Separate service — sign-in errors appear on /login."],
            ["Billing (Paddle via Stack)", "up", "Entitlements refresh from webhooks."],
          ].map(([name, s, note]) => (
            <div key={name} className="flex items-center gap-3 rounded-md border border-line bg-panel p-4 text-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${dot(s)}`} />
              <span className="font-medium">{name}</span>
              <span className="ml-auto text-xs text-muted">{note}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-dim">Target: 99.5% monthly availability excluding planned maintenance.</p>
      </section>
    </PublicShell>
  );
}

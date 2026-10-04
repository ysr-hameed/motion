import { useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Card, LoadingPage } from "~/components/ui";
import { motionApi } from "~/lib/stack";
import { Page, PageHeader, useMotionGet, useMotionToken } from "./data";

interface Template {
  id: string;
  name: string;
  category: string;
  duration_s: number | null;
  plan_required: string;
  created_by: string | null;
  is_system: number;
}

const CATS = ["all", "product", "social", "logo", "explainer", "event", "branding"];

export default function Templates() {
  const token = useMotionToken();
  const { data, loading, error, reload } = useMotionGet<{ templates: Template[] }>(
    "/api/templates",
  );
  const [cat, setCat] = useState("all");
  const filtered = (data?.templates ?? []).filter(
    (t) => cat === "all" || t.category === cat,
  );

  const remove = (id: string) => {
    if (!confirm("Delete this template?")) return;
    motionApi(token, `/api/templates/${encodeURIComponent(id)}`, { method: "DELETE" })
      .then(() => reload())
      .catch(() => undefined);
  };

  return (
    <Page>
      <PageHeader
        title="Templates"
        action={
          <span className=" text-[11px] text-dim">{filtered.length} cuts ready to direct</span>
        }
      />
      <p className="mb-4 text-sm text-muted">One click loads the brief into Studio — the agent re-skins it with your brand.</p>
      <div className="mb-5 flex flex-wrap gap-2">
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold capitalize transition-all ${cat === c ? "bg-paper text-ink shadow-[2px_2px_0_rgb(217_72_0)]" : "border border-line text-muted hover:border-dim hover:text-paper"}`}
          >
            {c}
          </button>
        ))}
      </div>
      {loading ? (
        <LoadingPage />
      ) : error ? (
        <Alert>{error}</Alert>
      ) : filtered.length === 0 ? (
        <Card><p className="text-center text-sm text-muted">No templates in this category yet.</p></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <div key={t.id} className="spotlight panel-lift card-hover group overflow-hidden p-0">
              <div
                className="relative flex h-28 flex-col justify-end overflow-hidden p-3"
                style={{ background: `linear-gradient(130deg, hsl(${(t.name.length * 53) % 360} 45% 13%), hsl(${((t.name.length * 53) + 70) % 360} 50% 22%))` }}
              >
                <div className="flex items-end gap-1 opacity-70" aria-hidden>
                  {[6, 12, 8, 15, 9, 13, 7, 11, 9, 14].map((h, i) => (
                    <div key={i} className={`w-full rounded-sm ${i % 4 === 1 ? "bg-tungsten" : "bg-white/25"}`} style={{ height: `${h * 2}px` }} />
                  ))}
                </div>
                <div className="absolute right-3 top-3 flex gap-1.5">
                  {t.plan_required !== "free" ? (
                    <span className="rounded-full border border-tungsten/60 bg-black/50 px-2 py-0.5 text-[10px] font-bold uppercase text-tungsten backdrop-blur">
                      {t.plan_required}
                    </span>
                  ) : null}
                  {t.duration_s ? (
                    <span className="rounded-full border border-line bg-black/50 px-2 py-0.5  text-[10px] text-paper backdrop-blur">
                      {t.duration_s}s
                    </span>
                  ) : null}
                </div>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-tungsten text-white shadow-[0_0_28px_rgb(217_72_0/0.6)]">▶</span>
                </div>
              </div>
              <div className="p-4">
                <p className="truncate text-[15px] font-semibold">{t.name}</p>
                <p className="mt-0.5 text-xs capitalize text-dim">{t.category}</p>
                <div className="mt-3 flex gap-2">
                  <Link to="/studio" className="flex-1">
                    <Button size="sm" className="w-full">Use This →</Button>
                  </Link>
                  {t.is_system === 0 ? (
                    <Button size="sm" variant="ghost" onClick={() => remove(t.id)}>
                      Delete
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}

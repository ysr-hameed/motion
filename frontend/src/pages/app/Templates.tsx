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
      <PageHeader title="Templates" />
      <div className="mb-4 flex flex-wrap gap-2">
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`rounded-full px-3 py-1 text-xs capitalize ${cat === c ? "bg-tungsten font-semibold text-ink" : "border border-line text-muted hover:text-paper"}`}
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <Card key={t.id}>
              <p className="flex items-center gap-2 text-sm font-semibold">
                {t.name}
                {t.plan_required !== "free" ? (
                  <span className="rounded-full border border-tungsten/50 px-2 py-0.5 text-[10px] text-tungsten">
                    {t.plan_required}
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-xs capitalize text-dim">
                {t.category}{t.duration_s ? ` · ${t.duration_s}s` : ""}
              </p>
              <div className="mt-3 flex gap-2">
                <Link to="/studio">
                  <Button size="sm">Use This</Button>
                </Link>
                {t.is_system === 0 ? (
                  <Button size="sm" variant="ghost" onClick={() => remove(t.id)}>
                    Delete
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clapperboard, Search } from "lucide-react";
import { Alert, Button, Card, EmptyState, Field, LoadingPage } from "~/components/ui";
import { MotionApiError, motionApi } from "~/lib/stack";
import { Page, PageHeader, useMotionGet, useMotionToken } from "./data";

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  updated_at: number;
  cuts?: number;
}

export default function Projects() {
  const token = useMotionToken();
  const { data, loading, error, reload } = useMotionGet<{ projects: Project[] }>(
    "/api/projects",
  );
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "archived">("all");
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = (data?.projects ?? []).filter(
    (p) =>
      (status === "all" || p.status === status) &&
      (query.trim() === "" ||
        p.name.toLowerCase().includes(query.trim().toLowerCase())),
  );

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    motionApi<{ id: string }>(token, "/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: name.trim() }),
    })
      .then(() => {
        setName("");
        setCreating(false);
        reload();
      })
      .catch((err: unknown) =>
        setActionError(err instanceof Error ? err.message : "Create failed."),
      );
  };

  const setStatusOf = (id: string, next: "active" | "archived") => {
    motionApi(token, `/api/projects/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: next }),
    })
      .then(() => reload())
      .catch((err: unknown) =>
        setActionError(err instanceof Error ? err.message : "Update failed."),
      );
  };

  const remove = (id: string) => {
    if (!confirm("Delete this project? Compositions stay archived in history.")) return;
    motionApi(token, `/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" })
      .then(() => reload())
      .catch((err: unknown) =>
        setActionError(err instanceof Error ? err.message : "Delete failed."),
      );
  };

  return (
    <Page>
      <PageHeader
        title="My Projects"
        action={
          <Button size="sm" className="btn-sheen shadow-[0_0_20px_rgb(217_72_0/0.25)]" onClick={() => setCreating((v) => !v)}>
            + New Project
          </Button>
        }
      />
      <p className="mb-4  text-[11px] text-dim">
        {(data?.projects ?? []).length} projects · {(data?.projects ?? []).filter((p) => p.status === "active").length} active · groups for campaigns & clients
      </p>
      {actionError ? (
        <div className="mb-4">
          <Alert>{actionError}</Alert>
        </div>
      ) : null}
      {creating ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setCreating(false)}
          role="presentation"
        >
          <form
            onSubmit={create}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setCreating(false);
            }}
            className="panel-lift w-full max-w-sm p-5"
            role="dialog"
            aria-modal="true"
            aria-label="New project"
          >
            <p className="text-base font-bold tracking-tight">New project</p>
            <p className="mt-1 text-xs text-muted">Group cuts for a campaign or client.</p>
            <div className="mt-4">
              <Field label="Project name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim()}>
                Create project
              </Button>
            </div>
          </form>
        </div>
      ) : null}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects"
            aria-label="Search projects"
            className="h-10 w-64 rounded-xl border border-line bg-panel pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-dim focus:border-tungsten/60"
          />
        </span>
        {(["all", "active", "archived"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold capitalize transition-all ${status === s ? "bg-paper text-ink shadow-[2px_2px_0_rgb(217_72_0)]" : "border border-line text-muted hover:border-dim hover:text-paper"}`}
          >
            {s}
          </button>
        ))}
      </div>
      {loading ? (
        <LoadingPage />
      ) : error ? (
        <Alert>
          {error}
          {error.includes("not provisioned") ? (
            <span className="mt-1 block text-xs text-muted">
              Run <code>wrangler d1 create motion-db</code>, add the binding, then apply
              backend/src/db/schema.sql.
            </span>
          ) : null}
        </Alert>
      ) : !data?.projects.length ? (
        <EmptyState
          icon={Clapperboard}
          title="No projects yet"
          body="Group compositions into projects to keep campaigns and clients separate."
          action={
            <Link to="/studio">
              <Button>
                Create your first motion
                <ArrowRight size={15} aria-hidden />
              </Button>
            </Link>
          }
        />
      ) : filtered.length === 0 ? (
        <Card><p className="text-center text-sm text-muted">No projects match.</p></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <div key={p.id} className="spotlight panel-lift card-hover group overflow-hidden p-0">
              {/* thumbnail strip — generative gradient per project */}
              <div
                className="relative flex h-24 items-end justify-between overflow-hidden p-3"
                style={{ background: `linear-gradient(120deg, hsl(${(p.name.length * 47) % 360} 40% 14%), hsl(${((p.name.length * 47) + 60) % 360} 55% 20%))` }}
              >
                <div className="flex items-end gap-1 opacity-70" aria-hidden>
                  {[5, 9, 6, 12, 8, 11, 7, 10].map((h, i) => (
                    <div key={i} className={`w-1.5 rounded-sm ${i % 3 === 1 ? "bg-tungsten" : "bg-white/25"}`} style={{ height: `${h * 2}px` }} />
                  ))}
                </div>
                <span className={`rounded-full border px-2 py-0.5  text-[10px] capitalize backdrop-blur ${p.status === "active" ? "border-ok/40 bg-ok/15 text-ok" : "border-line bg-black/40 text-muted"}`}>
                  {p.status}
                </span>
              </div>
              <div className="p-4">
                <p className="truncate text-[15px] font-semibold">{p.name}</p>
                <p className="mt-1  text-[11px] text-dim">
                  {typeof p.cuts === "number" ? `${p.cuts} cut${p.cuts === 1 ? "" : "s"} · ` : null}
                  updated {new Date(p.updated_at).toLocaleDateString()}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to="/studio">
                    <Button size="sm">Open →</Button>
                  </Link>
                  {p.status === "active" ? (
                    <Button size="sm" variant="ghost" onClick={() => setStatusOf(p.id, "archived")}>
                      Archive
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setStatusOf(p.id, "active")}>
                      Restore
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => remove(p.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}

export function isUpgradeError(err: unknown): boolean {
  return err instanceof MotionApiError && err.code === "upgrade_required";
}

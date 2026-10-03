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
          <Button size="sm" onClick={() => setCreating((v) => !v)}>
            + New Project
          </Button>
        }
      />
      {actionError ? (
        <div className="mb-4">
          <Alert>{actionError}</Alert>
        </div>
      ) : null}
      {creating ? (
        <form onSubmit={create} className="mb-4 flex gap-2">
          <div className="flex-1">
            <Field label="Project name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <Button type="submit" className="mt-6" disabled={!name.trim()}>
            Create
          </Button>
        </form>
      ) : null}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects"
            aria-label="Search projects"
            className="h-9 w-56 rounded-md border border-line bg-panel pl-9 pr-3 text-sm outline-none placeholder:text-dim focus:border-tungsten"
          />
        </span>
        {(["all", "active", "archived"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 text-xs capitalize ${status === s ? "bg-tungsten font-semibold text-ink" : "border border-line text-muted hover:text-paper"}`}
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <Card key={p.id}>
              <p className="truncate text-sm font-semibold">{p.name}</p>
              <p className="mt-1 text-xs text-dim">
                {p.status} · {new Date(p.updated_at).toLocaleDateString()}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/studio">
                  <Button size="sm" variant="secondary">Open</Button>
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
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(p.id)}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}

export function isUpgradeError(err: unknown): boolean {
  return err instanceof MotionApiError && err.code === "upgrade_required";
}
